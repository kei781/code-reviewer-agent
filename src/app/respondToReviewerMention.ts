import { detectReviewerTrigger, reviewerTriggerAliases } from "../domain/policy/reviewerTriggerPolicy.js";
import type { MergeSignal } from "../domain/review/reviewSignal.js";

export type ReviewerMentionCommentAction = "created" | "edited";

export interface ReviewerMentionCommentEvent {
  readonly deliveryId: string;
  readonly action: string;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly commentId: number;
  readonly commentBody: string;
  readonly commentAuthorLogin: string;
  readonly isPullRequest: boolean;
  readonly isClosed: boolean;
  readonly isFork: boolean;
  readonly labels: readonly string[];
}

export type ReviewerTriggerAlias = (typeof reviewerTriggerAliases)[number];

export const followUpAllowedResponseActions = [
  "analysis",
  "explanation",
  "risk-clarification",
  "re-review-signal"
] as const;

export type FollowUpResponseAction = (typeof followUpAllowedResponseActions)[number];

export const followUpBlockingLabels = ["do-not-merge", "needs-human-review", "security-sensitive", "ai-blocked"] as const;

export type FollowUpBlockingLabel = (typeof followUpBlockingLabels)[number];
export type FollowUpResponseScope = "analysis-only";

export interface FollowUpStateKey {
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly commentId: number;
}

export interface FollowUpStateRecord extends FollowUpStateKey {
  readonly deliveryId: string;
}

export type FollowUpClaimResult =
  | { readonly status: "claimed" }
  | { readonly status: "already-processed-delivery" }
  | { readonly status: "already-processed-comment" };

export interface FollowUpResponseRequest extends FollowUpStateKey {
  readonly commentBody: string;
  readonly commentAuthorLogin: string;
  readonly matchedAlias: ReviewerTriggerAlias;
  readonly labels: readonly string[];
  readonly blockedLabels: readonly FollowUpBlockingLabel[];
  readonly allowedResponseActions: readonly FollowUpResponseAction[];
}

export interface FollowUpResponse {
  readonly body: string;
  readonly responseScope: FollowUpResponseScope;
  readonly reviewedSha: string;
  readonly mergeSignal?: MergeSignal;
}

export interface FollowUpResponsePublication {
  readonly request: FollowUpResponseRequest;
  readonly response: FollowUpResponse;
}

export type FollowUpFailureStage =
  | "claim-follow-up"
  | "generate-follow-up-response"
  | "publish-follow-up-response"
  | "mark-follow-up-responded";

export interface FollowUpFailureRecord extends FollowUpStateRecord {
  readonly stage: FollowUpFailureStage;
  readonly message: string;
}

export interface FollowUpRespondedRecord extends FollowUpStateRecord {
  readonly responseScope: FollowUpResponseScope;
  readonly reviewedSha: string;
  readonly mergeSignal?: MergeSignal;
}

export interface FollowUpSkipPublication extends FollowUpStateRecord {
  readonly reason: FollowUpSkipReason;
}

export interface FollowUpFailurePublication extends FollowUpFailureRecord {
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly commentId: number;
}

export interface FollowUpStateStorePort {
  claimFollowUp(input: FollowUpStateRecord): Promise<FollowUpClaimResult>;
  markFollowUpResponded(input: FollowUpRespondedRecord): Promise<void>;
  markFollowUpFailed(input: FollowUpFailureRecord): Promise<void>;
}

export interface FollowUpResponderPort {
  generateFollowUpResponse(request: FollowUpResponseRequest): Promise<FollowUpResponse>;
}

export interface FollowUpPublisherPort {
  publishFollowUpResponse(publication: FollowUpResponsePublication): Promise<void>;
  publishFailure(failure: FollowUpFailurePublication): Promise<void>;
  publishSkip(skip: FollowUpSkipPublication): Promise<void>;
}

export interface ReviewerMentionPorts {
  readonly stateStore: FollowUpStateStorePort;
  readonly responder: FollowUpResponderPort;
  readonly publisher: FollowUpPublisherPort;
}

export type FollowUpSkipReason =
  | "unsupported-action"
  | "invalid-payload"
  | "trigger-not-found"
  | "not-pull-request"
  | "closed"
  | "fork"
  | "already-processed-delivery"
  | "already-processed-comment";

export type FollowUpRunResult =
  | { readonly status: "skipped"; readonly reason: FollowUpSkipReason }
  | {
      readonly status: "responded";
      readonly reviewedSha: string;
      readonly responseScope: FollowUpResponseScope;
      readonly mergeSignal?: MergeSignal;
    }
  | { readonly status: "failed"; readonly stage: FollowUpFailureStage };

const supportedCommentActions = ["created", "edited"] as const;

export async function respondToReviewerMention(
  event: ReviewerMentionCommentEvent,
  ports: ReviewerMentionPorts
): Promise<FollowUpRunResult> {
  if (!isSupportedCommentAction(event.action)) {
    return publishSkip(event, ports, "unsupported-action");
  }

  if (!isValidCommentEvent(event)) {
    return publishSkip(event, ports, "invalid-payload");
  }

  const triggerDecision = detectReviewerTrigger(event.commentBody);
  if (!triggerDecision.triggered || triggerDecision.matchedAlias === undefined) {
    return publishSkip(event, ports, "trigger-not-found");
  }

  if (!event.isPullRequest) {
    return publishSkip(event, ports, "not-pull-request");
  }

  if (event.isClosed) {
    return publishSkip(event, ports, "closed");
  }

  if (event.isFork) {
    return publishSkip(event, ports, "fork");
  }

  const stateRecord = toStateRecord(event);
  let stage: FollowUpFailureStage = "claim-follow-up";
  let claimSucceeded = false;

  try {
    const claim = await ports.stateStore.claimFollowUp(stateRecord);
    if (claim.status !== "claimed") {
      return publishSkip(event, ports, claim.status);
    }
    claimSucceeded = true;

    stage = "generate-follow-up-response";
    const request = buildResponseRequest(event, triggerDecision.matchedAlias);
    const response = await ports.responder.generateFollowUpResponse(request);

    stage = "publish-follow-up-response";
    await ports.publisher.publishFollowUpResponse({ request, response });

    stage = "mark-follow-up-responded";
    await ports.stateStore.markFollowUpResponded(buildRespondedRecord(stateRecord, response));

    return buildRespondedResult(response);
  } catch (error) {
    const failure = {
      ...stateRecord,
      stage,
      message: errorMessage(error)
    };

    await ports.publisher.publishFailure(failure);
    if (claimSucceeded) {
      await ports.stateStore.markFollowUpFailed(failure);
    }

    return { status: "failed", stage };
  }
}

function isSupportedCommentAction(action: string): action is ReviewerMentionCommentAction {
  return supportedCommentActions.some((supportedAction) => supportedAction === action);
}

function isValidCommentEvent(event: ReviewerMentionCommentEvent): boolean {
  return (
    isNonEmpty(event.deliveryId) &&
    isNonEmpty(event.repositoryFullName) &&
    Number.isSafeInteger(event.pullRequestNumber) &&
    event.pullRequestNumber > 0 &&
    isNonEmpty(event.headSha) &&
    Number.isSafeInteger(event.commentId) &&
    event.commentId > 0 &&
    isNonEmpty(event.commentAuthorLogin)
  );
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

async function publishSkip(
  event: ReviewerMentionCommentEvent,
  ports: ReviewerMentionPorts,
  reason: FollowUpSkipReason
): Promise<FollowUpRunResult> {
  await ports.publisher.publishSkip({
    ...toStateRecord(event),
    reason
  });

  return { status: "skipped", reason };
}

function toStateRecord(event: ReviewerMentionCommentEvent): FollowUpStateRecord {
  return {
    deliveryId: event.deliveryId,
    repositoryFullName: event.repositoryFullName,
    pullRequestNumber: event.pullRequestNumber,
    headSha: event.headSha,
    commentId: event.commentId
  };
}

function buildResponseRequest(
  event: ReviewerMentionCommentEvent,
  matchedAlias: ReviewerTriggerAlias
): FollowUpResponseRequest {
  return {
    repositoryFullName: event.repositoryFullName,
    pullRequestNumber: event.pullRequestNumber,
    headSha: event.headSha,
    commentId: event.commentId,
    commentBody: event.commentBody,
    commentAuthorLogin: event.commentAuthorLogin,
    matchedAlias,
    labels: event.labels,
    blockedLabels: filterBlockingLabels(event.labels),
    allowedResponseActions: followUpAllowedResponseActions
  };
}

function filterBlockingLabels(labels: readonly string[]): readonly FollowUpBlockingLabel[] {
  const blockingLabels = new Set<string>(followUpBlockingLabels);

  return labels.filter((label): label is FollowUpBlockingLabel => blockingLabels.has(label));
}

function buildRespondedRecord(
  stateRecord: FollowUpStateRecord,
  response: FollowUpResponse
): FollowUpRespondedRecord {
  if (response.mergeSignal === undefined) {
    return {
      ...stateRecord,
      responseScope: response.responseScope,
      reviewedSha: response.reviewedSha
    };
  }

  return {
    ...stateRecord,
    responseScope: response.responseScope,
    reviewedSha: response.reviewedSha,
    mergeSignal: response.mergeSignal
  };
}

function buildRespondedResult(response: FollowUpResponse): FollowUpRunResult {
  if (response.mergeSignal === undefined) {
    return {
      status: "responded",
      reviewedSha: response.reviewedSha,
      responseScope: response.responseScope
    };
  }

  return {
    status: "responded",
    reviewedSha: response.reviewedSha,
    responseScope: response.responseScope,
    mergeSignal: response.mergeSignal
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
