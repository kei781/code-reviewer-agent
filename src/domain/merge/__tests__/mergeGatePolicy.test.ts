import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideConservativeMergeGate,
  decideVerdictCheck,
  type ConservativeMergeGateInput,
  type RequiredCheckStatus,
  type VerdictCheckInput
} from "../../../index.js";

describe("ai-review verdict check", () => {
  it("publishes success for latest converged clean signals", () => {
    const check = decideVerdictCheck(validVerdictInput());

    assert.equal(check.name, "ai-review/verdict");
    assert.equal(check.headSha, "head-sha");
    assert.equal(check.conclusion, "success");
    assert.deepEqual(check.reasons, ["converged-clean"]);
  });

  it("publishes success for first-pass blocker-zero signals", () => {
    const check = decideVerdictCheck(
      validVerdictInput({
        convergenceState: "CONVERGING",
        passOrigin: "FIRST_PASS"
      })
    );

    assert.equal(check.conclusion, "success");
    assert.deepEqual(check.reasons, ["first-pass-clean"]);
  });

  it("publishes failure for latest blocker findings", () => {
    const check = decideVerdictCheck(
      validVerdictInput({
        mergeSignal: "BLOCKED",
        convergenceState: "CONVERGING",
        unresolvedBlockerCount: 2
      })
    );

    assert.equal(check.conclusion, "failure");
    assert.deepEqual(check.reasons, ["blockers-found"]);
  });

  it("publishes neutral for stale, unsupported, or human-review signals", () => {
    const stale = decideVerdictCheck(validVerdictInput({ reviewedHeadSha: "old-sha" }));
    const unsupported = decideVerdictCheck(validVerdictInput({ supportedPullRequest: false }));
    const humanReview = decideVerdictCheck(
      validVerdictInput({
        mergeSignal: "HUMAN_REVIEW_REQUIRED",
        convergenceState: "CAPPED_WITH_OPEN",
        unresolvedBlockerCount: 1
      })
    );

    assert.equal(stale.conclusion, "neutral");
    assert.deepEqual(stale.reasons, ["stale-review"]);
    assert.equal(unsupported.conclusion, "neutral");
    assert.deepEqual(unsupported.reasons, ["unsupported-pr"]);
    assert.equal(humanReview.conclusion, "neutral");
    assert.deepEqual(humanReview.reasons, ["human-review-required"]);
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

  it("blocks auto-merge without ai-automerge or required human review", () => {
    const missingLabel = decideConservativeMergeGate(validMergeGateInput({ labels: [] }));
    const missingHumanReview = decideConservativeMergeGate(
      validMergeGateInput({
        requiredHumanReviewSatisfied: false
      })
    );

    assert.equal(missingLabel.allowed, false);
    assert.equal(missingLabel.nextAction, "skip");
    assert.ok(missingLabel.reasons.includes("missing-automerge-label"));
    assert.equal(missingHumanReview.allowed, false);
    assert.ok(missingHumanReview.reasons.includes("human-review-not-satisfied"));
  });

  it("blocks stale verdicts, failed CI, branch-protection gaps, and blocking labels", () => {
    const cases: readonly [string, Partial<ConservativeMergeGateInput>, string][] = [
      [
        "stale verdict",
        { verdictCheck: decideVerdictCheck(validVerdictInput({ currentHeadSha: "new-head" })) },
        "stale-verdict"
      ],
      [
        "verdict not success",
        {
          verdictCheck: decideVerdictCheck(
            validVerdictInput({ mergeSignal: "BLOCKED", convergenceState: "CONVERGING", unresolvedBlockerCount: 1 })
          )
        },
        "verdict-not-success"
      ],
      ["failed CI", { requiredChecks: [{ name: "ci/test", status: "failure" }] }, "ci-not-success"],
      ["branch protection missing", { branchProtectionSatisfied: false }, "branch-protection-not-satisfied"],
      ["blocking label", { labels: ["ai-automerge", "needs-human-review"] }, "blocked-label"]
    ];

    for (const [name, overrides, reason] of cases) {
      const decision = decideConservativeMergeGate(validMergeGateInput(overrides));

      assert.equal(decision.allowed, false, name);
      assert.ok(decision.reasons.includes(reason as never), name);
    }
  });

  it("blocks fork PRs, risky paths, merge conflicts, attempt caps, untrusted authors, and model-pair failures", () => {
    const cases: readonly [string, Partial<ConservativeMergeGateInput>, string][] = [
      ["fork PR", { isFork: true }, "fork-pr"],
      ["risky path", { changedPaths: [".github/workflows/review.yml"] }, "risky-path"],
      ["merge conflict", { hasMergeConflict: true }, "merge-conflict"],
      ["attempt cap", { fixAttempts: 3 }, "attempt-cap-reached"],
      ["untrusted author", { prAuthorLogin: "external-user" }, "untrusted-author"],
      ["model pair failure", { modelPairIndependent: false }, "model-pair-not-independent"]
    ];

    for (const [name, overrides, reason] of cases) {
      const decision = decideConservativeMergeGate(validMergeGateInput(overrides));

      assert.equal(decision.allowed, false, name);
      assert.ok(decision.reasons.includes(reason as never), name);
    }
  });
});

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
