export type RecognizedWebhookEventName = "pull_request" | "issue_comment";

export interface RecognizedWebhookDelivery {
  readonly deliveryId: string;
  readonly eventName: RecognizedWebhookEventName;
  readonly action: string;
  readonly repositoryFullName: string;
}

export type WebhookSkipReason =
  | "missing-event-header"
  | "invalid-payload"
  | "repo-not-allowed"
  | "unsupported-event"
  | "unsupported-action";

export type WebhookRecognitionResult =
  | { readonly status: "recognized"; readonly delivery: RecognizedWebhookDelivery }
  | {
      readonly status: "skipped";
      readonly reason: WebhookSkipReason;
      readonly body: Readonly<Record<string, unknown>>;
    };

const supportedPullRequestActions = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);
const supportedIssueCommentActions = new Set(["created", "edited"]);

export function recognizeGitHubWebhookDelivery(input: {
  readonly deliveryId: string;
  readonly eventName: string | undefined;
  readonly payload: Record<string, unknown>;
  readonly repoAllowlist: readonly string[];
}): WebhookRecognitionResult {
  const action = readPayloadAction(input.payload);
  const repositoryFullName = readRepositoryFullName(input.payload);

  if (input.eventName === undefined) {
    return skipped("missing-event-header", input.deliveryId, "missing", action, repositoryFullName);
  }

  if (action === undefined || repositoryFullName === undefined) {
    return skipped("invalid-payload", input.deliveryId, input.eventName, action, repositoryFullName);
  }

  if (input.repoAllowlist.length > 0 && !input.repoAllowlist.includes(repositoryFullName)) {
    return skipped("repo-not-allowed", input.deliveryId, input.eventName, action, repositoryFullName);
  }

  if (input.eventName === "pull_request" && supportedPullRequestActions.has(action)) {
    return {
      status: "recognized",
      delivery: { deliveryId: input.deliveryId, eventName: input.eventName, action, repositoryFullName }
    };
  }

  if (input.eventName === "issue_comment" && supportedIssueCommentActions.has(action)) {
    return {
      status: "recognized",
      delivery: { deliveryId: input.deliveryId, eventName: input.eventName, action, repositoryFullName }
    };
  }

  if (input.eventName !== "pull_request" && input.eventName !== "issue_comment") {
    return skipped("unsupported-event", input.deliveryId, input.eventName, action, repositoryFullName);
  }

  return skipped("unsupported-action", input.deliveryId, input.eventName, action, repositoryFullName);
}

export function readPayloadAction(payload: Record<string, unknown>): string | undefined {
  const action = payload["action"];
  return typeof action === "string" && action.length > 0 ? action : undefined;
}

export function readRepositoryFullName(payload: Record<string, unknown>): string | undefined {
  const repository = payload["repository"];

  if (repository === null || typeof repository !== "object" || Array.isArray(repository)) {
    return undefined;
  }

  const fullName = (repository as Record<string, unknown>)["full_name"];
  return typeof fullName === "string" && fullName.length > 0 ? fullName : undefined;
}

function skipped(
  reason: WebhookSkipReason,
  deliveryId: string,
  eventName: string,
  action: string | undefined,
  repositoryFullName: string | undefined
): WebhookRecognitionResult {
  return {
    status: "skipped",
    reason,
    body: {
      status: "skipped",
      reason,
      eventName,
      action: action ?? "missing",
      deliveryId,
      repositoryFullName: repositoryFullName ?? "missing"
    }
  };
}
