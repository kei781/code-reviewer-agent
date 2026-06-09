import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { FollowUpResponse, FollowUpResponseRequest } from "../../../app/respondToReviewerMention.js";
import { resetLogSink, setLogSink } from "../../../shared/log.js";
import type { ModelEgressGuard, ModelEgressSession } from "../../network/modelEgressGuard.js";
import type { CommandInvocation, CommandRunner } from "../../workspace/commandRunner.js";
import {
  createClaudeCodeFollowUpResponderAdapter,
  followUpResponseOutputEndMarker,
  followUpResponseOutputStartMarker
} from "../claudeCodeFollowUpResponderAdapter.js";

const request: FollowUpResponseRequest = {
  repositoryFullName: "kei781/sql-agent",
  pullRequestNumber: 42,
  headSha: "abc123",
  commentId: 9001,
  commentRevisionKey: "sha256:comment-body",
  commentBody: "@ai-reviewer explain the stale approval concern",
  commentAuthorLogin: "kei781",
  matchedAlias: "@ai-reviewer",
  labels: ["bug"],
  blockedLabels: [],
  allowedResponseActions: ["analysis", "explanation", "risk-clarification", "re-review-signal"]
};

const response: FollowUpResponse = {
  body: "The concern is analysis-only and should be checked against the current head SHA.",
  responseScope: "analysis-only",
  reviewedSha: "abc123",
  mergeSignal: "PASS"
};

function createJsonOutput(result: unknown): string {
  return [
    "diagnostic output before the result",
    followUpResponseOutputStartMarker,
    JSON.stringify(result),
    followUpResponseOutputEndMarker,
    "diagnostic output after the result"
  ].join("\n");
}

function createGuard(calls: string[], env: Readonly<Record<string, string>> = {}): ModelEgressGuard {
  return {
    async enter(): Promise<ModelEgressSession> {
      calls.push("enter-egress");
      return {
        env,
        async dispose() {
          calls.push("dispose-egress");
        }
      };
    }
  };
}

beforeEach(() => {
  setLogSink(() => undefined);
});

afterEach(() => {
  resetLogSink();
});

describe("createClaudeCodeFollowUpResponderAdapter", () => {
  it("runs Claude Code in a guarded replace-env session and parses analysis-only follow-up output", async () => {
    const calls: string[] = [];
    const commands: CommandInvocation[] = [];
    const commandRunner: CommandRunner = {
      async run(command) {
        calls.push("run-command");
        commands.push(command);
        return {
          exitCode: 0,
          stdout: createJsonOutput(response),
          stderr: ""
        };
      }
    };
    const adapter = createClaudeCodeFollowUpResponderAdapter({
      command: "claude",
      commandArgs: ["--print"],
      timeoutMs: 9_000,
      commandRunner,
      egressGuard: createGuard(calls, { MODEL_EGRESS_POLICY_ID: "policy-1" }),
      executionCwd: "/tmp/review-server-safe-cwd",
      baseEnv: {
        PATH: "path-value",
        HOME: "/home/reviewer",
        GITHUB_TOKEN: "github-token",
        GITHUB_WEBHOOK_SECRET: "webhook-secret",
        CLAUDE_CODE_COMMAND: "claude"
      }
    });

    const result = await adapter.generateFollowUpResponse(request);

    assert.deepEqual(result, response);
    assert.deepEqual(calls, ["enter-egress", "run-command", "dispose-egress"]);

    const command = commands[0];
    assert.equal(command?.executable, "claude");
    assert.equal(command?.cwd, "/tmp/review-server-safe-cwd");
    assert.equal(command?.timeoutMs, 9_000);
    assert.equal(command?.envMode, "replace");
    assert.deepEqual(command?.env, {
      PATH: "path-value",
      HOME: "/home/reviewer",
      MODEL_EGRESS_POLICY_ID: "policy-1"
    });
    assert.deepEqual(command?.args.slice(0, 1), ["--print"]);
    assert.match(command?.args[1] ?? "", /Follow-up Responder Harness/u);
    assert.match(command?.args[1] ?? "", /AI_FOLLOW_UP_RESPONSE_JSON_START/u);
    assert.match(command?.args[1] ?? "", /Response scope must be analysis-only/u);
    assert.match(command?.args[1] ?? "", /Do not edit code, approve, merge, resolve threads, or publish GitHub comments/u);
    assert.doesNotMatch(command?.args[1] ?? "", /fixer|apply patch|merge authorization/iu);
  });

  it("does not run Claude Code when the egress guard fails closed", async () => {
    let commandRunCount = 0;
    const adapter = createClaudeCodeFollowUpResponderAdapter({
      command: "claude",
      commandRunner: {
        async run() {
          commandRunCount += 1;
          return { exitCode: 0, stdout: createJsonOutput(response), stderr: "" };
        }
      },
      egressGuard: {
        async enter() {
          throw new Error("egress policy missing");
        }
      }
    });

    await assert.rejects(() => adapter.generateFollowUpResponse(request), /egress policy missing/u);
    assert.equal(commandRunCount, 0);
  });

  it("disposes the egress session and sanitizes command failures", async () => {
    const calls: string[] = [];
    const adapter = createClaudeCodeFollowUpResponderAdapter({
      command: "claude",
      commandRunner: {
        async run() {
          calls.push("run-command");
          return {
            exitCode: 2,
            stdout: "",
            stderr: "failed with secret-token"
          };
        }
      },
      egressGuard: createGuard(calls),
      baseEnv: {
        PATH: "path-value",
        GITHUB_TOKEN: "secret-token"
      }
    });

    await assert.rejects(
      () => adapter.generateFollowUpResponse(request),
      (error) =>
        error instanceof Error &&
        /Claude Code follow-up responder command failed/u.test(error.message) &&
        !error.message.includes("secret-token")
    );
    assert.deepEqual(calls, ["enter-egress", "run-command", "dispose-egress"]);
  });

  it("preserves the command failure when egress cleanup also fails", async () => {
    const adapter = createClaudeCodeFollowUpResponderAdapter({
      command: "claude",
      commandRunner: {
        async run() {
          return {
            exitCode: 2,
            stdout: "",
            stderr: "command failed with secret-token"
          };
        }
      },
      egressGuard: {
        async enter() {
          return {
            env: {},
            async dispose() {
              throw new Error("dispose failed with secret-token");
            }
          };
        }
      },
      baseEnv: {
        PATH: "path-value",
        GITHUB_TOKEN: "secret-token"
      }
    });

    await assert.rejects(
      () => adapter.generateFollowUpResponse(request),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Claude Code follow-up responder command failed/u);
        assert.doesNotMatch(error.message, /dispose failed/u);
        assert.doesNotMatch(error.message, /secret-token/u);
        return true;
      }
    );
  });

  it("rejects malformed, unsafe, or stale follow-up output", async () => {
    const adapter = createClaudeCodeFollowUpResponderAdapter({
      command: "claude",
      commandRunner: {
        async run() {
          return {
            exitCode: 0,
            stdout: createJsonOutput({ body: "looks good", responseScope: "approval", reviewedSha: "old-sha" }),
            stderr: ""
          };
        }
      },
      egressGuard: createGuard([])
    });

    await assert.rejects(() => adapter.generateFollowUpResponse(request), /Invalid follow-up response/u);
  });
});
