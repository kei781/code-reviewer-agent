import {
  buildFollowUpResponderHarness,
  followUpResponseOutputEndMarker,
  followUpResponseOutputStartMarker
} from "../../agents/followUpResponderHarness.js";
import type {
  FollowUpResponderPort,
  FollowUpResponse,
  FollowUpResponseRequest
} from "../../app/respondToReviewerMention.js";
import type { MergeSignal } from "../../domain/review/reviewSignal.js";
import { getProcessEnvironment, type ConfigEnvSource } from "../../shared/config.js";
import { log } from "../../shared/log.js";
import type { ModelEgressGuard } from "../network/modelEgressGuard.js";
import type { CommandRunner } from "../workspace/commandRunner.js";
import { buildAgentEnvironment, isSecretEnvironmentKey } from "./agentEnvironment.js";

export {
  followUpResponseOutputEndMarker,
  followUpResponseOutputStartMarker
} from "../../agents/followUpResponderHarness.js";

export interface ClaudeCodeFollowUpResponderAdapterOptions {
  readonly command: string;
  readonly commandArgs?: readonly string[];
  readonly commandRunner: CommandRunner;
  readonly egressGuard: ModelEgressGuard;
  readonly baseEnv?: ConfigEnvSource;
  readonly executionCwd?: string;
  readonly timeoutMs?: number;
}

const defaultClaudeCodeArgs = ["--print"] as const;

export function createClaudeCodeFollowUpResponderAdapter(
  options: ClaudeCodeFollowUpResponderAdapterOptions
): FollowUpResponderPort {
  const baseEnv = options.baseEnv ?? getProcessEnvironment();
  const commandArgs = options.commandArgs ?? defaultClaudeCodeArgs;

  return {
    async generateFollowUpResponse(request) {
      const session = await options.egressGuard.enter();
      const sessionEnv = { ...baseEnv, ...session.env };
      let hasPrimaryError = false;

      try {
        const result = await options.commandRunner.run({
          executable: options.command,
          args: [...commandArgs, buildFollowUpResponderHarness(request)],
          env: buildAgentEnvironment(baseEnv, session.env),
          envMode: "replace",
          ...(options.executionCwd === undefined ? {} : { cwd: options.executionCwd }),
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
        });

        if (result.exitCode !== 0) {
          throw new Error(
            `Claude Code follow-up responder command failed with exit code ${result.exitCode}: ${sanitizeForAgentError(
              `${result.stderr}\n${result.stdout}`.trim(),
              sessionEnv
            )}`
          );
        }

        return parseFollowUpResponseOutput(result.stdout, request);
      } catch (error) {
        hasPrimaryError = true;
        throw error;
      } finally {
        await disposeEgressSession({
          session,
          hasPrimaryError,
          env: sessionEnv
        });
      }
    }
  };
}

async function disposeEgressSession(input: {
  readonly session: { dispose(): Promise<void> };
  readonly hasPrimaryError: boolean;
  readonly env: ConfigEnvSource;
}): Promise<void> {
  try {
    await input.session.dispose();
  } catch (error) {
    const message = sanitizeForAgentError(error instanceof Error ? error.message : "unknown error", input.env);

    if (input.hasPrimaryError) {
      log("Claude Code follow-up responder egress cleanup failed", {
        level: "error",
        metadata: { message }
      });
      return;
    }

    throw new Error(`Claude Code follow-up responder egress cleanup failed: ${message}`);
  }
}

function parseFollowUpResponseOutput(stdout: string, request: FollowUpResponseRequest): FollowUpResponse {
  const startIndex = stdout.indexOf(followUpResponseOutputStartMarker);
  if (startIndex < 0) {
    throw new Error("Invalid follow-up response: missing start marker");
  }

  const jsonStart = startIndex + followUpResponseOutputStartMarker.length;
  const endIndex = stdout.indexOf(followUpResponseOutputEndMarker, jsonStart);
  if (endIndex < 0) {
    throw new Error("Invalid follow-up response: missing end marker");
  }

  const json = stdout.slice(jsonStart, endIndex).trim();
  if (json.length === 0) {
    throw new Error("Invalid follow-up response: empty JSON payload");
  }

  try {
    return parseFollowUpResponse(JSON.parse(json), request.headSha);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid follow-up response")) {
      throw error;
    }

    throw new Error("Invalid follow-up response: JSON payload is not parseable");
  }
}

function parseFollowUpResponse(value: unknown, expectedHeadSha: string): FollowUpResponse {
  const record = readRecord(value, "response");
  const body = readString(record.body, "body");
  const responseScope = readResponseScope(record.responseScope);
  const reviewedSha = readString(record.reviewedSha, "reviewedSha");

  if (reviewedSha !== expectedHeadSha) {
    throw new Error("Invalid follow-up response: reviewedSha must match the current head SHA");
  }

  const mergeSignal = readOptionalMergeSignal(record.mergeSignal);
  if (mergeSignal === undefined) {
    return {
      body,
      responseScope,
      reviewedSha
    };
  }

  return {
    body,
    responseScope,
    reviewedSha,
    mergeSignal
  };
}

function readResponseScope(value: unknown): "analysis-only" {
  if (value === "analysis-only") {
    return value;
  }

  throw new Error("Invalid follow-up response: responseScope must be analysis-only");
}

function readOptionalMergeSignal(value: unknown): MergeSignal | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "PASS" || value === "BLOCKED" || value === "HUMAN_REVIEW_REQUIRED") {
    return value;
  }

  throw new Error("Invalid follow-up response: mergeSignal is not supported");
}

function readString(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Invalid follow-up response: ${label} must be a non-empty string`);
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error(`Invalid follow-up response: ${label} must be an object`);
}

function sanitizeForAgentError(message: string, env: ConfigEnvSource): string {
  let sanitized = message.length === 0 ? "no stderr/stdout" : message;

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.length > 0 && isSecretEnvironmentKey(key)) {
      sanitized = sanitized.split(value).join("[redacted]");
    }
  }

  return sanitized;
}
