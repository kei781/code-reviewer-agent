import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSqliteReviewStateStore } from "../sqliteReviewStateStore.js";

async function withDatabase(test: (databasePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "review-state-"));

  try {
    await test(path.join(directory, "state.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("createSqliteReviewStateStore", () => {
  it("claims each review delivery once and prevents duplicate head-SHA work", async () => {
    await withDatabase(async (databasePath) => {
      const store = createSqliteReviewStateStore({ databasePath });
      const key = {
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42,
        headSha: "abc123"
      };

      assert.deepEqual(await store.claimReview({ ...key, deliveryId: "delivery-1" }), { status: "claimed" });
      assert.deepEqual(await store.claimReview({ ...key, deliveryId: "delivery-1" }), {
        status: "already-processed-delivery"
      });
      assert.deepEqual(await store.claimReview({ ...key, deliveryId: "delivery-2" }), {
        status: "already-reviewed-sha"
      });

      store.close();
    });
  });

  it("persists published finding fingerprints across store instances", async () => {
    await withDatabase(async (databasePath) => {
      const key = {
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42,
        headSha: "abc123"
      };
      const first = createSqliteReviewStateStore({ databasePath });

      await first.claimReview({ ...key, deliveryId: "delivery-1" });
      await first.markReviewPublished({
        ...key,
        deliveryId: "delivery-1",
        postedFindingFingerprints: ["fp-1", "fp-2", "fp-1"]
      });
      first.close();

      const second = createSqliteReviewStateStore({ databasePath });
      assert.deepEqual(await second.listPostedFindingFingerprints(key), ["fp-1", "fp-2"]);
      assert.deepEqual(await second.claimReview({ ...key, deliveryId: "delivery-2" }), {
        status: "already-reviewed-sha"
      });
      second.close();
    });
  });

  it("claims follow-up comments by delivery and comment body revision", async () => {
    await withDatabase(async (databasePath) => {
      const store = createSqliteReviewStateStore({ databasePath });
      const key = {
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42,
        headSha: "abc123",
        commentId: 9001,
        commentRevisionKey: "sha256:abc"
      };

      assert.deepEqual(await store.claimFollowUp({ ...key, deliveryId: "delivery-mention-1" }), { status: "claimed" });
      assert.deepEqual(await store.claimFollowUp({ ...key, deliveryId: "delivery-mention-1" }), {
        status: "already-processed-delivery"
      });
      assert.deepEqual(await store.claimFollowUp({ ...key, deliveryId: "delivery-mention-2" }), {
        status: "already-processed-comment"
      });

      await store.markFollowUpResponded({
        ...key,
        deliveryId: "delivery-mention-1",
        responseScope: "analysis-only",
        reviewedSha: "abc123",
        mergeSignal: "HUMAN_REVIEW_REQUIRED"
      });
      await store.markFollowUpFailed({
        ...key,
        deliveryId: "delivery-mention-1",
        stage: "mark-follow-up-responded",
        message: "state retry"
      });
      store.close();
    });
  });
});
