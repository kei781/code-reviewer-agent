export interface CodebaseEvidence {
  readonly filePath: string;
  readonly lineStart: number;
  readonly lineEnd?: number;
  readonly observedInLocalCheckout: true;
}

export interface CandidateReviewFinding {
  readonly id: string;
  readonly reviewerAgentId: 'reviewer-claude-code' | 'reviewer-codex';
  readonly title: string;
  readonly description: string;
  readonly evidence: readonly CodebaseEvidence[];
  readonly severity: 'blocker' | 'suggestion';
}

export interface CrossValidatedFinding extends CandidateReviewFinding {
  readonly validationStatus: 'publishable';
  readonly validatedByOrchestrator: true;
  readonly corroboratingAgentIds: readonly string[];
}

export function validateFindingForPublication(
  finding: CandidateReviewFinding,
  corroboratingAgentIds: readonly string[]
): CrossValidatedFinding | undefined {
  const hasLocalCodebaseEvidence =
    finding.evidence.length > 0 && finding.evidence.every((evidence) => evidence.observedInLocalCheckout);

  if (!hasLocalCodebaseEvidence || corroboratingAgentIds.length === 0) {
    return undefined;
  }

  return {
    ...finding,
    validationStatus: 'publishable',
    validatedByOrchestrator: true,
    corroboratingAgentIds
  };
}
