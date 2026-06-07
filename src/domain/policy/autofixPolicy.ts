import type { ActionableMarker } from "../fixer/actionableMarker.js";
import { evaluateRiskyPaths, type RiskyPathDecision } from "./riskyPathPolicy.js";
import {
  decideModelPairIndependence,
  type ModelPairPolicyDecision,
  type ModelPairPolicyInput
} from "./modelPairPolicy.js";

export type AutofixBlockReason =
  | "missing-autofix-label"
  | "draft-pr"
  | "closed-pr"
  | "fork-pr"
  | "blocked-label"
  | "risky-path"
  | "attempt-cap-reached"
  | "stale-review"
  | "no-actionable-items"
  | "model-pair-not-independent";

export type AutofixRecommendedLabel = "needs-human-review" | "security-sensitive" | "ai-blocked";
export type AutofixNextAction = "fixer-analyze" | "skip";

export interface AutofixPolicyInput {
  readonly labels: readonly string[];
  readonly isDraft: boolean;
  readonly isClosed: boolean;
  readonly isFork: boolean;
  readonly changedPaths: readonly string[];
  readonly fixAttempts: number;
  readonly maxFixAttempts: number;
  readonly currentHeadSha: string;
  readonly reviewerReviewedSha: string;
  readonly actionableMarkers: readonly ActionableMarker[];
  readonly modelPair: ModelPairPolicyInput;
}

export interface AutofixPolicyDecision {
  readonly allowed: boolean;
  readonly nextAction: AutofixNextAction;
  readonly reasons: readonly AutofixBlockReason[];
  readonly recommendedLabels: readonly AutofixRecommendedLabel[];
  readonly actionableMarkers: readonly ActionableMarker[];
  readonly riskyPathDecision: RiskyPathDecision;
  readonly modelPairDecision: ModelPairPolicyDecision;
}

const autofixLabel = "ai-autofix";
const blockingLabels = ["do-not-merge", "needs-human-review", "security-sensitive", "ai-blocked"] as const;

export function decideAutofixEligibility(input: AutofixPolicyInput): AutofixPolicyDecision {
  const labels = new Set(input.labels.map(normalizeLabel));
  const reasons: AutofixBlockReason[] = [];
  const recommendedLabels = new Set<AutofixRecommendedLabel>();
  const riskyPathDecision = evaluateRiskyPaths(input.changedPaths);
  const modelPairDecision = decideModelPairIndependence(input.modelPair);

  if (!labels.has(autofixLabel)) {
    reasons.push("missing-autofix-label");
  }

  if (input.isDraft) {
    reasons.push("draft-pr");
  }

  if (input.isClosed) {
    reasons.push("closed-pr");
  }

  if (input.isFork) {
    reasons.push("fork-pr");
  }

  if (blockingLabels.some((label) => labels.has(label))) {
    reasons.push("blocked-label");
    recommendExistingBlockingLabels(labels, recommendedLabels);
  }

  if (riskyPathDecision.hasRequiredRisk || riskyPathDecision.hasOptionalRisk) {
    reasons.push("risky-path");
    recommendedLabels.add(riskyPathDecision.hasRequiredRisk ? "security-sensitive" : "needs-human-review");
  }

  if (input.fixAttempts >= input.maxFixAttempts) {
    reasons.push("attempt-cap-reached");
    recommendedLabels.add("needs-human-review");
  }

  if (input.reviewerReviewedSha !== input.currentHeadSha) {
    reasons.push("stale-review");
  }

  if (input.actionableMarkers.length === 0) {
    reasons.push("no-actionable-items");
  }

  if (!modelPairDecision.allowed) {
    reasons.push("model-pair-not-independent");
    recommendedLabels.add("needs-human-review");
  }

  const allowed = reasons.length === 0;

  return {
    allowed,
    nextAction: allowed ? "fixer-analyze" : "skip",
    reasons,
    recommendedLabels: [...recommendedLabels],
    actionableMarkers: input.actionableMarkers,
    riskyPathDecision,
    modelPairDecision
  };
}

function recommendExistingBlockingLabels(
  labels: ReadonlySet<string>,
  recommendedLabels: Set<AutofixRecommendedLabel>
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

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}
