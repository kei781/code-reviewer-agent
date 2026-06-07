import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  respondToReviewerMention,
  type FollowUpClaimResult,
  type FollowUpResponseRequest,
  type ReviewerMentionCommentEvent,
  type ReviewerMentionPorts
} from "../../index.js";

function baseCommentEvent(overrides: Partial<ReviewerMentionCommentEvent> = {}): ReviewerMentionCommentEvent {
  return {
    deliveryId: "delivery-mention-1",
    action: "created",
    repositoryFullName: "kei781/sql-agent",
    pullRequestNumber: 42,
    headSha: "abc123",
    commentId: 9001,
    commentBody: "@ai-reviewer explain the SQL guard risk",
    commentAuthorLogin: "kei781",
    isPullRequest: true,
    isClosed: false,
    isFork: false,
    labels: [],
    ...overrides
  };
}

function createPorts(
  options: {
    readonly claimResult?: FollowUpClaimResult;
    readonly markRespondedError?: Error;
    readonly responseError?: Error;
    readonly publishResponseError?: Error;
  } = {}
) {
  const calls = {
    order: [] as string[],
    claimFollowUp: [] as unknown[],
    markFollowUpResponded: [] as unknown[],
    markFollowUpFailed: [] as unknown[],
    generateFollowUpResponse: [] as unknown[],
    publishFollowUpResponse: [] as unknown[],
    publishFailure: [] as unknown[],
    publishSkip: [] as unknown[]
  };

  const ports: ReviewerMentionPorts = {
    stateStore: {
      async claimFollowUp(input) {
        calls.order.push("claimFollowUp");
        calls.claimFollowUp.push(input);
        return options.claimResult ?? { status: "claimed" };
      },
      async markFollowUpResponded(input) {
        calls.order.push("markFollowUpResponded");
        calls.markFollowUpResponded.push(input);
        if (options.markRespondedError) {
          throw options.markRespondedError;
        }
      },
      async markFollowUpFailed(input) {
        calls.order.push("markFollowUpFailed");
        calls.markFollowUpFailed.push(input);
      }
    },
    responder: {
      async generateFollowUpResponse(request) {
        calls.order.push("generateFollowUpResponse");
        calls.generateFollowUpResponse.push(request);
        if (options.responseError) {
          throw options.responseError;
        }

        return {
          body: "The SQL guard risk is limited to the changed query path.",
          responseScope: "analysis-only",
          reviewedSha: request.headSha,
          mergeSignal: "HUMAN_REVIEW_REQUIRED"
        };
      }
    },
    publisher: {
      async publishFollowUpResponse(publication) {
        calls.order.push("publishFollowUpResponse");
        calls.publishFollowUpResponse.push(publication);
        if (options.publishResponseError) {
          throw options.publishResponseError;
        }
      },
      async publishFailure(failure) {
        calls.order.push("publishFailure");
        calls.publishFailure.push(failure);
      },
      async publishSkip(skip) {
        calls.order.push("publishSkip");
        calls.publishSkip.push(skip);
      }
    }
  };

  return { ports, calls };
}

describe("respondToReviewerMention", () => {
  it("skips ordinary comments before claiming follow-up work", async () => {
    const { ports, calls } = createPorts();

    const result = await respondToReviewerMention(baseCommentEvent({ commentBody: "Looks good to me." }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "trigger-not-found" });
    assert.equal(calls.claimFollowUp.length, 0);
    assert.equal(calls.generateFollowUpResponse.length, 0);
    assert.equal(calls.publishFollowUpResponse.length, 0);
    assert.equal(calls.publishSkip.length, 1);
  });

  it("skips comments that are not on an open same-repo pull request", async () => {
    const cases = [
      { event: baseCommentEvent({ isPullRequest: false }), reason: "not-pull-request" },
      { event: baseCommentEvent({ isClosed: true }), reason: "closed" },
      { event: baseCommentEvent({ isFork: true }), reason: "fork" }
    ] as const;

    for (const testCase of cases) {
      const { ports, calls } = createPorts();

      const result = await respondToReviewerMention(testCase.event, ports);

      assert.deepEqual(result, { status: "skipped", reason: testCase.reason });
      assert.equal(calls.claimFollowUp.length, 0);
      assert.equal(calls.generateFollowUpResponse.length, 0);
      assert.equal(calls.publishSkip.length, 1);
    }
  });

  it("claims and publishes an analysis-only response for explicit reviewer triggers", async () => {
    const { ports, calls } = createPorts();

    const result = await respondToReviewerMention(baseCommentEvent(), ports);

    assert.deepEqual(result, {
      status: "responded",
      reviewedSha: "abc123",
      responseScope: "analysis-only",
      mergeSignal: "HUMAN_REVIEW_REQUIRED"
    });
    assert.deepEqual(calls.order, [
      "claimFollowUp",
      "generateFollowUpResponse",
      "publishFollowUpResponse",
      "markFollowUpResponded"
    ]);
    assert.deepEqual(calls.claimFollowUp[0], {
      deliveryId: "delivery-mention-1",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      headSha: "abc123",
      commentId: 9001,
      commentRevisionKey: "sha256:46317942e73278be"
    });

    const request = calls.generateFollowUpResponse[0] as FollowUpResponseRequest;
    assert.equal(request.matchedAlias, "@ai-reviewer");
    assert.deepEqual(request.allowedResponseActions, [
      "analysis",
      "explanation",
      "risk-clarification",
      "re-review-signal"
    ]);
    assert.deepEqual(request.blockedLabels, []);

    const publication = calls.publishFollowUpResponse[0] as Parameters<
      ReviewerMentionPorts["publisher"]["publishFollowUpResponse"]
    >[0];
    assert.equal(publication.response.responseScope, "analysis-only");
    assert.equal(publication.request.commentId, 9001);
    assert.equal(publication.request.commentRevisionKey, "sha256:46317942e73278be");
  });

  it("uses changed edited comment bodies as a distinct follow-up claim revision", async () => {
    const { ports, calls } = createPorts();

    await respondToReviewerMention(baseCommentEvent(), ports);
    await respondToReviewerMention(
      baseCommentEvent({
        action: "edited",
        deliveryId: "delivery-mention-2",
        commentBody: "@ai-reviewer now focus on tests"
      }),
      ports
    );

    const firstClaim = calls.claimFollowUp[0] as Parameters<ReviewerMentionPorts["stateStore"]["claimFollowUp"]>[0];
    const secondClaim = calls.claimFollowUp[1] as Parameters<ReviewerMentionPorts["stateStore"]["claimFollowUp"]>[0];
    assert.equal(firstClaim.commentId, secondClaim.commentId);
    assert.notEqual(firstClaim.commentRevisionKey, secondClaim.commentRevisionKey);
    assert.equal(calls.generateFollowUpResponse.length, 2);
  });

  it("keeps fix requests read-only and carries blocking labels for response context", async () => {
    const { ports, calls } = createPorts();

    await respondToReviewerMention(
      baseCommentEvent({
        commentBody: "/ai review fix this and merge it",
        labels: ["needs-human-review", "security-sensitive", "bug"]
      }),
      ports
    );

    const request = calls.generateFollowUpResponse[0] as FollowUpResponseRequest;
    assert.equal(request.matchedAlias, "/ai review");
    assert.deepEqual(request.allowedResponseActions, [
      "analysis",
      "explanation",
      "risk-clarification",
      "re-review-signal"
    ]);
    assert.deepEqual(request.blockedLabels, ["needs-human-review", "security-sensitive"]);
    assert.doesNotMatch(request.allowedResponseActions.join(","), /fix|merge|approve/u);
  });

  it("hard-skips ai-blocked labels before claiming follow-up work", async () => {
    const { ports, calls } = createPorts();

    const result = await respondToReviewerMention(baseCommentEvent({ labels: ["ai-blocked"] }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "blocked-label" });
    assert.equal(calls.claimFollowUp.length, 0);
    assert.equal(calls.generateFollowUpResponse.length, 0);
    assert.equal(calls.publishFollowUpResponse.length, 0);

    const skip = calls.publishSkip[0] as Parameters<ReviewerMentionPorts["publisher"]["publishSkip"]>[0];
    assert.deepEqual(skip.blockedLabels, ["ai-blocked"]);
  });

  it("skips already processed comment/head pairs before generating a response", async () => {
    const { ports, calls } = createPorts({ claimResult: { status: "already-processed-comment" } });

    const result = await respondToReviewerMention(baseCommentEvent(), ports);

    assert.deepEqual(result, { status: "skipped", reason: "already-processed-comment" });
    assert.deepEqual(calls.order, ["claimFollowUp", "publishSkip"]);
    assert.equal(calls.generateFollowUpResponse.length, 0);
    assert.equal(calls.markFollowUpResponded.length, 0);
  });

  it("publishes a structured failure when response generation throws", async () => {
    const { ports, calls } = createPorts({ responseError: new Error("model unavailable") });

    const result = await respondToReviewerMention(baseCommentEvent(), ports);

    assert.deepEqual(result, { status: "failed", stage: "generate-follow-up-response" });
    assert.equal(calls.publishFailure.length, 1);
    assert.equal(calls.markFollowUpFailed.length, 1);

    const failure = calls.publishFailure[0] as Parameters<ReviewerMentionPorts["publisher"]["publishFailure"]>[0];
    assert.equal(failure.stage, "generate-follow-up-response");
    assert.equal(failure.message, "model unavailable");
    assert.equal(failure.commentId, 9001);
  });

  it("publishes a structured failure when follow-up publication throws", async () => {
    const { ports, calls } = createPorts({ publishResponseError: new Error("comment failed") });

    const result = await respondToReviewerMention(baseCommentEvent(), ports);

    assert.deepEqual(result, { status: "failed", stage: "publish-follow-up-response" });
    assert.equal(calls.publishFailure.length, 1);
    assert.equal(calls.markFollowUpFailed.length, 1);

    const failure = calls.publishFailure[0] as Parameters<ReviewerMentionPorts["publisher"]["publishFailure"]>[0];
    assert.equal(failure.stage, "publish-follow-up-response");
    assert.equal(failure.message, "comment failed");
  });

  it("does not publish a user-facing failure after the response comment is already published", async () => {
    const { ports, calls } = createPorts({ markRespondedError: new Error("state failed") });

    const result = await respondToReviewerMention(baseCommentEvent(), ports);

    assert.deepEqual(result, { status: "failed", stage: "mark-follow-up-responded" });
    assert.deepEqual(calls.order, [
      "claimFollowUp",
      "generateFollowUpResponse",
      "publishFollowUpResponse",
      "markFollowUpResponded",
      "markFollowUpFailed"
    ]);
    assert.equal(calls.publishFollowUpResponse.length, 1);
    assert.equal(calls.publishFailure.length, 0);
    assert.equal(calls.markFollowUpFailed.length, 1);

    const failure = calls.markFollowUpFailed[0] as Parameters<ReviewerMentionPorts["stateStore"]["markFollowUpFailed"]>[0];
    assert.equal(failure.stage, "mark-follow-up-responded");
    assert.equal(failure.message, "state failed");
  });
});
