import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runEnsembleReview,
  type CandidateReviewFinding,
  type PullRequestWebhookEvent,
  type ReviewClaimResult,
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

function candidateFinding(overrides: Partial<CandidateReviewFinding> = {}): CandidateReviewFinding {
  return {
    id: "sql-limit-bypass",
    fingerprint: "security:sql-limit-bypass:src/query.ts",
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
    ],
    ...overrides
  };
}

function createPorts(
  options: {
    readonly claimResult?: ReviewClaimResult;
    readonly candidateFindings?: readonly CandidateReviewFinding[];
    readonly corroboratingAgentIdsByFindingId?: Readonly<Record<string, readonly string[]>>;
    readonly alreadyPostedFingerprints?: readonly string[];
    readonly prepareWorkspaceError?: Error;
    readonly runIndependentReviewsError?: Error;
    readonly publishReviewError?: Error;
  } = {}
) {
  const calls = {
    order: [] as string[],
    claimReview: [] as unknown[],
    listPostedFindingFingerprints: [] as unknown[],
    markReviewPublished: [] as unknown[],
    markReviewFailed: [] as unknown[],
    prepareWorkspace: [] as unknown[],
    runIndependentReviews: [] as unknown[],
    publishReview: [] as unknown[],
    publishFailure: [] as unknown[],
    publishSkip: [] as unknown[]
  };

  const ports: ReviewServerPorts = {
    stateStore: {
      async claimReview(input) {
        calls.order.push("claimReview");
        calls.claimReview.push(input);
        return options.claimResult ?? { status: "claimed" };
      },
      async listPostedFindingFingerprints(input) {
        calls.order.push("listPostedFindingFingerprints");
        calls.listPostedFindingFingerprints.push(input);
        return options.alreadyPostedFingerprints ?? [];
      },
      async markReviewPublished(input) {
        calls.order.push("markReviewPublished");
        calls.markReviewPublished.push(input);
      },
      async markReviewFailed(input) {
        calls.order.push("markReviewFailed");
        calls.markReviewFailed.push(input);
      }
    },
    workspace: {
      async prepareWorkspace(context) {
        calls.order.push("prepareWorkspace");
        calls.prepareWorkspace.push(context);
        if (options.prepareWorkspaceError) {
          throw options.prepareWorkspaceError;
        }

        return { ...context, localWorkspacePath: "/tmp/sql-agent-pr-42" };
      }
    },
    orchestrator: {
      async runIndependentReviews(context) {
        calls.order.push("runIndependentReviews");
        calls.runIndependentReviews.push(context);
        if (options.runIndependentReviewsError) {
          throw options.runIndependentReviewsError;
        }

        const candidateFindings = options.candidateFindings ?? [
          candidateFinding(),
          candidateFinding({
            id: "speculative-cache-risk",
            fingerprint: "suggestion:speculative-cache-risk:src/cache.ts",
            reviewerAgentId: "reviewer-codex",
            title: "Cache might be stale",
            description: "This finding lacks local code evidence.",
            severity: "suggestion",
            evidence: []
          })
        ];

        return {
          reviewerAgentIds: ["reviewer-claude-code", "reviewer-codex"],
          candidateFindings,
          corroboratingAgentIdsByFindingId: options.corroboratingAgentIdsByFindingId ?? {
            "sql-limit-bypass": ["reviewer-codex"]
          }
        };
      }
    },
    publisher: {
      async publishReview(result) {
        calls.order.push("publishReview");
        calls.publishReview.push(result);
        if (options.publishReviewError) {
          throw options.publishReviewError;
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

describe("runEnsembleReview", () => {
  it("skips unsupported webhook actions before claiming a review", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent({ action: "labeled" }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "unsupported-action" });
    assert.equal(calls.claimReview.length, 0);
    assert.equal(calls.prepareWorkspace.length, 0);
    assert.equal(calls.runIndependentReviews.length, 0);
    assert.equal(calls.publishReview.length, 0);
    assert.equal(calls.publishSkip.length, 1);
  });

  it("skips invalid webhook payloads before claiming a review", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent({ headSha: "" }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "invalid-payload" });
    assert.equal(calls.claimReview.length, 0);
    assert.equal(calls.prepareWorkspace.length, 0);
    assert.equal(calls.runIndependentReviews.length, 0);
    assert.equal(calls.publishSkip.length, 1);
  });

  it("skips empty changed paths before claiming a review", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent({ changedPaths: [] }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "invalid-payload" });
    assert.equal(calls.claimReview.length, 0);
    assert.equal(calls.prepareWorkspace.length, 0);
    assert.equal(calls.runIndependentReviews.length, 0);
    assert.equal(calls.publishSkip.length, 1);
  });

  it("skips draft PRs before claiming a review", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent({ isDraft: true }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "draft" });
    assert.equal(calls.claimReview.length, 0);
    assert.equal(calls.markReviewPublished.length, 0);
    assert.equal(calls.prepareWorkspace.length, 0);
  });

  it("skips fork PRs before claiming a review", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent({ isFork: true }), ports);

    assert.deepEqual(result, { status: "skipped", reason: "fork" });
    assert.equal(calls.claimReview.length, 0);
    assert.equal(calls.markReviewPublished.length, 0);
    assert.equal(calls.prepareWorkspace.length, 0);
  });

  it("skips a head SHA that was already claimed or reviewed", async () => {
    const { ports, calls } = createPorts({ claimResult: { status: "already-reviewed-sha" } });

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, { status: "skipped", reason: "already-reviewed-sha" });
    assert.deepEqual(calls.order, ["claimReview", "publishSkip"]);
    assert.equal(calls.prepareWorkspace.length, 0);
    assert.equal(calls.runIndependentReviews.length, 0);
    assert.equal(calls.markReviewPublished.length, 0);
  });

  it("publishes only cross-validated findings with summary metadata", async () => {
    const { ports, calls } = createPorts();

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, {
      status: "published",
      keptFindingCount: 1,
      droppedFindingCount: 1,
      dedupedFindingCount: 0,
      mergeSignal: "BLOCKED"
    });
    assert.deepEqual(calls.order.slice(0, 5), [
      "claimReview",
      "prepareWorkspace",
      "runIndependentReviews",
      "listPostedFindingFingerprints",
      "publishReview"
    ]);
    assert.deepEqual(calls.prepareWorkspace[0], {
      repositoryUrl: "https://github.com/kei781/sql-agent.git",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      baseBranch: "main",
      headBranch: "feature/sql-guard",
      headSha: "abc123"
    });
    assert.equal(calls.publishReview.length, 1);
    assert.equal(calls.markReviewPublished.length, 1);

    const published = calls.publishReview[0] as Parameters<ReviewServerPorts["publisher"]["publishReview"]>[0];
    assert.equal(published.summary.reviewedSha, "abc123");
    assert.deepEqual(published.summary.reviewerAgentIds, ["reviewer-claude-code", "reviewer-codex"]);
    assert.equal(published.summary.keptFindingCount, 1);
    assert.equal(published.summary.droppedFindingCount, 1);
    assert.equal(published.summary.dedupedFindingCount, 0);
    assert.equal(published.summary.mergeSignal, "BLOCKED");
    assert.deepEqual(
      published.findings.map((finding) => finding.id),
      ["sql-limit-bypass"]
    );
  });

  it("routes dropped blocker candidates to human review instead of PASS", async () => {
    const { ports, calls } = createPorts({
      candidateFindings: [candidateFinding()],
      corroboratingAgentIdsByFindingId: {}
    });

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, {
      status: "published",
      keptFindingCount: 0,
      droppedFindingCount: 1,
      dedupedFindingCount: 0,
      mergeSignal: "HUMAN_REVIEW_REQUIRED"
    });

    const published = calls.publishReview[0] as Parameters<ReviewServerPorts["publisher"]["publishReview"]>[0];
    assert.deepEqual(published.summary.humanReviewReasons, ["dropped-blocker-candidate"]);
    assert.deepEqual(published.findings, []);
  });

  it("routes required risky paths to human review without skipping review", async () => {
    const { ports, calls } = createPorts({
      candidateFindings: [],
      corroboratingAgentIdsByFindingId: {}
    });

    const result = await runEnsembleReview(
      baseWebhookEvent({ changedPaths: [".github/workflows/ai-reviewer.yml"] }),
      ports
    );

    assert.deepEqual(result, {
      status: "published",
      keptFindingCount: 0,
      droppedFindingCount: 0,
      dedupedFindingCount: 0,
      mergeSignal: "HUMAN_REVIEW_REQUIRED"
    });
    assert.equal(calls.prepareWorkspace.length, 1);
    assert.equal(calls.runIndependentReviews.length, 1);

    const published = calls.publishReview[0] as Parameters<ReviewServerPorts["publisher"]["publishReview"]>[0];
    assert.deepEqual(published.summary.humanReviewReasons, ["required-risky-path"]);
    assert.deepEqual(published.summary.recommendedLabels, ["security-sensitive"]);
  });

  it("keeps PASS distinct from BLOCKED and records review-only publication state", async () => {
    const { ports, calls } = createPorts({
      candidateFindings: [
        candidateFinding({
          id: "optional-readability",
          fingerprint: "suggestion:optional-readability:src/query.ts",
          reviewerAgentId: "reviewer-codex",
          title: "Extract helper for readability",
          description: "This is non-blocking cleanup.",
          severity: "suggestion"
        })
      ],
      corroboratingAgentIdsByFindingId: {
        "optional-readability": ["reviewer-claude-code"]
      }
    });

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, {
      status: "published",
      keptFindingCount: 1,
      droppedFindingCount: 0,
      dedupedFindingCount: 0,
      mergeSignal: "PASS"
    });

    const published = calls.publishReview[0] as Parameters<ReviewServerPorts["publisher"]["publishReview"]>[0];
    assert.ok(published.summary.markerLines.includes("<!-- ai-review:review-state=REVIEWED -->"));
    assert.ok(published.summary.markerLines.includes("<!-- ai-review:MERGE_SIGNAL=PASS -->"));
  });

  it("deduplicates previously posted finding fingerprints without hiding active blockers", async () => {
    const existingBlocker = candidateFinding();
    const newSuggestion = candidateFinding({
      id: "optional-readability",
      fingerprint: "suggestion:optional-readability:src/query.ts",
      reviewerAgentId: "reviewer-codex",
      title: "Extract helper for readability",
      description: "This is non-blocking cleanup.",
      severity: "suggestion"
    });
    const { ports, calls } = createPorts({
      candidateFindings: [existingBlocker, newSuggestion],
      corroboratingAgentIdsByFindingId: {
        "sql-limit-bypass": ["reviewer-codex"],
        "optional-readability": ["reviewer-claude-code"]
      },
      alreadyPostedFingerprints: [existingBlocker.fingerprint]
    });

    const result = await runEnsembleReview(baseWebhookEvent({ action: "synchronize", headSha: "def456" }), ports);

    assert.deepEqual(result, {
      status: "published",
      keptFindingCount: 2,
      droppedFindingCount: 0,
      dedupedFindingCount: 1,
      mergeSignal: "BLOCKED"
    });

    const published = calls.publishReview[0] as Parameters<ReviewServerPorts["publisher"]["publishReview"]>[0];
    assert.deepEqual(
      published.findings.map((finding) => finding.fingerprint),
      [newSuggestion.fingerprint]
    );
    assert.equal(published.summary.dedupedFindingCount, 1);

    const completion = calls.markReviewPublished[0] as Parameters<
      ReviewServerPorts["stateStore"]["markReviewPublished"]
    >[0];
    assert.deepEqual(completion.postedFindingFingerprints, [newSuggestion.fingerprint]);
  });

  it("publishes a structured failure when workspace preparation throws", async () => {
    const { ports, calls } = createPorts({ prepareWorkspaceError: new Error("workspace failed") });

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, { status: "failed", stage: "prepare-workspace" });
    assert.equal(calls.publishFailure.length, 1);
    assert.equal(calls.markReviewFailed.length, 1);
    assert.equal(calls.publishReview.length, 0);

    const failure = calls.publishFailure[0] as Parameters<ReviewServerPorts["publisher"]["publishFailure"]>[0];
    assert.equal(failure.stage, "prepare-workspace");
    assert.equal(failure.message, "workspace failed");
  });

  it("publishes a structured failure when independent agent review throws", async () => {
    const { ports, calls } = createPorts({ runIndependentReviewsError: new Error("orchestrator failed") });

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, { status: "failed", stage: "run-independent-reviews" });
    assert.deepEqual(calls.order, [
      "claimReview",
      "prepareWorkspace",
      "runIndependentReviews",
      "publishFailure",
      "markReviewFailed"
    ]);
    assert.equal(calls.publishReview.length, 0);

    const failure = calls.publishFailure[0] as Parameters<ReviewServerPorts["publisher"]["publishFailure"]>[0];
    assert.equal(failure.stage, "run-independent-reviews");
    assert.equal(failure.message, "orchestrator failed");
  });

  it("publishes a structured failure when review publication throws", async () => {
    const { ports, calls } = createPorts({ publishReviewError: new Error("publish failed") });

    const result = await runEnsembleReview(baseWebhookEvent(), ports);

    assert.deepEqual(result, { status: "failed", stage: "publish-review" });
    assert.equal(calls.publishFailure.length, 1);
    assert.equal(calls.markReviewFailed.length, 1);

    const failure = calls.publishFailure[0] as Parameters<ReviewServerPorts["publisher"]["publishFailure"]>[0];
    assert.equal(failure.stage, "publish-review");
    assert.equal(failure.message, "publish failed");
  });
});
