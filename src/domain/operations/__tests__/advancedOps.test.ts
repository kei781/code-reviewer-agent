import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideAutonomousReadiness,
  decideVerdictCheck,
  planOperationalFollowUp,
  type AutonomousReadinessBlockReason,
  type AutonomousReadinessInput,
  type AutonomousReadinessRecommendedLabel,
  type OperationalAlertReason,
  type OperationalFollowUpInput,
  type OperationalRunbookId,
  type RequiredCheckStatus,
  type VerdictCheckInput
} from "../../../index.js";

describe("P2-A autonomous readiness", () => {
  it("does not enter autonomous evaluation without an explicit ADR amendment", () => {
    const decision = decideAutonomousReadiness(
      validAutonomousInput({
        policyApproval: {
          ...validPolicyApproval(),
          adrAmendmentApproved: false
        }
      })
    );

    assert.equal(decision.allowed, false);
    assert.equal(decision.nextAction, "skip");
    assert.ok(decision.reasons.includes("missing-adr-amendment"));
    assert.ok(decision.recommendedLabels.includes("needs-human-review"));
  });

  it("allows only low-risk autonomous evaluation when every explicit gate passes", () => {
    const decision = decideAutonomousReadiness(validAutonomousInput());

    assert.equal(decision.allowed, true);
    assert.equal(decision.nextAction, "allow-low-risk-autonomous-evaluation");
    assert.deepEqual(decision.reasons, []);
    assert.deepEqual(decision.unmatchedLowRiskPaths, []);
    assert.deepEqual(decision.requiredCheckStatuses, validRequiredChecks());
  });

  it("blocks every approval and shared gate branch with explicit reasons", () => {
    const cases: readonly AutonomousReasonCase[] = [
      ["missing automerge label", { labels: [] }, "missing-automerge-label", []],
      ["blocking label", { labels: ["ai-automerge", "do-not-merge"] }, "blocked-label", ["needs-human-review"]],
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
        "missing low risk policy",
        { policyApproval: { ...validPolicyApproval(), lowRiskPathPatterns: [] } },
        "missing-low-risk-policy",
        ["needs-human-review"]
      ],
      [
        "missing trusted author policy",
        { policyApproval: { ...validPolicyApproval(), trustedAuthorLogins: [] } },
        "missing-trusted-author-allowlist",
        ["needs-human-review"]
      ],
      [
        "human review relaxation not approved",
        { policyApproval: { ...validPolicyApproval(), humanReviewRelaxationApproved: false } },
        "human-review-relaxation-not-approved",
        ["needs-human-review"]
      ],
      [
        "rollback procedure missing",
        { policyApproval: { ...validPolicyApproval(), rollbackProcedureDocumented: false } },
        "missing-rollback-procedure",
        ["needs-human-review"]
      ],
      ["fork PR", { isFork: true }, "fork-pr", ["needs-human-review"]],
      ["merge conflict", { hasMergeConflict: true }, "merge-conflict", ["needs-human-review"]],
      ["attempt cap", { fixAttempts: 3 }, "attempt-cap-reached", ["needs-human-review"]],
      ["untrusted author", { prAuthorLogin: "external-user" }, "untrusted-author", ["needs-human-review"]],
      ["model pair failure", { modelPairIndependent: false }, "model-pair-not-independent", ["needs-human-review"]]
    ];

    for (const [name, overrides, reason, recommendedLabels] of cases) {
      const decision = decideAutonomousReadiness(validAutonomousInput(overrides));

      assert.equal(decision.allowed, false, name);
      assert.equal(decision.nextAction, "skip", name);
      assert.ok(decision.reasons.includes(reason), name);
      for (const label of recommendedLabels) {
        assert.ok(decision.recommendedLabels.includes(label), name);
      }
    }
  });

  it("blocks risky and non-allowlisted paths before autonomous evaluation", () => {
    const riskyDecision = decideAutonomousReadiness(
      validAutonomousInput({ changedPaths: ["docs/runbook.md", ".github/workflows/review.yml"] })
    );
    const unmatchedDecision = decideAutonomousReadiness(
      validAutonomousInput({ changedPaths: ["src/domain/policy/autofixPolicy.ts"] })
    );

    assert.equal(riskyDecision.allowed, false);
    assert.ok(riskyDecision.reasons.includes("risky-path"));
    assert.ok(riskyDecision.recommendedLabels.includes("security-sensitive"));
    assert.deepEqual(riskyDecision.unmatchedLowRiskPaths, [".github/workflows/review.yml"]);

    assert.equal(unmatchedDecision.allowed, false);
    assert.ok(unmatchedDecision.reasons.includes("not-low-risk-path"));
    assert.ok(unmatchedDecision.recommendedLabels.includes("needs-human-review"));
    assert.deepEqual(unmatchedDecision.unmatchedLowRiskPaths, ["src/domain/policy/autofixPolicy.ts"]);
  });
});

describe("P3 operational follow-up planning", () => {
  it("returns pure alert and runbook data for stalled or capped automation", () => {
    const stalled = planOperationalFollowUp(validOperationalInput({ terminalState: "STALLED_OSCILLATING" }));
    const capped = planOperationalFollowUp(validOperationalInput({ terminalState: "CAPPED_WITH_OPEN" }));

    assertOperationalIncludes(stalled, ["human-review-required", "stalled"], ["manual-review", "inspect-loop-state"]);
    assertOperationalIncludes(capped, ["human-review-required", "capped-with-open"], ["manual-review", "inspect-loop-state"]);
  });

  it("plans operational alerts for merge blocks, budgets, workflow failures, and rollback needs", () => {
    const plan = planOperationalFollowUp(
      validOperationalInput({
        mergeGateAllowed: false,
        mergeGateReasons: ["branch-protection-not-satisfied"],
        costUsd: 14,
        costBudgetUsd: 10,
        runtimeMinutes: 25,
        runtimeBudgetMinutes: 20,
        workflowFailed: true,
        rollbackRequested: true
      })
    );

    assert.equal(plan.shouldAlert, true);
    assertOperationalIncludes(
      plan,
      [
        "merge-gate-blocked",
        "cost-budget-exceeded",
        "runtime-budget-exceeded",
        "workflow-failure",
        "rollback-needed"
      ],
      ["check-branch-protection", "cost-review", "retry-orchestrator", "rollback-procedure"]
    );
    assert.ok(plan.recommendedChannels.includes("github-comment"));
    assert.ok(plan.recommendedChannels.includes("slack"));
  });
});

type AutonomousReasonCase = readonly [
  name: string,
  overrides: Partial<AutonomousReadinessInput>,
  reason: AutonomousReadinessBlockReason,
  recommendedLabels: readonly AutonomousReadinessRecommendedLabel[]
];

function validAutonomousInput(overrides: Partial<AutonomousReadinessInput> = {}): AutonomousReadinessInput {
  return {
    labels: ["ai-automerge"],
    currentHeadSha: "head-sha",
    verdictCheck: decideVerdictCheck(validVerdictInput()),
    requiredChecks: validRequiredChecks(),
    branchProtectionSatisfied: true,
    policyApproval: validPolicyApproval(),
    isFork: false,
    changedPaths: ["docs/runbook.md"],
    hasMergeConflict: false,
    fixAttempts: 1,
    maxFixAttempts: 3,
    prAuthorLogin: "kei781",
    modelPairIndependent: true,
    ...overrides
  };
}

function validPolicyApproval(): AutonomousReadinessInput["policyApproval"] {
  return {
    adrAmendmentApproved: true,
    lowRiskPathPatterns: ["docs/**", "src/project/**"],
    trustedAuthorLogins: ["kei781", "codex[bot]"],
    humanReviewRelaxationApproved: true,
    rollbackProcedureDocumented: true
  };
}

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

function validOperationalInput(overrides: Partial<OperationalFollowUpInput> = {}): OperationalFollowUpInput {
  return {
    terminalState: "CONVERGED_CLEAN",
    mergeGateAllowed: true,
    mergeGateReasons: [],
    costUsd: 2,
    costBudgetUsd: 10,
    runtimeMinutes: 5,
    runtimeBudgetMinutes: 20,
    workflowFailed: false,
    rollbackRequested: false,
    unresolvedThreadCount: 0,
    humanReviewRequired: false,
    ...overrides
  };
}

function assertOperationalIncludes(
  plan: ReturnType<typeof planOperationalFollowUp>,
  reasons: readonly OperationalAlertReason[],
  runbooks: readonly OperationalRunbookId[]
): void {
  for (const reason of reasons) {
    assert.ok(plan.alertReasons.includes(reason), reason);
  }

  for (const runbook of runbooks) {
    assert.ok(plan.runbookIds.includes(runbook), runbook);
  }
}
