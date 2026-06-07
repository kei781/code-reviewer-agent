import type { MergeSignal } from './reviewSignal.js';

export type ReviewConvergenceState = 'CONVERGING' | 'CONVERGED_CLEAN' | 'HUMAN_REVIEW_REQUIRED';

export interface ReviewMarkerMetadata {
  readonly reviewerModel: string;
  readonly reviewedSha: string;
  readonly epoch: number;
  readonly round: number;
  readonly convergence: ReviewConvergenceState;
  readonly mergeSignal: MergeSignal;
  readonly passOrigin: 'FIRST_PASS' | 'LOOP_FIXPOINT' | 'NONE';
}

export const reviewSummaryMarker = '<!-- ai-review:summary -->';
export const orchestratorStateMarkerPrefix = '<!-- ai-orchestrator:state=';

export function renderReviewMarkers(metadata: ReviewMarkerMetadata): readonly string[] {
  return [
    reviewSummaryMarker,
    '<!-- ai-review:reviewer-role=R -->',
    `<!-- ai-review:reviewer-model=${metadata.reviewerModel} -->`,
    `<!-- ai-review:reviewed-sha=${metadata.reviewedSha} -->`,
    `<!-- ai-review:epoch=${metadata.epoch} round=${metadata.round} -->`,
    `<!-- ai-review:convergence=${metadata.convergence} -->`,
    `<!-- ai-review:pass-origin=${metadata.passOrigin} -->`,
    `<!-- ai-review:MERGE_SIGNAL=${metadata.mergeSignal} -->`,
    `<!-- ai-orchestrator:state=${metadata.convergence} -->`,
    `<!-- ai-orchestrator:epoch=${metadata.epoch} -->`,
    `<!-- ai-orchestrator:last-reviewer-reviewed-sha=${metadata.reviewedSha} -->`
  ];
}
