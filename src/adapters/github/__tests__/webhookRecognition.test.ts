import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recognizeGitHubWebhookDelivery } from "../webhookRecognition.js";

describe("recognizeGitHubWebhookDelivery", () => {
  it("recognizes supported pull_request and issue_comment events", () => {
    assert.deepEqual(
      recognizeGitHubWebhookDelivery({
        deliveryId: "delivery-1",
        eventName: "pull_request",
        payload: { action: "ready_for_review", repository: { full_name: "kei781/sql-agent" } },
        repoAllowlist: []
      }),
      {
        status: "recognized",
        delivery: {
          deliveryId: "delivery-1",
          eventName: "pull_request",
          action: "ready_for_review",
          repositoryFullName: "kei781/sql-agent"
        }
      }
    );

    assert.deepEqual(
      recognizeGitHubWebhookDelivery({
        deliveryId: "delivery-2",
        eventName: "issue_comment",
        payload: { action: "edited", repository: { full_name: "kei781/sql-agent" } },
        repoAllowlist: []
      }),
      {
        status: "recognized",
        delivery: {
          deliveryId: "delivery-2",
          eventName: "issue_comment",
          action: "edited",
          repositoryFullName: "kei781/sql-agent"
        }
      }
    );
  });

  it("skips disallowed repos, unsupported actions, unsupported events, and invalid payloads", () => {
    assert.deepEqual(
      recognizeGitHubWebhookDelivery({
        deliveryId: "delivery-3",
        eventName: "pull_request",
        payload: { action: "opened", repository: { full_name: "other/repo" } },
        repoAllowlist: ["kei781/sql-agent"]
      }).status,
      "skipped"
    );
    assert.deepEqual(
      recognizeGitHubWebhookDelivery({
        deliveryId: "delivery-4",
        eventName: "pull_request",
        payload: { action: "closed", repository: { full_name: "kei781/sql-agent" } },
        repoAllowlist: []
      }),
      {
        status: "skipped",
        reason: "unsupported-action",
        body: {
          status: "skipped",
          reason: "unsupported-action",
          eventName: "pull_request",
          action: "closed",
          deliveryId: "delivery-4",
          repositoryFullName: "kei781/sql-agent"
        }
      }
    );
    assert.equal(
      recognizeGitHubWebhookDelivery({
        deliveryId: "delivery-5",
        eventName: "push",
        payload: { action: "created", repository: { full_name: "kei781/sql-agent" } },
        repoAllowlist: []
      }).status,
      "skipped"
    );
    assert.equal(
      recognizeGitHubWebhookDelivery({
        deliveryId: "delivery-6",
        eventName: "pull_request",
        payload: { repository: { full_name: "kei781/sql-agent" } },
        repoAllowlist: []
      }).status,
      "skipped"
    );
  });
});
