import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideAutofixEligibility,
  decideModelPairIndependence,
  extractActionableMarkers,
  type AutofixBlockReason,
  type AutofixPolicyInput,
  type ModelPairPolicyInput
} from "../../../index.js";

describe("actionable reviewer markers", () => {
  it("parses actionable reviewer markers into stable fixer inputs", () => {
    const markers = extractActionableMarkers(trustedReviewerSummary(`
      <!-- ai-review:actionable id=A1 blocker=B1 severity=high category=security -->
      Review prose remains outside the contract.
      <!-- ai-review:actionable id=A2 blocker=B2 severity=medium category=tests -->
      <!-- ai-review:actionable id=BROKEN blocker=B3 severity=low -->
    `));

    assert.deepEqual(markers, [
      { id: "A1", blockerId: "B1", severity: "high", category: "security" },
      { id: "A2", blockerId: "B2", severity: "medium", category: "tests" }
    ]);
  });

  it("ignores untrusted comments and similarly prefixed marker names", () => {
    const untrustedMarkers = extractActionableMarkers({
      markdown: `
        <!-- ai-review:summary -->
        <!-- ai-review:actionable id=A1 blocker=B1 severity=critical category=security -->
      `,
      authorLogin: "random-user",
      trustedReviewerLogins: ["reviewer-bot"]
    });
    const prefixedMarkers = extractActionableMarkers(trustedReviewerSummary(`
      <!-- ai-review:actionable-disabled id=A1 blocker=B1 severity=high category=security -->
      <!-- ai-review:actionable-summary id=A2 blocker=B2 severity=high category=security -->
      <!-- ai-review:actionable id=A3 blocker=B3 severity=high category=security -->
    `));

    assert.deepEqual(untrustedMarkers, []);
    assert.deepEqual(prefixedMarkers, [{ id: "A3", blockerId: "B3", severity: "high", category: "security" }]);
  });

  it("deduplicates actionable markers by id", () => {
    const markers = extractActionableMarkers(trustedReviewerSummary(`
      <!-- ai-review:actionable id=A1 blocker=B1 severity=high category=security -->
      <!-- ai-review:actionable id=A1 blocker=B1 severity=medium category=tests -->
      <!-- ai-review:actionable id=A2 blocker=B2 severity=low category=tests -->
    `));

    assert.deepEqual(markers, [
      { id: "A1", blockerId: "B1", severity: "high", category: "security" },
      { id: "A2", blockerId: "B2", severity: "low", category: "tests" }
    ]);
  });
});

describe("model pair independence", () => {
  it("requires different frontier model families before fixer analysis", () => {
    const result = decideModelPairIndependence(validModelPair());

    assert.equal(result.allowed, true);
    assert.deepEqual(result.reasons, []);
  });

  it("blocks same-family or non-frontier model pairs", () => {
    const sameFamily = decideModelPairIndependence(
      validModelPair({
        fixer: { provider: "anthropic", model: "claude-sonnet", family: "claude", isFrontier: true }
      })
    );
    const nonFrontier = decideModelPairIndependence(
      validModelPair({
        fixer: { provider: "openai", model: "small-helper", family: "small", isFrontier: false }
      })
    );

    assert.equal(sameFamily.allowed, false);
    assert.ok(sameFamily.reasons.includes("same-model-family"));
    assert.equal(nonFrontier.allowed, false);
    assert.ok(nonFrontier.reasons.includes("fixer-not-frontier"));
  });
});

describe("autofix eligibility policy", () => {
  it("allows only fresh same-repo opt-in PRs with actionable markers", () => {
    const decision = decideAutofixEligibility(validAutofixInput());

    assert.equal(decision.allowed, true);
    assert.equal(decision.nextAction, "fixer-analyze");
    assert.deepEqual(decision.reasons, []);
    assert.equal(decision.actionableMarkers[0]?.id, "A1");
  });

  it("blocks unsafe or stale fixer analyze attempts with explicit reasons", () => {
    const cases: readonly [string, Partial<AutofixPolicyInput>, AutofixBlockReason][] = [
      ["missing opt-in label", { labels: [] }, "missing-autofix-label"],
      ["draft PR", { isDraft: true }, "draft-pr"],
      ["closed PR", { isClosed: true }, "closed-pr"],
      ["fork PR", { isFork: true }, "fork-pr"],
      ["blocking label", { labels: ["ai-autofix", "needs-human-review"] }, "blocked-label"],
      ["risky path", { changedPaths: [".github/workflows/review.yml"] }, "risky-path"],
      ["attempt cap", { fixAttempts: 3 }, "attempt-cap-reached"],
      ["stale reviewer SHA", { reviewerReviewedSha: "old-sha" }, "stale-review"],
      ["missing actionable markers", { actionableMarkers: [] }, "no-actionable-items"],
      ["processed actionable markers", { processedActionableIds: ["A1"] }, "actionable-already-processed"],
      [
        "model pair policy failure",
        { modelPair: validModelPair({ fixer: { provider: "openai", model: "small-helper", family: "small", isFrontier: false } }) },
        "model-pair-not-independent"
      ]
    ];

    for (const [name, overrides, expectedReason] of cases) {
      const decision = decideAutofixEligibility(validAutofixInput(overrides));

      assert.equal(decision.allowed, false, name);
      assert.equal(decision.nextAction, "skip", name);
      assert.ok(decision.reasons.includes(expectedReason), name);
    }
  });

  it("returns only unprocessed actionable markers to the future fixer analyze pass", () => {
    const decision = decideAutofixEligibility(
      validAutofixInput({
        actionableMarkers: [
          { id: "A1", blockerId: "B1", severity: "high", category: "security" },
          { id: "A2", blockerId: "B2", severity: "medium", category: "tests" }
        ],
        processedActionableIds: ["A1"]
      })
    );

    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.actionableMarkers, [{ id: "A2", blockerId: "B2", severity: "medium", category: "tests" }]);
  });
});

function validAutofixInput(overrides: Partial<AutofixPolicyInput> = {}): AutofixPolicyInput {
  return {
    labels: ["ai-autofix"],
    isDraft: false,
    isClosed: false,
    isFork: false,
    changedPaths: ["src/app/runEnsembleReview.ts"],
    fixAttempts: 0,
    maxFixAttempts: 3,
    currentHeadSha: "head-sha",
    reviewerReviewedSha: "head-sha",
    actionableMarkers: [{ id: "A1", blockerId: "B1", severity: "high", category: "security" }],
    processedActionableIds: [],
    modelPair: validModelPair(),
    ...overrides
  };
}

function validModelPair(overrides: Partial<ModelPairPolicyInput> = {}): ModelPairPolicyInput {
  return {
    reviewer: { provider: "anthropic", model: "claude-opus", family: "claude", isFrontier: true },
    fixer: { provider: "openai", model: "gpt-5", family: "gpt", isFrontier: true },
    ...overrides
  };
}

function trustedReviewerSummary(markdown: string): Parameters<typeof extractActionableMarkers>[0] {
  return {
    markdown: `<!-- ai-review:summary -->\n${markdown}`,
    authorLogin: "reviewer-bot",
    trustedReviewerLogins: ["reviewer-bot"]
  };
}
