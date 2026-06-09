import {
  mapPullRequestWebhookPayload,
  mapReviewerMentionWebhookPayload,
  type GitHubWebhookMappingReason
} from "../adapters/github/webhookEventMapper.js";
import type { PullRequestMetadataProvider } from "../adapters/github/githubPullRequestMetadataProvider.js";
import {
  runEnsembleReview,
  type ReviewRunResult,
  type ReviewServerPorts
} from "../app/runEnsembleReview.js";
import {
  respondToReviewerMention,
  type FollowUpRunResult,
  type ReviewerMentionPorts
} from "../app/respondToReviewerMention.js";
import { detectReviewerTrigger } from "../domain/policy/reviewerTriggerPolicy.js";
import { log } from "../shared/log.js";
import type { RecognizedWebhookDelivery, RecognizedWebhookHandlerInput } from "./httpServer.js";

export type WebhookDispatchSkipReason = GitHubWebhookMappingReason | "trigger-not-found";

export type WebhookDispatchResult =
  | {
      readonly status: "dispatched";
      readonly useCase: "pull-request-review";
      readonly result: ReviewRunResult;
    }
  | {
      readonly status: "dispatched";
      readonly useCase: "reviewer-mention";
      readonly result: FollowUpRunResult;
    }
  | {
      readonly status: "skipped";
      readonly eventName: RecognizedWebhookDelivery["eventName"];
      readonly reason: WebhookDispatchSkipReason;
    };

export interface WebhookDispatcherOptions {
  readonly metadataProvider: PullRequestMetadataProvider;
  readonly reviewPorts: ReviewServerPorts;
  readonly reviewerMentionPorts: ReviewerMentionPorts;
}

export type WebhookDispatcher = (input: RecognizedWebhookHandlerInput) => Promise<WebhookDispatchResult>;

export function createWebhookDispatcher(options: WebhookDispatcherOptions): WebhookDispatcher {
  return async (input) => {
    log("github webhook dispatch started", {
      level: "info",
      metadata: dispatchLogMetadata(input.delivery)
    });

    const result =
      input.delivery.eventName === "pull_request"
        ? await dispatchPullRequest(input, options)
        : await dispatchReviewerMention(input, options);

    log("github webhook dispatch completed", {
      level: "info",
      metadata: {
        ...dispatchLogMetadata(input.delivery),
        status: result.status,
        useCase: result.status === "dispatched" ? result.useCase : "none",
        resultStatus: result.status === "dispatched" ? result.result.status : result.reason
      }
    });

    return result;
  };
}

async function dispatchPullRequest(
  input: RecognizedWebhookHandlerInput,
  options: WebhookDispatcherOptions
): Promise<WebhookDispatchResult> {
  const pullRequestNumber = readPullRequestNumber(input.payload, "pull_request");

  if (pullRequestNumber === undefined) {
    return { status: "skipped", eventName: "pull_request", reason: "invalid-payload" };
  }

  const changedPaths = await options.metadataProvider.listChangedPaths({
    repositoryFullName: input.delivery.repositoryFullName,
    pullRequestNumber
  });
  const mapping = mapPullRequestWebhookPayload({
    deliveryId: input.delivery.deliveryId,
    payload: input.payload,
    changedPaths
  });

  if (!mapping.ok) {
    return { status: "skipped", eventName: "pull_request", reason: mapping.reason };
  }

  return {
    status: "dispatched",
    useCase: "pull-request-review",
    result: await runEnsembleReview(mapping.event, options.reviewPorts)
  };
}

async function dispatchReviewerMention(
  input: RecognizedWebhookHandlerInput,
  options: WebhookDispatcherOptions
): Promise<WebhookDispatchResult> {
  const commentBody = readIssueCommentBody(input.payload);

  if (commentBody === undefined) {
    return { status: "skipped", eventName: "issue_comment", reason: "invalid-payload" };
  }

  if (!detectReviewerTrigger(commentBody).triggered) {
    return { status: "skipped", eventName: "issue_comment", reason: "trigger-not-found" };
  }

  if (!isPullRequestIssueComment(input.payload)) {
    const mapping = mapReviewerMentionWebhookPayload({
      deliveryId: input.delivery.deliveryId,
      payload: input.payload
    });

    return {
      status: "skipped",
      eventName: "issue_comment",
      reason: mapping.ok ? "invalid-payload" : mapping.reason
    };
  }

  const pullRequestNumber = readPullRequestNumber(input.payload, "issue");

  if (pullRequestNumber === undefined) {
    return { status: "skipped", eventName: "issue_comment", reason: "invalid-payload" };
  }

  const pullRequestMetadata = await options.metadataProvider.getPullRequestMetadata({
    repositoryFullName: input.delivery.repositoryFullName,
    pullRequestNumber
  });
  const mapping = mapReviewerMentionWebhookPayload({
    deliveryId: input.delivery.deliveryId,
    payload: input.payload,
    pullRequestMetadata
  });

  if (!mapping.ok) {
    return { status: "skipped", eventName: "issue_comment", reason: mapping.reason };
  }

  return {
    status: "dispatched",
    useCase: "reviewer-mention",
    result: await respondToReviewerMention(mapping.event, options.reviewerMentionPorts)
  };
}

function dispatchLogMetadata(delivery: RecognizedWebhookDelivery): Readonly<Record<string, string>> {
  return {
    deliveryId: delivery.deliveryId,
    eventName: delivery.eventName,
    action: delivery.action,
    repositoryFullName: delivery.repositoryFullName
  };
}

function readPullRequestNumber(payload: Record<string, unknown>, key: "pull_request" | "issue"): number | undefined {
  const container = readRecord(payload[key]);
  if (container === undefined) {
    return undefined;
  }

  const number = container["number"];

  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function isPullRequestIssueComment(payload: Record<string, unknown>): boolean {
  const issue = readRecord(payload["issue"]);
  if (issue === undefined) {
    return false;
  }

  return readRecord(issue["pull_request"]) !== undefined;
}

function readIssueCommentBody(payload: Record<string, unknown>): string | undefined {
  const comment = readRecord(payload["comment"]);
  const body = comment?.["body"];

  return typeof body === "string" && body.trim().length > 0 ? body : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
