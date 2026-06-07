import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runEnsembleReview,
  type CandidateReviewFinding,
  type PullRequestWebhookEvent,
  type ReviewServerPorts
} from "../../index.js";

function baseWebhookEvent(overrides: Partial<PullRequestWebhookEvent> = {}): PullRequestWebhookEvent {
  return {
    deliveryId: "delivery-1",
    action: "opened",
    repositoryUrl: "https://github.com/kei781/sql-agent.git",
    repositoryFullName: "kei781/sql-agent",
    pullRequestNumber: 42,
    baseBranch: "main",
    headBranch: "feature/sql-guard",
    headSha: "abc123",
    isDraft: false,
    isClosed: false,
    isFork: false,
    changedPaths: ["src/query.ts"],
    ...overrides
  };
}

function createPorts() {
  const calls = {
    hasReviewedSha: [] as unknown[],
    markReviewedSha: [] as unknown[],
    prepareWorkspace: [] as unknown[],
    runIndependentReviews: [] as unknown[],
    publishReview: [] as unknown[],
    publishSkip: [] as unknown[]
  };

  const ports: ReviewServerPorts = {
    stateStore: {
      async hasReviewedSha(input) {
        calls.hasReviewedSha.push(input);
        return false;
      },
      async markReviewedSha(input) {
        calls.markReviewedSha.push(input);
      }
    },
    workspace: {
      async prepareWorkspace(context) {
        calls.prepareWorkspace.push(context);
        return { ...context, localWorkspacePath: "/tmp/sql-agent-pr-42" };
      }
    },
    orchestrator: {
      async runIndependentReviews(context) {
        calls.runIndependentReviews.push(context);

        const publishableFinding: CandidateReviewFinding = {
          id: "sql-limit-bypass",
          reviewerAgentId: "reviewer-claude-code",
          title: "LIMIT can be bypassed",
          description: "The query path accepts model SQL without enforcing the default LIMIT.",
          severity: "blocker",
          evidence: [
            {
              filePath: "src/query.ts",
              lineStart: 12,
              observedInLocalCheckout: true
            }
          ]
        };
        const speculativeFinding: CandidateReviewFinding = {
          id: "speculative-cache-risk",
          reviewerAgentId: "reviewer-codex",
          title: "Cache might be stale",
          description: "This finding lacks local code evidence.",
          severity: "suggestion",
          evidence: []
        };

        return {
          reviewerAgentIds: ["reviewer-claude-code", "reviewer-codex"],
          candidateFindings: [publishableFinding, speculativeFinding],
          corroboratingAgentIdsByFindingId: {
            "sql-limit-bypass": ["reviewer-codex"]
          }
        };
      }
    },
    publisher: {
      async publishReview(result) {
        calls.publishReview.push(result);
      },
      async publishSkip(skip) {
        calls.publishSkip.push(skip);
      }
    }
  };

  return { ports, calls };
}

describe("runEnsembleReview", () => {
  it("skips unsupported webhook actions before preparing a workspace", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent({ action: "labeled" }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "unsupported-action" });
    assert.equal(calls.prepareWorkspace.length, 0);
    assert.equal(calls.runIndependentReviews.length, 0);
    assert.equal(calls.publishReview.length, 0);
    assert.equal(calls.publishSkip.length, 1);
  });

  it("skips invalid webhook payloads before consulting review state", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent({ headSha: "" }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "invalid-payload" });
    assert.equal(calls.hasReviewedSha.length, 0);
    assert.equal(calls.prepareWorkspace.length, 0);
    assert.equal(calls.runIndependentReviews.length, 0);
    assert.equal(calls.publishSkip.length, 1);
  });

  it("skips a head SHA that was already reviewed", async () => {
    const { ports, calls } = createPorts();
    ports.stateStore.hasReviewedSha = async (input) => {
      calls.hasReviewedSha.push(input);
      return true;
    };

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, { status: "skipped", reason: "already-reviewed-sha" });
    assert.equal(calls.prepareWorkspace.length, 0);
    assert.equal(calls.runIndependentReviews.length, 0);
    assert.equal(calls.publishSkip.length, 1);
  });

  it("publishes only cross-validated findings with summary metadata", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, {
      status: "published",
      keptFindingCount: 1,
      droppedFindingCount: 1,
      mergeSignal: "BLOCKED"
    });
    assert.deepEqual(calls.prepareWorkspace[0], {
      repositoryUrl: "https://github.com/kei781/sql-agent.git",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      baseBranch: "main",
      headBranch: "feature/sql-guard",
      headSha: "abc123"
    });
    assert.equal(calls.publishReview.length, 1);
    assert.equal(calls.markReviewedSha.length, 1);

    const published = calls.publishReview[0] as Parameters<ReviewServerPorts["publisher"]["publishReview"]>[0];
    assert.equal(published.summary.reviewedSha, "abc123");
    assert.deepEqual(published.summary.reviewerAgentIds, ["reviewer-claude-code", "reviewer-codex"]);
    assert.equal(published.summary.keptFindingCount, 1);
    assert.equal(published.summary.droppedFindingCount, 1);
    assert.equal(published.summary.mergeSignal, "BLOCKED");
    assert.deepEqual(
      published.findings.map((finding) => finding.id),
      ["sql-limit-bypass"]
    );
  });
});
