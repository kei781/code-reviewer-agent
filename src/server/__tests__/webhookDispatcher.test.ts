import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type {
  ReviewFailurePublication,
  ReviewPublication,
  ReviewPublishedRecord,
  ReviewServerPorts,
  ReviewSkipPublication,
  WorkspacePreparationRequest
} from "../../app/runEnsembleReview.js";
import type {
  FollowUpFailurePublication,
  FollowUpFailureRecord,
  FollowUpRespondedRecord,
  FollowUpResponsePublication,
  FollowUpResponseRequest,
  FollowUpSkipPublication,
  ReviewerMentionPorts
} from "../../app/respondToReviewerMention.js";
import type { PullRequestReviewContext } from "../../domain/review/pullRequestReviewContext.js";
import { resetLogSink, setLogSink } from "../../shared/log.js";
import { createWebhookDispatcher } from "../webhookDispatcher.js";

beforeEach(() => {
  setLogSink(() => undefined);
});

afterEach(() => {
  resetLogSink();
});

describe("createWebhookDispatcher", () => {
  it("dispatches pull_request webhooks through the ensemble review use case", async () => {
    const changedPathRequests: Array<{ readonly repositoryFullName: string; readonly pullRequestNumber: number }> = [];
    const reviewRecords = createReviewRecords();
    const dispatcher = createWebhookDispatcher({
      metadataProvider: {
        async listChangedPaths(input) {
          changedPathRequests.push(input);
          return ["src/server.ts"];
        },
        async getPullRequestMetadata() {
          throw new Error("issue_comment metadata should not be fetched for pull_request dispatch");
        }
      },
      reviewPorts: createReviewPorts(reviewRecords),
      reviewerMentionPorts: createReviewerMentionPorts(createFollowUpRecords())
    });

    const result = await dispatcher({
      delivery: {
        deliveryId: "delivery-pr-1",
        eventName: "pull_request",
        action: "opened",
        repositoryFullName: "kei781/sql-agent"
      },
      payload: pullRequestPayload()
    });

    assert.deepEqual(changedPathRequests, [{ repositoryFullName: "kei781/sql-agent", pullRequestNumber: 42 }]);
    assert.deepEqual(result, {
      status: "dispatched",
      useCase: "pull-request-review",
      result: {
        status: "published",
        keptFindingCount: 0,
        droppedFindingCount: 0,
        dedupedFindingCount: 0,
        mergeSignal: "PASS"
      }
    });
    assert.equal(reviewRecords.reviewPublications.length, 1);
    assert.deepEqual(reviewRecords.workspaceRequests.map((request) => request.headSha), ["abc123"]);
    assert.deepEqual(reviewRecords.reviewPublishedRecords.map((record) => record.deliveryId), ["delivery-pr-1"]);
  });

  it("dispatches issue_comment reviewer mentions through the follow-up use case", async () => {
    const metadataRequests: Array<{ readonly repositoryFullName: string; readonly pullRequestNumber: number }> = [];
    const followUpRecords = createFollowUpRecords();
    const dispatcher = createWebhookDispatcher({
      metadataProvider: {
        async listChangedPaths() {
          throw new Error("changed paths should not be fetched for issue_comment dispatch");
        },
        async getPullRequestMetadata(input) {
          metadataRequests.push(input);
          return { headSha: "abc123", isClosed: false, isFork: false };
        }
      },
      reviewPorts: createReviewPorts(createReviewRecords()),
      reviewerMentionPorts: createReviewerMentionPorts(followUpRecords)
    });

    const result = await dispatcher({
      delivery: {
        deliveryId: "delivery-comment-1",
        eventName: "issue_comment",
        action: "created",
        repositoryFullName: "kei781/sql-agent"
      },
      payload: reviewerMentionPayload()
    });

    assert.deepEqual(metadataRequests, [{ repositoryFullName: "kei781/sql-agent", pullRequestNumber: 42 }]);
    assert.deepEqual(result, {
      status: "dispatched",
      useCase: "reviewer-mention",
      result: {
        status: "responded",
        reviewedSha: "abc123",
        responseScope: "analysis-only"
      }
    });
    assert.equal(followUpRecords.responseRequests.length, 1);
    assert.equal(followUpRecords.responseRequests[0]?.matchedAlias, "@ai-reviewer");
    assert.equal(followUpRecords.responsePublications.length, 1);
    assert.deepEqual(followUpRecords.respondedRecords.map((record) => record.deliveryId), ["delivery-comment-1"]);
  });

  it("skips ordinary issue comments before metadata reads or follow-up side effects", async () => {
    let metadataReadCount = 0;
    const followUpRecords = createFollowUpRecords();
    const dispatcher = createWebhookDispatcher({
      metadataProvider: {
        async listChangedPaths() {
          throw new Error("changed paths should not be fetched for issue_comment dispatch");
        },
        async getPullRequestMetadata() {
          metadataReadCount += 1;
          return { headSha: "abc123", isClosed: false, isFork: false };
        }
      },
      reviewPorts: createReviewPorts(createReviewRecords()),
      reviewerMentionPorts: createReviewerMentionPorts(followUpRecords)
    });

    const result = await dispatcher({
      delivery: {
        deliveryId: "delivery-comment-no-trigger",
        eventName: "issue_comment",
        action: "created",
        repositoryFullName: "kei781/sql-agent"
      },
      payload: reviewerMentionPayload({ commentBody: "looks fine to me" })
    });

    assert.deepEqual(result, {
      status: "skipped",
      eventName: "issue_comment",
      reason: "trigger-not-found"
    });
    assert.equal(metadataReadCount, 0);
    assert.equal(followUpRecords.responseRequests.length, 0);
    assert.equal(followUpRecords.skipPublications.length, 0);
  });

  it("skips dispatch when webhook payload mapping fails closed", async () => {
    const reviewRecords = createReviewRecords();
    const dispatcher = createWebhookDispatcher({
      metadataProvider: {
        async listChangedPaths() {
          return [];
        },
        async getPullRequestMetadata() {
          throw new Error("metadata should not be fetched");
        }
      },
      reviewPorts: createReviewPorts(reviewRecords),
      reviewerMentionPorts: createReviewerMentionPorts(createFollowUpRecords())
    });

    const result = await dispatcher({
      delivery: {
        deliveryId: "delivery-pr-empty-paths",
        eventName: "pull_request",
        action: "synchronize",
        repositoryFullName: "kei781/sql-agent"
      },
      payload: pullRequestPayload({ action: "synchronize" })
    });

    assert.deepEqual(result, {
      status: "skipped",
      eventName: "pull_request",
      reason: "changed-paths-unavailable"
    });
    assert.equal(reviewRecords.reviewPublications.length, 0);
    assert.equal(reviewRecords.workspaceRequests.length, 0);
  });
});

interface ReviewRecords {
  readonly workspaceRequests: WorkspacePreparationRequest[];
  readonly reviewPublications: ReviewPublication[];
  readonly reviewFailurePublications: ReviewFailurePublication[];
  readonly reviewSkipPublications: ReviewSkipPublication[];
  readonly reviewPublishedRecords: ReviewPublishedRecord[];
}

function createReviewRecords(): ReviewRecords {
  return {
    workspaceRequests: [],
    reviewPublications: [],
    reviewFailurePublications: [],
    reviewSkipPublications: [],
    reviewPublishedRecords: []
  };
}

function createReviewPorts(records: ReviewRecords): ReviewServerPorts {
  return {
    stateStore: {
      async claimReview() {
        return { status: "claimed" };
      },
      async listPostedFindingFingerprints() {
        return [];
      },
      async markReviewPublished(input) {
        records.reviewPublishedRecords.push(input);
      },
      async markReviewFailed() {
        throw new Error("review should not fail in dispatcher tests");
      }
    },
    workspace: {
      async prepareWorkspace(request): Promise<PullRequestReviewContext> {
        records.workspaceRequests.push(request);
        return {
          ...request,
          localWorkspacePath: "/tmp/code-reviewer-agent/kei781/sql-agent/pr-42"
        };
      }
    },
    orchestrator: {
      async runIndependentReviews() {
        return {
          reviewerAgentIds: ["reviewer-claude-code", "reviewer-codex"],
          candidateFindings: [],
          corroboratingAgentIdsByFindingId: {}
        };
      }
    },
    publisher: {
      async publishReview(publication) {
        records.reviewPublications.push(publication);
      },
      async publishFailure(publication) {
        records.reviewFailurePublications.push(publication);
      },
      async publishSkip(publication) {
        records.reviewSkipPublications.push(publication);
      }
    }
  };
}

interface FollowUpRecords {
  readonly responseRequests: FollowUpResponseRequest[];
  readonly responsePublications: FollowUpResponsePublication[];
  readonly failurePublications: FollowUpFailurePublication[];
  readonly skipPublications: FollowUpSkipPublication[];
  readonly respondedRecords: FollowUpRespondedRecord[];
  readonly failureRecords: FollowUpFailureRecord[];
}

function createFollowUpRecords(): FollowUpRecords {
  return {
    responseRequests: [],
    responsePublications: [],
    failurePublications: [],
    skipPublications: [],
    respondedRecords: [],
    failureRecords: []
  };
}

function createReviewerMentionPorts(records: FollowUpRecords): ReviewerMentionPorts {
  return {
    stateStore: {
      async claimFollowUp() {
        return { status: "claimed" };
      },
      async markFollowUpResponded(input) {
        records.respondedRecords.push(input);
      },
      async markFollowUpFailed(input) {
        records.failureRecords.push(input);
      }
    },
    responder: {
      async generateFollowUpResponse(request) {
        records.responseRequests.push(request);
        return {
          body: "The referenced review signal is still analysis-only.",
          responseScope: "analysis-only",
          reviewedSha: request.headSha
        };
      }
    },
    publisher: {
      async publishFollowUpResponse(publication) {
        records.responsePublications.push(publication);
      },
      async publishFailure(publication) {
        records.failurePublications.push(publication);
      },
      async publishSkip(publication) {
        records.skipPublications.push(publication);
      }
    }
  };
}

function pullRequestPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "opened",
    repository: {
      full_name: "kei781/sql-agent",
      clone_url: "https://github.com/kei781/sql-agent.git"
    },
    pull_request: {
      number: 42,
      draft: false,
      state: "open",
      base: { ref: "main" },
      head: {
        ref: "feature/runtime-dispatch",
        sha: "abc123",
        repo: {
          full_name: "kei781/sql-agent",
          fork: false
        }
      }
    },
    ...overrides
  };
}

function reviewerMentionPayload(overrides: { readonly commentBody?: string } = {}): Record<string, unknown> {
  return {
    action: "created",
    repository: { full_name: "kei781/sql-agent" },
    issue: {
      number: 42,
      pull_request: { url: "https://api.github.test/repos/kei781/sql-agent/pulls/42" },
      labels: [{ name: "bug" }]
    },
    comment: {
      id: 9001,
      body: overrides.commentBody ?? "@ai-reviewer can you explain this?",
      user: { login: "kei781" }
    }
  };
}
