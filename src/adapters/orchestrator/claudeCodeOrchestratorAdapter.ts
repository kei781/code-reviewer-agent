import {
  buildOrchestratorHarness,
  orchestratorOutputEndMarker,
  orchestratorOutputStartMarker
} from "../../agents/orchestratorHarness.js";
import type {
  OrchestratedReviewResult,
  ReviewOrchestratorPort
} from "../../app/runEnsembleReview.js";
import type {
  CandidateReviewFinding,
  CodebaseEvidence
} from "../../domain/review/crossValidation.js";
import type { PullRequestReviewContext } from "../../domain/review/pullRequestReviewContext.js";
import { getProcessEnvironment, type ConfigEnvSource } from "../../shared/config.js";
import type { ModelEgressGuard } from "../network/modelEgressGuard.js";
import type { CommandRunner } from "../workspace/commandRunner.js";
import { buildAgentEnvironment, isSecretEnvironmentKey } from "./agentEnvironment.js";

export {
  orchestratorOutputEndMarker,
  orchestratorOutputStartMarker
} from "../../agents/orchestratorHarness.js";

export interface ClaudeCodeOrchestratorAdapterOptions {
  readonly command: string;
  readonly commandArgs?: readonly string[];
  readonly commandRunner: CommandRunner;
  readonly egressGuard: ModelEgressGuard;
  readonly baseEnv?: ConfigEnvSource;
  readonly executionCwd?: string;
  readonly timeoutMs?: number;
}

const defaultClaudeCodeArgs = ["--print"] as const;

export function createClaudeCodeOrchestratorAdapter(
  options: ClaudeCodeOrchestratorAdapterOptions
): ReviewOrchestratorPort {
  const baseEnv = options.baseEnv ?? getProcessEnvironment();
  const commandArgs = options.commandArgs ?? defaultClaudeCodeArgs;

  return {
    async runIndependentReviews(context) {
      const session = await options.egressGuard.enter();

      try {
        const result = await options.commandRunner.run({
          executable: options.command,
          args: [...commandArgs, buildOrchestratorHarness(context)],
          env: buildAgentEnvironment(baseEnv, session.env),
          envMode: "replace",
          ...(options.executionCwd === undefined ? {} : { cwd: options.executionCwd }),
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
        });

        if (result.exitCode !== 0) {
          throw new Error(
            `Claude Code orchestrator command failed with exit code ${result.exitCode}: ${sanitizeForAgentError(
              `${result.stderr}\n${result.stdout}`.trim(),
              { ...baseEnv, ...session.env }
            )}`
          );
        }

        return parseOrchestratorOutput(result.stdout);
      } finally {
        await session.dispose();
      }
    }
  };
}

function parseOrchestratorOutput(stdout: string): OrchestratedReviewResult {
  const startIndex = stdout.indexOf(orchestratorOutputStartMarker);
  if (startIndex < 0) {
    throw new Error("Invalid orchestrator review result: missing start marker");
  }

  const jsonStart = startIndex + orchestratorOutputStartMarker.length;
  const endIndex = stdout.indexOf(orchestratorOutputEndMarker, jsonStart);
  if (endIndex < 0) {
    throw new Error("Invalid orchestrator review result: missing end marker");
  }

  const json = stdout.slice(jsonStart, endIndex).trim();
  if (json.length === 0) {
    throw new Error("Invalid orchestrator review result: empty JSON payload");
  }

  try {
    return parseReviewResult(JSON.parse(json));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid orchestrator review result")) {
      throw error;
    }

    throw new Error("Invalid orchestrator review result: JSON payload is not parseable");
  }
}

function parseReviewResult(value: unknown): OrchestratedReviewResult {
  const record = readRecord(value, "result");
  const reviewerAgentIds = readStringArray(record.reviewerAgentIds, "reviewerAgentIds");
  const candidateFindings = readFindingArray(record.candidateFindings);
  const corroboratingAgentIdsByFindingId = readStringArrayRecord(
    record.corroboratingAgentIdsByFindingId,
    "corroboratingAgentIdsByFindingId"
  );

  return {
    reviewerAgentIds,
    candidateFindings,
    corroboratingAgentIdsByFindingId
  };
}

function readFindingArray(value: unknown): readonly CandidateReviewFinding[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid orchestrator review result: candidateFindings must be an array");
  }

  return value.map(readCandidateFinding);
}

function readCandidateFinding(value: unknown): CandidateReviewFinding {
  const record = readRecord(value, "candidateFinding");
  const reviewerAgentId = readReviewerAgentId(record.reviewerAgentId);
  const severity = readSeverity(record.severity);

  return {
    id: readString(record.id, "candidateFinding.id"),
    fingerprint: readString(record.fingerprint, "candidateFinding.fingerprint"),
    reviewerAgentId,
    title: readString(record.title, "candidateFinding.title"),
    description: readString(record.description, "candidateFinding.description"),
    evidence: readEvidenceArray(record.evidence),
    severity
  };
}

function readEvidenceArray(value: unknown): readonly CodebaseEvidence[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid orchestrator review result: evidence must be an array");
  }

  return value.map(readEvidence);
}

function readEvidence(value: unknown): CodebaseEvidence {
  const record = readRecord(value, "evidence");
  const lineStart = readPositiveInteger(record.lineStart, "evidence.lineStart");
  const lineEnd = record.lineEnd;

  if (record.observedInLocalCheckout !== true) {
    throw new Error("Invalid orchestrator review result: evidence must be observed in the local checkout");
  }

  if (lineEnd !== undefined) {
    const parsedLineEnd = readPositiveInteger(lineEnd, "evidence.lineEnd");
    if (parsedLineEnd < lineStart) {
      throw new Error("Invalid orchestrator review result: evidence.lineEnd must not precede lineStart");
    }

    return {
      filePath: readString(record.filePath, "evidence.filePath"),
      lineStart,
      lineEnd: parsedLineEnd,
      observedInLocalCheckout: true
    };
  }

  return {
    filePath: readString(record.filePath, "evidence.filePath"),
    lineStart,
    observedInLocalCheckout: true
  };
}

function readStringArrayRecord(value: unknown, label: string): Readonly<Record<string, readonly string[]>> {
  const record = readRecord(value, label);
  const parsed: Record<string, readonly string[]> = {};

  for (const [key, strings] of Object.entries(record)) {
    parsed[key] = readStringArray(strings, `${label}.${key}`);
  }

  return parsed;
}

function readStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid orchestrator review result: ${label} must be an array`);
  }

  return value.map((item, index) => readString(item, `${label}[${index}]`));
}

function readReviewerAgentId(value: unknown): CandidateReviewFinding["reviewerAgentId"] {
  if (value === "reviewer-claude-code" || value === "reviewer-codex") {
    return value;
  }

  throw new Error("Invalid orchestrator review result: reviewerAgentId is not supported");
}

function readSeverity(value: unknown): CandidateReviewFinding["severity"] {
  if (value === "blocker" || value === "suggestion") {
    return value;
  }

  throw new Error("Invalid orchestrator review result: severity is not supported");
}

function readPositiveInteger(value: unknown, label: string): number {
  if (Number.isSafeInteger(value) && typeof value === "number" && value > 0) {
    return value;
  }

  throw new Error(`Invalid orchestrator review result: ${label} must be a positive integer`);
}

function readString(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Invalid orchestrator review result: ${label} must be a non-empty string`);
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error(`Invalid orchestrator review result: ${label} must be an object`);
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
