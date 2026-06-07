export const reviewerTriggerAliases = ['@ai-reviewer', '@claude', '/ai review'] as const;

export interface ReviewerTriggerDecision {
  readonly triggered: boolean;
  readonly matchedAlias?: (typeof reviewerTriggerAliases)[number];
}

export function detectReviewerTrigger(commentBody: string): ReviewerTriggerDecision {
  const normalizedBody = commentBody.toLowerCase();
  const matchedAlias = reviewerTriggerAliases.find((alias) => normalizedBody.includes(alias.toLowerCase()));

  return matchedAlias === undefined ? { triggered: false } : { triggered: true, matchedAlias };
}
