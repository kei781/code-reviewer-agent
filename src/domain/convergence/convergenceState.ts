import type { MergeSignal } from "../review/reviewSignal.js";

export type ConvergenceTerminalState = "CONVERGED_CLEAN" | "STALLED_OSCILLATING" | "CAPPED_WITH_OPEN";
export type ConvergenceState = "CONVERGING" | ConvergenceTerminalState;
export type ConvergencePassOrigin = "FIRST_PASS" | "LOOP_FIXPOINT" | "NONE";

export type ConvergenceReason =
  | "stale-review"
  | "fixer-diff-introduced-blocker"
  | "max-fix-attempts-reached"
  | "blocker-count-not-decreasing"
  | "repeated-blocker-class"
  | "open-blockers"
  | "reviewer-did-not-pass";

export type ConvergenceRecommendedLabel = "needs-human-review";

export interface ConvergenceStateInput {
  readonly currentHeadSha: string;
  readonly reviewerReviewedSha: string;
  readonly mergeSignal: MergeSignal;
  readonly unresolvedBlockerCount: number;
  readonly previousUnresolvedBlockerCount: number;
  readonly repeatedBlockerClasses: readonly string[];
  readonly fixAttempts: number;
  readonly maxFixAttempts: number;
  readonly fixerDiffIntroducedBlocker: boolean;
}

export interface ConvergenceDecision {
  readonly state: ConvergenceState;
  readonly passOrigin: ConvergencePassOrigin;
  readonly reasons: readonly ConvergenceReason[];
  readonly recommendedLabels: readonly ConvergenceRecommendedLabel[];
}

export function decideConvergenceState(input: ConvergenceStateInput): ConvergenceDecision {
  if (input.reviewerReviewedSha !== input.currentHeadSha) {
    return continuing(["stale-review"]);
  }

  if (canConvergeClean(input)) {
    return {
      state: "CONVERGED_CLEAN",
      passOrigin: input.fixAttempts === 0 ? "FIRST_PASS" : "LOOP_FIXPOINT",
      reasons: [],
      recommendedLabels: []
    };
  }

  if (input.unresolvedBlockerCount > 0 && input.fixAttempts >= input.maxFixAttempts) {
    return humanRequired("CAPPED_WITH_OPEN", ["max-fix-attempts-reached"]);
  }

  const stallReasons = getStallReasons(input);
  if (stallReasons.length > 0) {
    return humanRequired("STALLED_OSCILLATING", stallReasons);
  }

  if (input.unresolvedBlockerCount > 0) {
    return continuing(["open-blockers"]);
  }

  return continuing(["reviewer-did-not-pass"]);
}

function canConvergeClean(input: ConvergenceStateInput): boolean {
  return input.mergeSignal === "PASS" && input.unresolvedBlockerCount === 0 && !input.fixerDiffIntroducedBlocker;
}

function getStallReasons(input: ConvergenceStateInput): ConvergenceReason[] {
  const reasons: ConvergenceReason[] = [];

  if (input.fixerDiffIntroducedBlocker) {
    reasons.push("fixer-diff-introduced-blocker");
  }

  if (input.unresolvedBlockerCount > 0 && input.unresolvedBlockerCount >= input.previousUnresolvedBlockerCount) {
    reasons.push("blocker-count-not-decreasing");
  }

  if (input.repeatedBlockerClasses.length > 0) {
    reasons.push("repeated-blocker-class");
  }

  return reasons;
}

function continuing(reasons: readonly ConvergenceReason[]): ConvergenceDecision {
  return {
    state: "CONVERGING",
    passOrigin: "NONE",
    reasons,
    recommendedLabels: []
  };
}

function humanRequired(state: "STALLED_OSCILLATING" | "CAPPED_WITH_OPEN", reasons: readonly ConvergenceReason[]): ConvergenceDecision {
  return {
    state,
    passOrigin: "NONE",
    reasons,
    recommendedLabels: ["needs-human-review"]
  };
}
