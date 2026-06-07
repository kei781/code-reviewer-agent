import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideConservativeMergeGate,
  decideVerdictCheck,
  type ConservativeMergeGateBlockReason,
  type ConservativeMergeGateInput,
  type ConservativeMergeGateRecommendedLabel,
  type RequiredCheckStatus,
  type VerdictCheckConclusion,
  type VerdictCheckInput,
  type VerdictCheckReason
} from "../../../index.js";

describe("ai-review verdict check", () => {
  it("maps every verdict reason to the intended check conclusion", () => {
    const cases: readonly VerdictCase[] = [
      ["latest converged clean", {}, "success", "converged-clean"],
      ["first-pass clean", { convergenceState: "CONVERGING", passOrigin: "FIRST_PASS" }, "success", "first-pass-clean"],
      [
        "blockers found",
        { mergeSignal: "BLOCKED", convergenceState: "CONVERGING", unresolvedBlockerCount: 2 },
        "failure",
        "blockers-found"
      ],
      ["stale review", { reviewedHeadSha: "old-sha" }, "neutral", "stale-review"],
      ["unsupported PR", { supportedPullRequest: false }, "neutral", "unsupported-pr"],
      [
        "human review required",
        { mergeSignal: "HUMAN_REVIEW_REQUIRED", convergenceState: "CAPPED_WITH_OPEN", unresolvedBlockerCount: 1 },
        "neutral",
        "human-review-required"
      ],
      ["not ready", { convergenceState: "CONVERGING", passOrigin: "NONE" }, "neutral", "not-ready"]
    ];

    for (const [name, overrides, conclusion, reason] of cases) {
      const check = decideVerdictCheck(validVerdictInput(overrides));

      assert.equal(check.name, "ai-review/verdict", name);
      assert.equal(check.headSha, "head-sha", name);
      assert.equal(check.conclusion, conclusion, name);
      assert.deepEqual(check.reasons, [reason], name);
    }
  });
});

describe("P2-H conservative merge gate", () => {
  it("allows only GitHub native auto-merge enablement when every conservative gate passes", () => {
    const decision = decideConservativeMergeGate(validMergeGateInput());

    assert.equal(decision.allowed, true);
    assert.equal(decision.nextAction, "enable-github-auto-merge");
    assert.equal(decision.mergeMethod, "squash");
    assert.deepEqual(decision.reasons, []);
    assert.deepEqual(decision.requiredCheckStatuses, validRequiredChecks());
  });

  it("blocks every conservative gate branch with explicit reasons and recommended labels", () => {
    const cases: readonly MergeGateReasonCase[] = [
      ["missing automerge label", { labels: [] }, "missing-automerge-label", []],
      ["blocking label", { labels: ["ai-automerge", "needs-human-review"] }, "blocked-label", ["needs-human-review"]],
      ["stale verdict", { verdictCheck: staleVerdictCheck() }, "stale-verdict", []],
      ["verdict not success", { verdictCheck: blockedVerdictCheck() }, "verdict-not-success", []],
      ["empty required checks", { requiredChecks: [] }, "ci-not-success", []],
      ["failed required check", { requiredChecks: [{ name: "ci/test", status: "failure" }] }, "ci-not-success", []],
      [
        "branch protection missing",
        { branchProtectionSatisfied: false },
        "branch-protection-not-satisfied",
        ["needs-human-review"]
      ],
      [
        "human review missing",
        { requiredHumanReviewSatisfied: false },
        "human-review-not-satisfied",
        ["needs-human-review"]
      ],
      ["stale human review", { staleApproval: true }, "stale-human-review", ["needs-human-review"]],
      ["fork PR", { isFork: true }, "fork-pr", []],
      ["optional risky path", { changedPaths: ["package-lock.json"] }, "risky-path", ["needs-human-review"]],
      ["merge conflict", { hasMergeConflict: true }, "merge-conflict", ["needs-human-review"]],
      ["attempt cap", { fixAttempts: 3 }, "attempt-cap-reached", ["needs-human-review"]],
      ["untrusted author", { prAuthorLogin: "external-user" }, "untrusted-author", ["needs-human-review"]],
      ["model pair failure", { modelPairIndependent: false }, "model-pair-not-independent", ["needs-human-review"]]
    ];

    for (const [name, overrides, reason, recommendedLabels] of cases) {
      const decision = decideConservativeMergeGate(validMergeGateInput(overrides));

      assert.equal(decision.allowed, false, name);
      assert.equal(decision.nextAction, "skip", name);
      assert.ok(decision.reasons.includes(reason), name);
      for (const label of recommendedLabels) {
        assert.ok(decision.recommendedLabels.includes(label), name);
      }
    }
  });

  it("recommends security-sensitive for required risky paths", () => {
    const decision = decideConservativeMergeGate(validMergeGateInput({ changedPaths: [".github/workflows/review.yml"] }));

    assert.equal(decision.allowed, false);
    assert.ok(decision.reasons.includes("risky-path"));
    assert.ok(decision.recommendedLabels.includes("security-sensitive"));
  });
});

type VerdictCase = readonly [
  name: string,
  overrides: Partial<VerdictCheckInput>,
  conclusion: VerdictCheckConclusion,
  reason: VerdictCheckReason
];

type MergeGateReasonCase = readonly [
  name: string,
  overrides: Partial<ConservativeMergeGateInput>,
  reason: ConservativeMergeGateBlockReason,
  recommendedLabels: readonly ConservativeMergeGateRecommendedLabel[]
];

function validVerdictInput(overrides: Partial<VerdictCheckInput> = {}): VerdictCheckInput {
  return {
    currentHeadSha: "head-sha",
    reviewedHeadSha: "head-sha",
    mergeSignal: "PASS",
    convergenceState: "CONVERGED_CLEAN",
    passOrigin: "LOOP_FIXPOINT",
    unresolvedBlockerCount: 0,
    supportedPullRequest: true,
    ...overrides
  };
}

function validMergeGateInput(overrides: Partial<ConservativeMergeGateInput> = {}): ConservativeMergeGateInput {
  return {
    labels: ["ai-automerge"],
    currentHeadSha: "head-sha",
    verdictCheck: decideVerdictCheck(validVerdictInput()),
    requiredChecks: validRequiredChecks(),
    branchProtectionSatisfied: true,
    requiredHumanReviewSatisfied: true,
    staleApproval: false,
    isFork: false,
    changedPaths: ["src/domain/merge/mergeGatePolicy.ts"],
    hasMergeConflict: false,
    fixAttempts: 1,
    maxFixAttempts: 3,
    prAuthorLogin: "kei781",
    trustedAuthorLogins: ["kei781", "codex[bot]"],
    modelPairIndependent: true,
    ...overrides
  };
}

function validRequiredChecks(): readonly RequiredCheckStatus[] {
  return [
    { name: "ci/test", status: "success" },
    { name: "ai-review/verdict", status: "success" }
  ];
}

function staleVerdictCheck(): ReturnType<typeof decideVerdictCheck> {
  return decideVerdictCheck(validVerdictInput({ currentHeadSha: "new-head" }));
}

function blockedVerdictCheck(): ReturnType<typeof decideVerdictCheck> {
  return decideVerdictCheck(
    validVerdictInput({ mergeSignal: "BLOCKED", convergenceState: "CONVERGING", unresolvedBlockerCount: 1 })
  );
}
