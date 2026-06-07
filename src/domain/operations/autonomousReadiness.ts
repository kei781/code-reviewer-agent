import type { RequiredCheckStatus } from "../merge/mergeGatePolicy.js";
import type { VerdictCheckPublication } from "../merge/verdictCheck.js";
import { evaluateRiskyPaths, type RiskyPathDecision } from "../policy/riskyPathPolicy.js";

export type AutonomousReadinessBlockReason =
  | "missing-automerge-label"
  | "blocked-label"
  | "stale-verdict"
  | "verdict-not-success"
  | "ci-not-success"
  | "branch-protection-not-satisfied"
  | "missing-adr-amendment"
  | "missing-low-risk-policy"
  | "missing-trusted-author-allowlist"
  | "human-review-relaxation-not-approved"
  | "missing-rollback-procedure"
  | "fork-pr"
  | "risky-path"
  | "not-low-risk-path"
  | "merge-conflict"
  | "attempt-cap-reached"
  | "untrusted-author"
  | "model-pair-not-independent";

export type AutonomousReadinessRecommendedLabel = "needs-human-review" | "security-sensitive" | "ai-blocked";
export type AutonomousReadinessNextAction = "allow-low-risk-autonomous-evaluation" | "skip";

export interface AutonomousPolicyApproval {
  readonly adrAmendmentApproved: boolean;
  readonly lowRiskPathPatterns: readonly string[];
  readonly trustedAuthorLogins: readonly string[];
  readonly humanReviewRelaxationApproved: boolean;
  readonly rollbackProcedureDocumented: boolean;
}

export interface AutonomousReadinessInput {
  readonly labels: readonly string[];
  readonly currentHeadSha: string;
  readonly verdictCheck: VerdictCheckPublication;
  readonly requiredChecks: readonly RequiredCheckStatus[];
  readonly branchProtectionSatisfied: boolean;
  readonly policyApproval: AutonomousPolicyApproval;
  readonly isFork: boolean;
  readonly changedPaths: readonly string[];
  readonly hasMergeConflict: boolean;
  readonly fixAttempts: number;
  readonly maxFixAttempts: number;
  readonly prAuthorLogin: string;
  readonly modelPairIndependent: boolean;
}

export interface AutonomousReadinessDecision {
  readonly allowed: boolean;
  readonly nextAction: AutonomousReadinessNextAction;
  readonly reasons: readonly AutonomousReadinessBlockReason[];
  readonly recommendedLabels: readonly AutonomousReadinessRecommendedLabel[];
  readonly requiredCheckStatuses: readonly RequiredCheckStatus[];
  readonly riskyPathDecision: RiskyPathDecision;
  readonly lowRiskPathPatterns: readonly string[];
  readonly unmatchedLowRiskPaths: readonly string[];
}

const automergeLabel = "ai-automerge";
const blockingLabels = ["do-not-merge", "needs-human-review", "security-sensitive", "ai-blocked"] as const;

export function decideAutonomousReadiness(input: AutonomousReadinessInput): AutonomousReadinessDecision {
  const labels = new Set(input.labels.map(normalizeComparable));
  const reasons: AutonomousReadinessBlockReason[] = [];
  const recommendedLabels = new Set<AutonomousReadinessRecommendedLabel>();
  const riskyPathDecision = evaluateRiskyPaths(input.changedPaths);
  const unmatchedLowRiskPaths = findUnmatchedLowRiskPaths(input.changedPaths, input.policyApproval.lowRiskPathPatterns);

  if (!labels.has(automergeLabel)) {
    reasons.push("missing-automerge-label");
  }

  if (blockingLabels.some((label) => labels.has(label))) {
    reasons.push("blocked-label");
    recommendExistingBlockingLabels(labels, recommendedLabels);
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

  if (!input.policyApproval.adrAmendmentApproved) {
    reasons.push("missing-adr-amendment");
    recommendedLabels.add("needs-human-review");
  }

  if (input.policyApproval.lowRiskPathPatterns.length === 0) {
    reasons.push("missing-low-risk-policy");
    recommendedLabels.add("needs-human-review");
  }

  if (input.policyApproval.trustedAuthorLogins.length === 0) {
    reasons.push("missing-trusted-author-allowlist");
    recommendedLabels.add("needs-human-review");
  }

  if (!input.policyApproval.humanReviewRelaxationApproved) {
    reasons.push("human-review-relaxation-not-approved");
    recommendedLabels.add("needs-human-review");
  }

  if (!input.policyApproval.rollbackProcedureDocumented) {
    reasons.push("missing-rollback-procedure");
    recommendedLabels.add("needs-human-review");
  }

  if (input.isFork) {
    reasons.push("fork-pr");
    recommendedLabels.add("needs-human-review");
  }

  if (riskyPathDecision.hasRequiredRisk || riskyPathDecision.hasOptionalRisk) {
    reasons.push("risky-path");
    recommendedLabels.add(riskyPathDecision.hasRequiredRisk ? "security-sensitive" : "needs-human-review");
  }

  if (input.changedPaths.length === 0) {
    reasons.push("not-low-risk-path");
    recommendedLabels.add("needs-human-review");
  }

  if (unmatchedLowRiskPaths.length > 0) {
    reasons.push("not-low-risk-path");
    recommendedLabels.add("needs-human-review");
  }

  if (input.hasMergeConflict) {
    reasons.push("merge-conflict");
    recommendedLabels.add("needs-human-review");
  }

  if (input.fixAttempts >= input.maxFixAttempts) {
    reasons.push("attempt-cap-reached");
    recommendedLabels.add("needs-human-review");
  }

  if (!isTrustedAuthor(input.prAuthorLogin, input.policyApproval.trustedAuthorLogins)) {
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
    nextAction: allowed ? "allow-low-risk-autonomous-evaluation" : "skip",
    reasons,
    recommendedLabels: [...recommendedLabels],
    requiredCheckStatuses: input.requiredChecks,
    riskyPathDecision,
    lowRiskPathPatterns: input.policyApproval.lowRiskPathPatterns,
    unmatchedLowRiskPaths
  };
}

function allRequiredChecksSucceeded(requiredChecks: readonly RequiredCheckStatus[]): boolean {
  return requiredChecks.length > 0 && requiredChecks.every((check) => check.status === "success");
}

function findUnmatchedLowRiskPaths(paths: readonly string[], lowRiskPathPatterns: readonly string[]): readonly string[] {
  if (lowRiskPathPatterns.length === 0) {
    return paths;
  }

  return paths.filter((path) => !lowRiskPathPatterns.some((pattern) => matchesPathPattern(path, pattern)));
}

function matchesPathPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }

  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(`^${normalizedPattern.split("*").map(escapeRegExp).join(".*")}$`);
    return regex.test(normalizedPath);
  }

  return normalizedPath === normalizedPattern;
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/");
}

function isTrustedAuthor(prAuthorLogin: string, trustedAuthorLogins: readonly string[]): boolean {
  const author = normalizeComparable(prAuthorLogin);
  return trustedAuthorLogins.map(normalizeComparable).includes(author);
}

function recommendExistingBlockingLabels(
  labels: ReadonlySet<string>,
  recommendedLabels: Set<AutonomousReadinessRecommendedLabel>
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

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}
