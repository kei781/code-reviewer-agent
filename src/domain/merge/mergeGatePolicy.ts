import { evaluateRiskyPaths, type RiskyPathDecision } from "../policy/riskyPathPolicy.js";
import type { VerdictCheckPublication } from "./verdictCheck.js";

export type RequiredCheckConclusion = "success" | "failure" | "neutral" | "cancelled" | "timed-out" | "skipped" | "pending";

export interface RequiredCheckStatus {
  readonly name: string;
  readonly status: RequiredCheckConclusion;
}

export type ConservativeMergeGateBlockReason =
  | "missing-automerge-label"
  | "blocked-label"
  | "stale-verdict"
  | "verdict-not-success"
  | "ci-not-success"
  | "branch-protection-not-satisfied"
  | "human-review-not-satisfied"
  | "stale-human-review"
  | "fork-pr"
  | "risky-path"
  | "merge-conflict"
  | "attempt-cap-reached"
  | "untrusted-author"
  | "model-pair-not-independent";

export type ConservativeMergeGateRecommendedLabel = "needs-human-review" | "security-sensitive" | "ai-blocked";
export type ConservativeMergeGateNextAction = "enable-github-auto-merge" | "skip";
export type ConservativeMergeMethod = "squash";

export interface ConservativeMergeGateInput {
  readonly labels: readonly string[];
  readonly currentHeadSha: string;
  readonly verdictCheck: VerdictCheckPublication;
  readonly requiredChecks: readonly RequiredCheckStatus[];
  readonly branchProtectionSatisfied: boolean;
  readonly requiredHumanReviewSatisfied: boolean;
  readonly staleApproval: boolean;
  readonly isFork: boolean;
  readonly changedPaths: readonly string[];
  readonly hasMergeConflict: boolean;
  readonly fixAttempts: number;
  readonly maxFixAttempts: number;
  readonly prAuthorLogin: string;
  readonly trustedAuthorLogins: readonly string[];
  readonly modelPairIndependent: boolean;
}

export interface ConservativeMergeGateDecision {
  readonly allowed: boolean;
  readonly nextAction: ConservativeMergeGateNextAction;
  readonly mergeMethod: ConservativeMergeMethod;
  readonly reasons: readonly ConservativeMergeGateBlockReason[];
  readonly recommendedLabels: readonly ConservativeMergeGateRecommendedLabel[];
  readonly requiredCheckStatuses: readonly RequiredCheckStatus[];
  readonly riskyPathDecision: RiskyPathDecision;
}

const automergeLabel = "ai-automerge";
const blockingLabels = ["do-not-merge", "needs-human-review", "security-sensitive", "ai-blocked"] as const;

export function decideConservativeMergeGate(input: ConservativeMergeGateInput): ConservativeMergeGateDecision {
  const labels = new Set(input.labels.map(normalizeComparable));
  const reasons: ConservativeMergeGateBlockReason[] = [];
  const recommendedLabels = new Set<ConservativeMergeGateRecommendedLabel>();
  const riskyPathDecision = evaluateRiskyPaths(input.changedPaths);

  if (!labels.has(automergeLabel)) {
    reasons.push("missing-automerge-label");
  }

  if (blockingLabels.some((label) => labels.has(label))) {
    reasons.push("blocked-label");
    recommendBlockingLabels(labels, recommendedLabels);
  }

  if (input.verdictCheck.headSha !== input.currentHeadSha) {
    reasons.push("stale-verdict");
  }

  if (input.verdictCheck.conclusion !== "success") {
    reasons.push("verdict-not-success");
  }

  if (!allRequiredChecksSucceeded(input.requiredChecks)) {
    reasons.push("ci-not-success");
  }

  if (!input.branchProtectionSatisfied) {
    reasons.push("branch-protection-not-satisfied");
    recommendedLabels.add("needs-human-review");
  }

  if (!input.requiredHumanReviewSatisfied) {
    reasons.push("human-review-not-satisfied");
    recommendedLabels.add("needs-human-review");
  }

  if (input.staleApproval) {
    reasons.push("stale-human-review");
    recommendedLabels.add("needs-human-review");
  }

  if (input.isFork) {
    reasons.push("fork-pr");
  }

  if (riskyPathDecision.hasRequiredRisk || riskyPathDecision.hasOptionalRisk) {
    reasons.push("risky-path");
    recommendedLabels.add(riskyPathDecision.hasRequiredRisk ? "security-sensitive" : "needs-human-review");
  }

  if (input.hasMergeConflict) {
    reasons.push("merge-conflict");
    recommendedLabels.add("needs-human-review");
  }

  if (input.fixAttempts >= input.maxFixAttempts) {
    reasons.push("attempt-cap-reached");
    recommendedLabels.add("needs-human-review");
  }

  if (!isTrustedAuthor(input.prAuthorLogin, input.trustedAuthorLogins)) {
    reasons.push("untrusted-author");
    recommendedLabels.add("needs-human-review");
  }

  if (!input.modelPairIndependent) {
    reasons.push("model-pair-not-independent");
    recommendedLabels.add("needs-human-review");
  }

  const allowed = reasons.length === 0;

  return {
    allowed,
    nextAction: allowed ? "enable-github-auto-merge" : "skip",
    mergeMethod: "squash",
    reasons,
    recommendedLabels: [...recommendedLabels],
    requiredCheckStatuses: input.requiredChecks,
    riskyPathDecision
  };
}

function allRequiredChecksSucceeded(requiredChecks: readonly RequiredCheckStatus[]): boolean {
  return requiredChecks.length > 0 && requiredChecks.every((check) => check.status === "success");
}

function isTrustedAuthor(prAuthorLogin: string, trustedAuthorLogins: readonly string[]): boolean {
  const author = normalizeComparable(prAuthorLogin);
  return trustedAuthorLogins.map(normalizeComparable).includes(author);
}

function recommendBlockingLabels(
  labels: ReadonlySet<string>,
  recommendedLabels: Set<ConservativeMergeGateRecommendedLabel>
): void {
  if (labels.has("needs-human-review") || labels.has("do-not-merge")) {
    recommendedLabels.add("needs-human-review");
  }

  if (labels.has("security-sensitive")) {
    recommendedLabels.add("security-sensitive");
  }

  if (labels.has("ai-blocked")) {
    recommendedLabels.add("ai-blocked");
  }
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase();
}
