export interface PullRequestPolicyInput {
  readonly isDraft: boolean;
  readonly isClosed: boolean;
  readonly isFork: boolean;
  readonly changedPaths: readonly string[];
}

export type PolicyDecision =
  | { readonly allowed: true; readonly reason: 'same-repo-reviewable' }
  | { readonly allowed: false; readonly reason: 'draft' | 'closed' | 'fork' };

export function decideP0ReviewerEligibility(input: PullRequestPolicyInput): PolicyDecision {
  if (input.isDraft) return { allowed: false, reason: 'draft' };
  if (input.isClosed) return { allowed: false, reason: 'closed' };
  if (input.isFork) return { allowed: false, reason: 'fork' };

  return { allowed: true, reason: 'same-repo-reviewable' };
}
