import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrchestratedReviewResult } from "../../../app/runEnsembleReview.js";
import type { PullRequestReviewContext } from "../../../domain/review/pullRequestReviewContext.js";
import type { ModelEgressGuard, ModelEgressSession } from "../../network/modelEgressGuard.js";
import type { CommandInvocation, CommandRunner } from "../../workspace/commandRunner.js";
import {
  createClaudeCodeOrchestratorAdapter,
  orchestratorOutputEndMarker,
  orchestratorOutputStartMarker
} from "../claudeCodeOrchestratorAdapter.js";

const context: PullRequestReviewContext = {
  repositoryUrl: "https://github.com/kei781/sql-agent.git",
  repositoryFullName: "kei781/sql-agent",
  pullRequestNumber: 42,
  baseBranch: "main",
  headBranch: "feature/sql-guard",
  headSha: "abc123",
  localWorkspacePath: "/tmp/sql-agent-pr-42"
};

const reviewResult: OrchestratedReviewResult = {
  reviewerAgentIds: ["reviewer-claude-code", "reviewer-codex"],
  candidateFindings: [
    {
      id: "sql-limit-bypass",
      fingerprint: "security:sql-limit-bypass:src/query.ts",
      reviewerAgentId: "reviewer-claude-code",
      title: "LIMIT can be bypassed",
      description: "The query path accepts model SQL without enforcing the default LIMIT.",
      severity: "blocker",
      evidence: [
        {
          filePath: "src/query.ts",
          lineStart: 12,
          lineEnd: 18,
          observedInLocalCheckout: true
        }
      ]
    }
  ],
  corroboratingAgentIdsByFindingId: {
    "sql-limit-bypass": ["reviewer-codex"]
  }
};

function createJsonOutput(result: unknown): string {
  return [
    "diagnostic output before the result",
    orchestratorOutputStartMarker,
    JSON.stringify(result),
    orchestratorOutputEndMarker,
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

describe("createClaudeCodeOrchestratorAdapter", () => {
  it("runs Claude Code inside a guarded replace-env session and parses structured review output", async () => {
    const calls: string[] = [];
    const commands: CommandInvocation[] = [];
    const commandRunner: CommandRunner = {
      async run(command) {
        calls.push("run-command");
        commands.push(command);
        return {
          exitCode: 0,
          stdout: createJsonOutput(reviewResult),
          stderr: ""
        };
      }
    };
    const adapter = createClaudeCodeOrchestratorAdapter({
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
        REVIEW_SERVER_DATABASE_PATH: "/server/state.sqlite",
        CLAUDE_CODE_COMMAND: "claude"
      }
    });

    const result = await adapter.runIndependentReviews(context);

    assert.deepEqual(result, reviewResult);
    assert.deepEqual(calls, ["enter-egress", "run-command", "dispose-egress"]);
    assert.equal(commands.length, 1);

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
    assert.match(command?.args[1] ?? "", /Orchestrator Harness/);
    assert.match(command?.args[1] ?? "", /AI_REVIEW_RESULT_JSON_START/);
    assert.match(command?.args[1] ?? "", /Local workspace path: \/tmp\/sql-agent-pr-42/u);
  });

  it("does not default the agent process cwd to the PR-controlled checkout", async () => {
    const commands: CommandInvocation[] = [];
    const adapter = createClaudeCodeOrchestratorAdapter({
      command: "claude",
      commandRunner: {
        async run(command) {
          commands.push(command);
          return { exitCode: 0, stdout: createJsonOutput(reviewResult), stderr: "" };
        }
      },
      egressGuard: createGuard([])
    });

    await adapter.runIndependentReviews(context);

    assert.equal(commands[0]?.cwd, undefined);
    assert.match(commands[0]?.args[1] ?? "", /Local workspace path: \/tmp\/sql-agent-pr-42/u);
  });

  it("does not run Claude Code when the egress guard fails closed", async () => {
    let commandRunCount = 0;
    const adapter = createClaudeCodeOrchestratorAdapter({
      command: "claude",
      commandRunner: {
        async run() {
          commandRunCount += 1;
          return { exitCode: 0, stdout: createJsonOutput(reviewResult), stderr: "" };
        }
      },
      egressGuard: {
        async enter() {
          throw new Error("egress policy missing");
        }
      }
    });

    await assert.rejects(() => adapter.runIndependentReviews(context), /egress policy missing/);
    assert.equal(commandRunCount, 0);
  });

  it("disposes the egress session and sanitizes command failures", async () => {
    const calls: string[] = [];
    const adapter = createClaudeCodeOrchestratorAdapter({
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
      () => adapter.runIndependentReviews(context),
      (error) => error instanceof Error && /Claude Code orchestrator command failed/u.test(error.message) && !error.message.includes("secret-token")
    );
    assert.deepEqual(calls, ["enter-egress", "run-command", "dispose-egress"]);
  });

  it("rejects output that is missing valid structured review JSON", async () => {
    const adapter = createClaudeCodeOrchestratorAdapter({
      command: "claude",
      commandRunner: {
        async run() {
          return {
            exitCode: 0,
            stdout: createJsonOutput({ reviewerAgentIds: ["reviewer-claude-code"], candidateFindings: [{}] }),
            stderr: ""
          };
        }
      },
      egressGuard: createGuard([])
    });

    await assert.rejects(() => adapter.runIndependentReviews(context), /Invalid orchestrator review result/u);
  });
});
