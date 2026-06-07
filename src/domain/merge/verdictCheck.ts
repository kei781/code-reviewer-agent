import type { ConvergencePassOrigin, ConvergenceState } from "../convergence/convergenceState.js";
import type { MergeSignal } from "../review/reviewSignal.js";

export type VerdictCheckName = "ai-review/verdict";
export type VerdictCheckConclusion = "success" | "failure" | "neutral";

export type VerdictCheckReason =
  | "converged-clean"
  | "first-pass-clean"
  | "blockers-found"
  | "human-review-required"
  | "unsupported-pr"
  | "stale-review"
  | "not-ready";

export interface VerdictCheckInput {
  readonly currentHeadSha: string;
  readonly reviewedHeadSha: string;
  readonly mergeSignal: MergeSignal;
  readonly convergenceState: ConvergenceState;
  readonly passOrigin: ConvergencePassOrigin;
  readonly unresolvedBlockerCount: number;
  readonly supportedPullRequest: boolean;
}

export interface VerdictCheckPublication {
  readonly name: VerdictCheckName;
  readonly headSha: string;
  readonly conclusion: VerdictCheckConclusion;
  readonly reasons: readonly VerdictCheckReason[];
}

export function decideVerdictCheck(input: VerdictCheckInput): VerdictCheckPublication {
  if (!input.supportedPullRequest) {
    return verdict(input.currentHeadSha, "neutral", ["unsupported-pr"]);
  }

  if (input.reviewedHeadSha !== input.currentHeadSha) {
    return verdict(input.currentHeadSha, "neutral", ["stale-review"]);
  }

  if (input.mergeSignal === "HUMAN_REVIEW_REQUIRED") {
    return verdict(input.currentHeadSha, "neutral", ["human-review-required"]);
  }

  if (input.mergeSignal === "BLOCKED" || input.unresolvedBlockerCount > 0) {
    return verdict(input.currentHeadSha, "failure", ["blockers-found"]);
  }

  if (input.convergenceState === "CONVERGED_CLEAN") {
    return verdict(input.currentHeadSha, "success", ["converged-clean"]);
  }

  if (input.mergeSignal === "PASS" && input.passOrigin === "FIRST_PASS" && input.unresolvedBlockerCount === 0) {
    return verdict(input.currentHeadSha, "success", ["first-pass-clean"]);
  }

  return verdict(input.currentHeadSha, "neutral", ["not-ready"]);
}

function verdict(
  headSha: string,
  conclusion: VerdictCheckConclusion,
  reasons: readonly VerdictCheckReason[]
): VerdictCheckPublication {
  return {
    name: "ai-review/verdict",
    headSha,
    conclusion,
    reasons
  };
}
