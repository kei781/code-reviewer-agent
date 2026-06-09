import type { PullRequestWebhookAction, PullRequestWebhookEvent } from "../../app/runEnsembleReview.js";
import type {
  ReviewerMentionCommentAction,
  ReviewerMentionCommentEvent
} from "../../app/respondToReviewerMention.js";

export type GitHubWebhookMappingReason =
  | "invalid-payload"
  | "unsupported-action"
  | "changed-paths-unavailable"
  | "not-pull-request"
  | "pull-request-metadata-unavailable";

export type GitHubWebhookMappingResult<T> =
  | {
      readonly ok: true;
      readonly event: T;
    }
  | {
      readonly ok: false;
      readonly reason: GitHubWebhookMappingReason;
    };

export interface PullRequestMappingInput {
  readonly deliveryId: string;
  readonly payload: unknown;
  readonly changedPaths: readonly string[];
}

export interface GitHubPullRequestMetadata {
  readonly headSha: string;
  readonly isClosed: boolean;
  readonly isFork: boolean;
}

export interface ReviewerMentionMappingInput {
  readonly deliveryId: string;
  readonly payload: unknown;
  readonly pullRequestMetadata?: GitHubPullRequestMetadata;
}

const supportedPullRequestActions = ["opened", "synchronize", "reopened", "ready_for_review"] as const;
const supportedCommentActions = ["created", "edited"] as const;

export function mapPullRequestWebhookPayload(
  input: PullRequestMappingInput
): GitHubWebhookMappingResult<PullRequestWebhookEvent> {
  const payload = asRecord(input.payload);
  const action = readString(payload.action);

  if (!isSupportedPullRequestAction(action)) {
    return { ok: false, reason: "unsupported-action" };
  }

  if (input.changedPaths.length === 0) {
    return { ok: false, reason: "changed-paths-unavailable" };
  }

  const repository = asRecord(payload.repository);
  const pullRequest = asRecord(payload.pull_request);
  const base = asRecord(pullRequest.base);
  const head = asRecord(pullRequest.head);
  const headRepository = asRecord(head.repo);

  const repositoryFullName = readString(repository.full_name);
  const repositoryUrl = readString(repository.clone_url);
  const pullRequestNumber = readPositiveInteger(pullRequest.number);
  const baseBranch = readString(base.ref);
  const headBranch = readString(head.ref);
  const headSha = readString(head.sha);
  const draft = readBoolean(pullRequest.draft);
  const state = readString(pullRequest.state);

  if (
    repositoryFullName === undefined ||
    repositoryUrl === undefined ||
    pullRequestNumber === undefined ||
    baseBranch === undefined ||
    headBranch === undefined ||
    headSha === undefined ||
    draft === undefined ||
    state === undefined
  ) {
    return { ok: false, reason: "invalid-payload" };
  }

  const headRepositoryFullName = readString(headRepository.full_name);
  const headRepositoryFork = readBoolean(headRepository.fork);

  return {
    ok: true,
    event: {
      deliveryId: input.deliveryId,
      action,
      repositoryUrl,
      repositoryFullName,
      pullRequestNumber,
      baseBranch,
      headBranch,
      headSha,
      isDraft: draft,
      isClosed: state === "closed",
      isFork: headRepositoryFork === true || headRepositoryFullName !== repositoryFullName,
      changedPaths: input.changedPaths
    }
  };
}

export function mapReviewerMentionWebhookPayload(
  input: ReviewerMentionMappingInput
): GitHubWebhookMappingResult<ReviewerMentionCommentEvent> {
  const payload = asRecord(input.payload);
  const action = readString(payload.action);

  if (!isSupportedCommentAction(action)) {
    return { ok: false, reason: "unsupported-action" };
  }

  const repository = asRecord(payload.repository);
  const issue = asRecord(payload.issue);
  const comment = asRecord(payload.comment);
  const commentUser = asRecord(comment.user);

  const repositoryFullName = readString(repository.full_name);
  const pullRequestNumber = readPositiveInteger(issue.number);
  const commentId = readPositiveInteger(comment.id);
  const commentBody = readString(comment.body);
  const commentAuthorLogin = readString(commentUser.login);
  const labels = readLabelNames(issue.labels);
  const isPullRequest = isRecord(issue.pull_request);

  if (!isPullRequest) {
    return { ok: false, reason: "not-pull-request" };
  }

  if (input.pullRequestMetadata === undefined) {
    return { ok: false, reason: "pull-request-metadata-unavailable" };
  }

  if (
    repositoryFullName === undefined ||
    pullRequestNumber === undefined ||
    commentId === undefined ||
    commentBody === undefined ||
    commentAuthorLogin === undefined ||
    labels === undefined ||
    input.pullRequestMetadata.headSha.trim().length === 0
  ) {
    return { ok: false, reason: "invalid-payload" };
  }

  return {
    ok: true,
    event: {
      deliveryId: input.deliveryId,
      action,
      repositoryFullName,
      pullRequestNumber,
      headSha: input.pullRequestMetadata.headSha,
      commentId,
      commentBody,
      commentAuthorLogin,
      isPullRequest: true,
      isClosed: input.pullRequestMetadata.isClosed,
      isFork: input.pullRequestMetadata.isFork,
      labels
    }
  };
}

function isSupportedPullRequestAction(action: string | undefined): action is PullRequestWebhookAction {
  return supportedPullRequestActions.some((supportedAction) => supportedAction === action);
}

function isSupportedCommentAction(action: string | undefined): action is ReviewerMentionCommentAction {
  return supportedCommentActions.some((supportedAction) => supportedAction === action);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0 ? value : undefined;
}

function readLabelNames(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const labels: string[] = [];
  for (const label of value) {
    const name = readString(asRecord(label).name);
    if (name === undefined) {
      return undefined;
    }
    labels.push(name);
  }

  return labels;
}
