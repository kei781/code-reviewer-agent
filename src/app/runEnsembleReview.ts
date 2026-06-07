import { decideP0ReviewerEligibility } from '../domain/policy/pullRequestPolicy.js';
import {
  type CandidateReviewFinding,
  type CrossValidatedFinding,
  validateFindingForPublication
} from '../domain/review/crossValidation.js';
import { renderReviewMarkers, type ReviewConvergenceState } from '../domain/review/reviewMarker.js';
import type { MergeSignal } from '../domain/review/reviewSignal.js';
import type { PullRequestReviewContext } from '../orchestration/reviewServerPipeline.js';

export type PullRequestWebhookAction = 'opened' | 'synchronize' | 'reopened' | 'ready_for_review';

export interface PullRequestWebhookEvent {
  readonly deliveryId: string;
  readonly action: string;
  readonly repositoryUrl: string;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly isDraft: boolean;
  readonly isClosed: boolean;
  readonly isFork: boolean;
  readonly changedPaths: readonly string[];
}

export interface WorkspacePreparationRequest {
  readonly repositoryUrl: string;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headSha: string;
}

export interface ReviewStateKey {
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
}

export interface ReviewStateRecord extends ReviewStateKey {
  readonly deliveryId: string;
}

export interface ReviewStateStorePort {
  hasReviewedSha(input: ReviewStateKey): Promise<boolean>;
  markReviewedSha(input: ReviewStateRecord): Promise<void>;
}

export interface ReviewWorkspacePort {
  prepareWorkspace(context: WorkspacePreparationRequest): Promise<PullRequestReviewContext>;
}

export interface OrchestratedReviewResult {
  readonly reviewerAgentIds: readonly string[];
  readonly candidateFindings: readonly CandidateReviewFinding[];
  readonly corroboratingAgentIdsByFindingId: Readonly<Record<string, readonly string[]>>;
}

export interface ReviewOrchestratorPort {
  runIndependentReviews(context: PullRequestReviewContext): Promise<OrchestratedReviewResult>;
}

export type ReviewSkipReason =
  | 'unsupported-action'
  | 'invalid-payload'
  | 'draft'
  | 'closed'
  | 'fork'
  | 'already-reviewed-sha';

export interface ReviewSkipPublication {
  readonly deliveryId: string;
  readonly reason: ReviewSkipReason;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
}

export interface ReviewPublicationSummary {
  readonly reviewedSha: string;
  readonly reviewerAgentIds: readonly string[];
  readonly keptFindingCount: number;
  readonly droppedFindingCount: number;
  readonly mergeSignal: MergeSignal;
  readonly markerLines: readonly string[];
}

export interface ReviewPublication {
  readonly context: PullRequestReviewContext;
  readonly findings: readonly CrossValidatedFinding[];
  readonly summary: ReviewPublicationSummary;
}

export interface ReviewPublisherPort {
  publishReview(result: ReviewPublication): Promise<void>;
  publishSkip(skip: ReviewSkipPublication): Promise<void>;
}

export interface ReviewServerPorts {
  readonly stateStore: ReviewStateStorePort;
  readonly workspace: ReviewWorkspacePort;
  readonly orchestrator: ReviewOrchestratorPort;
  readonly publisher: ReviewPublisherPort;
}

export type ReviewRunResult =
  | { readonly status: 'skipped'; readonly reason: ReviewSkipReason }
  | {
      readonly status: 'published';
      readonly keptFindingCount: number;
      readonly droppedFindingCount: number;
      readonly mergeSignal: MergeSignal;
    };

const supportedWebhookActions = ['opened', 'synchronize', 'reopened', 'ready_for_review'] as const;

export async function runEnsembleReview(
  event: PullRequestWebhookEvent,
  ports: ReviewServerPorts
): Promise<ReviewRunResult> {
  if (!isSupportedWebhookAction(event.action)) {
    return publishSkip(event, ports, 'unsupported-action');
  }

  if (!isValidWebhookEvent(event)) {
    return publishSkip(event, ports, 'invalid-payload');
  }

  const policyDecision = decideP0ReviewerEligibility({
    isDraft: event.isDraft,
    isClosed: event.isClosed,
    isFork: event.isFork,
    changedPaths: event.changedPaths
  });

  if (!policyDecision.allowed) {
    return publishSkip(event, ports, policyDecision.reason);
  }

  const stateKey = toStateKey(event);
  if (await ports.stateStore.hasReviewedSha(stateKey)) {
    return publishSkip(event, ports, 'already-reviewed-sha');
  }

  const context = await ports.workspace.prepareWorkspace(toWorkspaceRequest(event));
  const orchestratedReview = await ports.orchestrator.runIndependentReviews(context);
  const findings = crossValidateFindings(orchestratedReview);
  const droppedFindingCount = orchestratedReview.candidateFindings.length - findings.length;
  const mergeSignal = findings.some((finding) => finding.severity === 'blocker') ? 'BLOCKED' : 'PASS';
  const summary = buildReviewPublicationSummary({
    reviewedSha: event.headSha,
    reviewerAgentIds: orchestratedReview.reviewerAgentIds,
    keptFindingCount: findings.length,
    droppedFindingCount,
    mergeSignal
  });

  await ports.publisher.publishReview({ context, findings, summary });
  await ports.stateStore.markReviewedSha({ ...stateKey, deliveryId: event.deliveryId });

  return {
    status: 'published',
    keptFindingCount: findings.length,
    droppedFindingCount,
    mergeSignal
  };
}

function isSupportedWebhookAction(action: string): action is PullRequestWebhookAction {
  return supportedWebhookActions.some((supportedAction) => supportedAction === action);
}

function isValidWebhookEvent(event: PullRequestWebhookEvent): boolean {
  return (
    isNonEmpty(event.deliveryId) &&
    isNonEmpty(event.repositoryUrl) &&
    isNonEmpty(event.repositoryFullName) &&
    Number.isSafeInteger(event.pullRequestNumber) &&
    event.pullRequestNumber > 0 &&
    isNonEmpty(event.baseBranch) &&
    isNonEmpty(event.headBranch) &&
    isNonEmpty(event.headSha)
  );
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function toWorkspaceRequest(event: PullRequestWebhookEvent): WorkspacePreparationRequest {
  return {
    repositoryUrl: event.repositoryUrl,
    repositoryFullName: event.repositoryFullName,
    pullRequestNumber: event.pullRequestNumber,
    baseBranch: event.baseBranch,
    headBranch: event.headBranch,
    headSha: event.headSha
  };
}

function toStateKey(event: PullRequestWebhookEvent): ReviewStateKey {
  return {
    repositoryFullName: event.repositoryFullName,
    pullRequestNumber: event.pullRequestNumber,
    headSha: event.headSha
  };
}

async function publishSkip(
  event: PullRequestWebhookEvent,
  ports: ReviewServerPorts,
  reason: ReviewSkipReason
): Promise<ReviewRunResult> {
  await ports.publisher.publishSkip({
    deliveryId: event.deliveryId,
    reason,
    repositoryFullName: event.repositoryFullName,
    pullRequestNumber: event.pullRequestNumber,
    headSha: event.headSha
  });

  return { status: 'skipped', reason };
}

function crossValidateFindings(review: OrchestratedReviewResult): readonly CrossValidatedFinding[] {
  return review.candidateFindings.flatMap((finding) => {
    const validatedFinding = validateFindingForPublication(
      finding,
      review.corroboratingAgentIdsByFindingId[finding.id] ?? []
    );

    return validatedFinding === undefined ? [] : [validatedFinding];
  });
}

function buildReviewPublicationSummary(input: {
  readonly reviewedSha: string;
  readonly reviewerAgentIds: readonly string[];
  readonly keptFindingCount: number;
  readonly droppedFindingCount: number;
  readonly mergeSignal: MergeSignal;
}): ReviewPublicationSummary {
  return {
    ...input,
    markerLines: renderReviewMarkers({
      reviewerModel: input.reviewerAgentIds.join('+'),
      reviewedSha: input.reviewedSha,
      epoch: 1,
      round: 1,
      convergence: toConvergenceState(input.mergeSignal),
      mergeSignal: input.mergeSignal
    })
  };
}

function toConvergenceState(mergeSignal: MergeSignal): ReviewConvergenceState {
  return mergeSignal === 'PASS' ? 'CONVERGED_CLEAN' : 'HUMAN_REVIEW_REQUIRED';
}
