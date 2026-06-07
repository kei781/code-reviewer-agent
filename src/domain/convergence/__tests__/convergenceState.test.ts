import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideConvergenceState,
  parseOrchestratorStateMarkers,
  type ConvergenceStateInput
} from "../../../index.js";

describe("convergence state machine", () => {
  it("declares converged clean only for latest SHA PASS with zero blockers", () => {
    const decision = decideConvergenceState(validConvergenceInput());

    assert.equal(decision.state, "CONVERGED_CLEAN");
    assert.equal(decision.passOrigin, "LOOP_FIXPOINT");
    assert.deepEqual(decision.reasons, []);
    assert.deepEqual(decision.recommendedLabels, []);
  });

  it("keeps stale reviewer decisions out of terminal states", () => {
    const decision = decideConvergenceState(validConvergenceInput({ reviewerReviewedSha: "old-sha" }));

    assert.equal(decision.state, "CONVERGING");
    assert.equal(decision.passOrigin, "NONE");
    assert.deepEqual(decision.reasons, ["stale-review"]);
  });

  it("caps loops with open blockers after the maximum fix attempts", () => {
    const decision = decideConvergenceState(
      validConvergenceInput({
        mergeSignal: "BLOCKED",
        unresolvedBlockerCount: 1,
        previousUnresolvedBlockerCount: 1,
        fixAttempts: 3
      })
    );

    assert.equal(decision.state, "CAPPED_WITH_OPEN");
    assert.equal(decision.passOrigin, "NONE");
    assert.deepEqual(decision.reasons, ["max-fix-attempts-reached"]);
    assert.deepEqual(decision.recommendedLabels, ["needs-human-review"]);
  });

  it("detects stalled oscillating loops when blockers do not decrease or classes repeat", () => {
    const nonDecreasing = decideConvergenceState(
      validConvergenceInput({
        mergeSignal: "BLOCKED",
        unresolvedBlockerCount: 2,
        previousUnresolvedBlockerCount: 2
      })
    );
    const repeatedClass = decideConvergenceState(
      validConvergenceInput({
        mergeSignal: "BLOCKED",
        unresolvedBlockerCount: 1,
        previousUnresolvedBlockerCount: 2,
        repeatedBlockerClasses: ["security-gate"]
      })
    );

    assert.equal(nonDecreasing.state, "STALLED_OSCILLATING");
    assert.ok(nonDecreasing.reasons.includes("blocker-count-not-decreasing"));
    assert.equal(repeatedClass.state, "STALLED_OSCILLATING");
    assert.ok(repeatedClass.reasons.includes("repeated-blocker-class"));
  });

  it("continues verification while blockers are strictly decreasing", () => {
    const decision = decideConvergenceState(
      validConvergenceInput({
        mergeSignal: "BLOCKED",
        unresolvedBlockerCount: 1,
        previousUnresolvedBlockerCount: 3
      })
    );

    assert.equal(decision.state, "CONVERGING");
    assert.deepEqual(decision.reasons, ["open-blockers"]);
  });
});

describe("orchestrator state markers", () => {
  it("parses hidden orchestrator state markers", () => {
    const state = parseOrchestratorStateMarkers(`
      <!-- ai-orchestrator:state=VERIFYING -->
      <!-- ai-orchestrator:epoch=2 -->
      <!-- ai-orchestrator:last-reviewer-reviewed-sha=sha2 -->
      <!-- ai-orchestrator:last-fixer-fixed-sha=sha1 -->
      <!-- ai-orchestrator:fix-attempts=1 -->
      <!-- ai-orchestrator:processed-actionable-ids=A1,A2 -->
      <!-- ai-orchestrator:processed-blocker-ids=B1,B2 -->
      <!-- ai-orchestrator:blocker-history=B1:open->fixed->verified -->
      <!-- ai-orchestrator:last-fixer-run-id=run-42 -->
    `);

    assert.equal(state.state, "VERIFYING");
    assert.equal(state.epoch, 2);
    assert.equal(state.lastReviewerReviewedSha, "sha2");
    assert.equal(state.lastFixerFixedSha, "sha1");
    assert.equal(state.fixAttempts, 1);
    assert.deepEqual(state.processedActionableIds, ["A1", "A2"]);
    assert.deepEqual(state.processedBlockerIds, ["B1", "B2"]);
    assert.equal(state.blockerHistory, "B1:open->fixed->verified");
    assert.equal(state.lastFixerRunId, "run-42");
  });

  it("omits invalid numeric marker values instead of returning NaN", () => {
    const state = parseOrchestratorStateMarkers(`
      <!-- ai-orchestrator:epoch=not-a-number -->
      <!-- ai-orchestrator:fix-attempts=also-bad -->
      <!-- ai-orchestrator:processed-actionable-ids= A1, , A2 -->
    `);

    assert.equal(state.epoch, undefined);
    assert.equal(state.fixAttempts, undefined);
    assert.deepEqual(state.processedActionableIds, ["A1", "A2"]);
  });
});

function validConvergenceInput(overrides: Partial<ConvergenceStateInput> = {}): ConvergenceStateInput {
  return {
    currentHeadSha: "sha2",
    reviewerReviewedSha: "sha2",
    mergeSignal: "PASS",
    unresolvedBlockerCount: 0,
    previousUnresolvedBlockerCount: 1,
    repeatedBlockerClasses: [],
    fixAttempts: 1,
    maxFixAttempts: 3,
    fixerDiffIntroducedBlocker: false,
    ...overrides
  };
}
