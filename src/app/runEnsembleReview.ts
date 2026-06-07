import { decideP0ReviewerEligibility } from '../domain/policy/pullRequestPolicy.js';
import { evaluateRiskyPaths, type RiskyPathMatch } from '../domain/policy/riskyPathPolicy.js';
import {
  type CandidateReviewFinding,
  type CrossValidatedFinding,
  validateFindingForPublication
} from '../domain/review/crossValidation.js';
import type { PullRequestReviewContext } from '../domain/review/pullRequestReviewContext.js';
import { renderReviewMarkers, type ReviewPublicationState } from '../domain/review/reviewMarker.js';
import type { MergeSignal } from '../domain/review/reviewSignal.js';

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

export type ReviewClaimResult =
  | { readonly status: 'claimed' }
  | { readonly status: 'already-processed-delivery' }
  | { readonly status: 'already-reviewed-sha' };

export interface ReviewPublishedRecord extends ReviewStateRecord {
  readonly postedFindingFingerprints: readonly string[];
}

export type ReviewFailureStage =
  | 'claim-review'
  | 'prepare-workspace'
  | 'run-independent-reviews'
  | 'list-posted-finding-fingerprints'
  | 'publish-review'
  | 'mark-review-published';

export interface ReviewFailureRecord extends ReviewStateRecord {
  readonly stage: ReviewFailureStage;
  readonly message: string;
}

export interface ReviewStateStorePort {
  claimReview(input: ReviewStateRecord): Promise<ReviewClaimResult>;
  listPostedFindingFingerprints(input: ReviewStateKey): Promise<readonly string[]>;
  markReviewPublished(input: ReviewPublishedRecord): Promise<void>;
  markReviewFailed(input: ReviewFailureRecord): Promise<void>;
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
  | 'already-reviewed-sha'
  | 'already-processed-delivery';

export type HumanReviewReason = 'required-risky-path' | 'dropped-blocker-candidate';
export type ReviewRecommendedLabel = 'security-sensitive';

export interface ReviewSkipPublication {
  readonly deliveryId: string;
  readonly reason: ReviewSkipReason;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
}

export interface ReviewFailurePublication extends ReviewFailureRecord {
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
}

export interface ReviewPublicationSummary {
  readonly reviewedSha: string;
  readonly reviewerAgentIds: readonly string[];
  readonly keptFindingCount: number;
  readonly droppedFindingCount: number;
  readonly dedupedFindingCount: number;
  readonly mergeSignal: MergeSignal;
  readonly humanReviewReasons: readonly HumanReviewReason[];
  readonly recommendedLabels: readonly ReviewRecommendedLabel[];
  readonly riskyPathMatches: readonly RiskyPathMatch[];
  readonly markerLines: readonly string[];
}

export interface ReviewPublication {
  readonly context: PullRequestReviewContext;
  readonly findings: readonly CrossValidatedFinding[];
  readonly summary: ReviewPublicationSummary;
}

export interface ReviewPublisherPort {
  publishReview(result: ReviewPublication): Promise<void>;
  publishFailure(failure: ReviewFailurePublication): Promise<void>;
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
      readonly dedupedFindingCount: number;
      readonly mergeSignal: MergeSignal;
    }
  | { readonly status: 'failed'; readonly stage: ReviewFailureStage };

interface FindingValidationResult {
  readonly keptFindings: readonly CrossValidatedFinding[];
  readonly droppedFindings: readonly CandidateReviewFinding[];
}

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
  const stateRecord = { ...stateKey, deliveryId: event.deliveryId };
  let stage: ReviewFailureStage = 'claim-review';
  let claimSucceeded = false;

  try {
    const claim = await ports.stateStore.claimReview(stateRecord);
    if (claim.status !== 'claimed') {
      return publishSkip(event, ports, claim.status);
    }
    claimSucceeded = true;

    const riskyPathDecision = evaluateRiskyPaths(event.changedPaths);

    stage = 'prepare-workspace';
    const context = await ports.workspace.prepareWorkspace(toWorkspaceRequest(event));

    stage = 'run-independent-reviews';
    const orchestratedReview = await ports.orchestrator.runIndependentReviews(context);
    const validation = validateFindings(orchestratedReview);

    stage = 'list-posted-finding-fingerprints';
    const alreadyPostedFingerprints = await ports.stateStore.listPostedFindingFingerprints(stateKey);
    const findings = filterPreviouslyPostedFindings(validation.keptFindings, alreadyPostedFingerprints);
    const dedupedFindingCount = validation.keptFindings.length - findings.length;
    const droppedFindingCount = validation.droppedFindings.length;
    const reviewDecision = decideMergeSignal({
      keptFindings: validation.keptFindings,
      droppedFindings: validation.droppedFindings,
      riskyPathMatches: riskyPathDecision.matches
    });
    const summary = buildReviewPublicationSummary({
      reviewedSha: event.headSha,
      reviewerAgentIds: orchestratedReview.reviewerAgentIds,
      keptFindingCount: validation.keptFindings.length,
      droppedFindingCount,
      dedupedFindingCount,
      mergeSignal: reviewDecision.mergeSignal,
      humanReviewReasons: reviewDecision.humanReviewReasons,
      recommendedLabels: reviewDecision.recommendedLabels,
      riskyPathMatches: riskyPathDecision.matches
    });

    stage = 'publish-review';
    await ports.publisher.publishReview({ context, findings, summary });

    stage = 'mark-review-published';
    await ports.stateStore.markReviewPublished({
      ...stateRecord,
      postedFindingFingerprints: findings.map((finding) => finding.fingerprint)
    });

    return {
      status: 'published',
      keptFindingCount: validation.keptFindings.length,
      droppedFindingCount,
      dedupedFindingCount,
      mergeSignal: reviewDecision.mergeSignal
    };
  } catch (error) {
    const failure = {
      ...stateRecord,
      stage,
      message: errorMessage(error)
    };

    await ports.publisher.publishFailure(failure);
    if (claimSucceeded) {
      await ports.stateStore.markReviewFailed(failure);
    }

    return { status: 'failed', stage };
  }
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

function validateFindings(review: OrchestratedReviewResult): FindingValidationResult {
  const keptFindings: CrossValidatedFinding[] = [];
  const droppedFindings: CandidateReviewFinding[] = [];

  for (const finding of review.candidateFindings) {
    const validatedFinding = validateFindingForPublication(
      finding,
      review.corroboratingAgentIdsByFindingId[finding.id] ?? []
    );

    if (validatedFinding === undefined) {
      droppedFindings.push(finding);
    } else {
      keptFindings.push(validatedFinding);
    }
  }

  return { keptFindings, droppedFindings };
}

function filterPreviouslyPostedFindings(
  findings: readonly CrossValidatedFinding[],
  alreadyPostedFingerprints: readonly string[]
): readonly CrossValidatedFinding[] {
  const alreadyPosted = new Set(alreadyPostedFingerprints);

  return findings.filter((finding) => !alreadyPosted.has(finding.fingerprint));
}

function decideMergeSignal(input: {
  readonly keptFindings: readonly CrossValidatedFinding[];
  readonly droppedFindings: readonly CandidateReviewFinding[];
  readonly riskyPathMatches: readonly RiskyPathMatch[];
}): {
  readonly mergeSignal: MergeSignal;
  readonly humanReviewReasons: readonly HumanReviewReason[];
  readonly recommendedLabels: readonly ReviewRecommendedLabel[];
} {
  const humanReviewReasons: HumanReviewReason[] = [];
  const recommendedLabels: ReviewRecommendedLabel[] = [];

  if (input.riskyPathMatches.some((match) => match.severity === 'required')) {
    humanReviewReasons.push('required-risky-path');
    recommendedLabels.push('security-sensitive');
  }

  if (input.droppedFindings.some((finding) => finding.severity === 'blocker')) {
    humanReviewReasons.push('dropped-blocker-candidate');
  }

  if (humanReviewReasons.length > 0) {
    return {
      mergeSignal: 'HUMAN_REVIEW_REQUIRED',
      humanReviewReasons,
      recommendedLabels
    };
  }

  if (input.keptFindings.some((finding) => finding.severity === 'blocker')) {
    return {
      mergeSignal: 'BLOCKED',
      humanReviewReasons,
      recommendedLabels
    };
  }

  return {
    mergeSignal: 'PASS',
    humanReviewReasons,
    recommendedLabels
  };
}

function buildReviewPublicationSummary(input: {
  readonly reviewedSha: string;
  readonly reviewerAgentIds: readonly string[];
  readonly keptFindingCount: number;
  readonly droppedFindingCount: number;
  readonly dedupedFindingCount: number;
  readonly mergeSignal: MergeSignal;
  readonly humanReviewReasons: readonly HumanReviewReason[];
  readonly recommendedLabels: readonly ReviewRecommendedLabel[];
  readonly riskyPathMatches: readonly RiskyPathMatch[];
}): ReviewPublicationSummary {
  return {
    ...input,
    markerLines: renderReviewMarkers({
      reviewerModel: input.reviewerAgentIds.join('+'),
      reviewedSha: input.reviewedSha,
      epoch: 1,
      round: 1,
      reviewState: toReviewPublicationState(input.mergeSignal),
      mergeSignal: input.mergeSignal
    })
  };
}

function toReviewPublicationState(mergeSignal: MergeSignal): ReviewPublicationState {
  return mergeSignal === 'HUMAN_REVIEW_REQUIRED' ? 'HUMAN_REVIEW_REQUIRED' : 'REVIEWED';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
