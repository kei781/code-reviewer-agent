import type { ConvergenceTerminalState } from "../convergence/convergenceState.js";

export type OperationalAlertReason =
  | "human-review-required"
  | "stalled"
  | "capped-with-open"
  | "merge-gate-blocked"
  | "cost-budget-exceeded"
  | "runtime-budget-exceeded"
  | "workflow-failure"
  | "rollback-needed"
  | "review-threads-open";

export type OperationalRecommendedChannel = "github-comment" | "slack" | "github-discussion";

export type OperationalRunbookId =
  | "manual-review"
  | "inspect-loop-state"
  | "check-branch-protection"
  | "retry-orchestrator"
  | "rollback-procedure"
  | "cost-review"
  | "resolve-review-threads";

export interface OperationalFollowUpInput {
  readonly terminalState: ConvergenceTerminalState | "CONVERGING";
  readonly mergeGateAllowed: boolean;
  readonly mergeGateReasons: readonly string[];
  readonly costUsd: number;
  readonly costBudgetUsd: number;
  readonly runtimeMinutes: number;
  readonly runtimeBudgetMinutes: number;
  readonly workflowFailed: boolean;
  readonly rollbackRequested: boolean;
  readonly unresolvedThreadCount: number;
  readonly humanReviewRequired: boolean;
}

export interface OperationalFollowUpPlan {
  readonly shouldAlert: boolean;
  readonly alertReasons: readonly OperationalAlertReason[];
  readonly recommendedChannels: readonly OperationalRecommendedChannel[];
  readonly runbookIds: readonly OperationalRunbookId[];
}

export function planOperationalFollowUp(input: OperationalFollowUpInput): OperationalFollowUpPlan {
  const alertReasons = new Set<OperationalAlertReason>();
  const recommendedChannels = new Set<OperationalRecommendedChannel>();
  const runbookIds = new Set<OperationalRunbookId>();

  if (input.terminalState === "STALLED_OSCILLATING") {
    alertReasons.add("human-review-required");
    alertReasons.add("stalled");
    runbookIds.add("manual-review");
    runbookIds.add("inspect-loop-state");
  }

  if (input.terminalState === "CAPPED_WITH_OPEN") {
    alertReasons.add("human-review-required");
    alertReasons.add("capped-with-open");
    runbookIds.add("manual-review");
    runbookIds.add("inspect-loop-state");
  }

  if (input.humanReviewRequired) {
    alertReasons.add("human-review-required");
    runbookIds.add("manual-review");
  }

  if (!input.mergeGateAllowed) {
    alertReasons.add("merge-gate-blocked");
    addMergeGateRunbook(input.mergeGateReasons, runbookIds);
  }

  if (input.costUsd > input.costBudgetUsd) {
    alertReasons.add("cost-budget-exceeded");
    runbookIds.add("cost-review");
  }

  if (input.runtimeMinutes > input.runtimeBudgetMinutes) {
    alertReasons.add("runtime-budget-exceeded");
    runbookIds.add("retry-orchestrator");
  }

  if (input.workflowFailed) {
    alertReasons.add("workflow-failure");
    runbookIds.add("retry-orchestrator");
  }

  if (input.rollbackRequested) {
    alertReasons.add("rollback-needed");
    runbookIds.add("rollback-procedure");
  }

  if (input.unresolvedThreadCount > 0) {
    alertReasons.add("review-threads-open");
    runbookIds.add("resolve-review-threads");
  }

  addChannels(alertReasons, recommendedChannels);

  return {
    shouldAlert: alertReasons.size > 0,
    alertReasons: [...alertReasons],
    recommendedChannels: [...recommendedChannels],
    runbookIds: [...runbookIds]
  };
}

function addMergeGateRunbook(mergeGateReasons: readonly string[], runbookIds: Set<OperationalRunbookId>): void {
  if (mergeGateReasons.some((reason) => reason.includes("branch-protection") || reason.includes("required-check"))) {
    runbookIds.add("check-branch-protection");
    return;
  }

  runbookIds.add("manual-review");
}

function addChannels(
  alertReasons: ReadonlySet<OperationalAlertReason>,
  recommendedChannels: Set<OperationalRecommendedChannel>
): void {
  if (alertReasons.size === 0) {
    return;
  }

  recommendedChannels.add("github-comment");

  if (
    alertReasons.has("workflow-failure") ||
    alertReasons.has("rollback-needed") ||
    alertReasons.has("cost-budget-exceeded") ||
    alertReasons.has("runtime-budget-exceeded")
  ) {
    recommendedChannels.add("slack");
  }

  if (
    alertReasons.has("human-review-required") ||
    alertReasons.has("stalled") ||
    alertReasons.has("capped-with-open") ||
    alertReasons.has("review-threads-open")
  ) {
    recommendedChannels.add("github-discussion");
  }
}
