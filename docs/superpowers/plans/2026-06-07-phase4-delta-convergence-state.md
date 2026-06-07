# Phase 4 Delta Convergence State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pure P1 convergence-state contracts for delta verification, round caps, oscillation detection, and hidden PR comment marker parsing.

**Architecture:** Keep Phase 4 in domain modules. A convergence state machine decides `CONVERGED_CLEAN`, `STALLED_OSCILLATING`, `CAPPED_WITH_OPEN`, or `CONVERGING` from typed reviewer/fixer loop facts. A marker parser extracts existing `ai-orchestrator` state comments into typed state so future adapters can persist/recover loop context without coupling domain logic to GitHub APIs.

**Tech Stack:** TypeScript, Node.js test runner, existing domain/export patterns.

---

## File Structure

- Create `src/domain/convergence/convergenceState.ts`: pure terminal-state decision for delta verification and blocker trend checks.
- Create `src/domain/review/orchestratorStateMarker.ts`: parser for hidden `ai-orchestrator:*` markers.
- Create `src/domain/convergence/__tests__/convergenceState.test.ts`: red-green coverage for terminal states and marker parsing.
- Modify `src/domain/review/reviewMarker.ts`: widen convergence-state type to include ADR/PRD terminal states while preserving existing `HUMAN_REVIEW_REQUIRED` marker compatibility.
- Modify `src/index.ts`: export new Phase 4 types/functions.
- Modify `src/project/phase-plan.ts` and `src/project/__tests__/phase-plan.test.ts`: mark Phase 3 implemented and Phase 4 implementing.
- Modify `docs/구현내용.md` and `docs/architecture/directory-structure.md`: record Phase 4 SDD scope and boundary.

## Task 1: Convergence State Machine

- [x] **Step 1: Write failing tests**

```typescript
it("declares converged clean only for latest SHA PASS with zero blockers", () => {
  const decision = decideConvergenceState({
    currentHeadSha: "sha2",
    reviewerReviewedSha: "sha2",
    mergeSignal: "PASS",
    unresolvedBlockerCount: 0,
    previousUnresolvedBlockerCount: 1,
    repeatedBlockerClasses: [],
    fixAttempts: 1,
    maxFixAttempts: 3,
    fixerDiffIntroducedBlocker: false
  });

  assert.equal(decision.state, "CONVERGED_CLEAN");
  assert.equal(decision.passOrigin, "LOOP_FIXPOINT");
});
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because `decideConvergenceState` is not exported.

- [x] **Step 3: Implement state machine**

Block stale reviewer SHAs, fixer-introduced blockers, non-decreasing blocker count, repeated blocker classes, and capped attempts. Do not add model calls, patch application, PR comments, or GitHub side effects.

- [x] **Step 4: Run GREEN**

Run: `npm run check`

Expected: convergence tests pass.

## Task 2: Orchestrator Marker Parser

- [x] **Step 1: Write failing parser tests**

```typescript
it("parses hidden orchestrator state markers", () => {
  const state = parseOrchestratorStateMarkers(
    `
      <!-- ai-orchestrator:state=VERIFYING -->
      <!-- ai-orchestrator:epoch=2 -->
      <!-- ai-orchestrator:last-reviewer-reviewed-sha=sha2 -->
      <!-- ai-orchestrator:fix-attempts=1 -->
      <!-- ai-orchestrator:processed-actionable-ids=A1,A2 -->
    `,
    {
      commentAuthorLogin: "ai-orchestrator[bot]",
      trustedOrchestratorLogins: ["ai-orchestrator[bot]"]
    }
  );

  assert.equal(state.state, "VERIFYING");
  assert.equal(state.epoch, 2);
  assert.deepEqual(state.processedActionableIds, ["A1", "A2"]);
});
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because `parseOrchestratorStateMarkers` is not exported.

- [x] **Step 3: Implement parser**

Parse only known keys from trusted orchestrator comment authors and normalize comma-separated ids. Invalid numeric values should be omitted rather than converted to `NaN`. Parsed marker values are audit output only, not authoritative loop state.

- [x] **Step 4: Run GREEN**

Run: `npm run check`

Expected: parser tests pass.

## Task 3: Metadata and Docs

- [x] **Step 1: Write failing phase metadata test**

```typescript
it("marks phase 4 as the current implementation phase", () => {
  const phase3 = implementationPhases.find((phase) => phase.id === "phase-3");
  const phase4 = implementationPhases.find((phase) => phase.id === "phase-4");

  assert.equal(phase3?.status, "implemented");
  assert.equal(phase4?.status, "implementing");
});
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because Phase 4 is still `planned`.

- [x] **Step 3: Update docs**

Record that Phase 4 adds pure convergence and marker contracts only. Explicitly state that reviewer execution, fixer patch application, GitHub comment updates, and merge gates remain future adapter work.

- [x] **Step 4: Final verification**

Run:

```bash
npm run check
node scripts/setup.mjs
git diff --check
rg -n "console\\.log" src scripts
```

Expected: all checks pass; `rg` has no direct `console.log` matches.

## Self-Review

- Spec coverage: ADR D6, D7, D8, D11 and PRD P1 acceptance criteria for terminal states and hidden state markers are covered.
- Scope check: No app use case, GitHub adapter, write-token apply job, or auto-merge behavior is included.
- Type consistency: new exported names are `decideConvergenceState`, `parseOrchestratorStateMarkers`, `ConvergenceDecision`, and `OrchestratorStateMarkers`.

## Review Follow-up

- Added a first-round guard so initial reviews with blockers stay `CONVERGING` instead of being misclassified as stalled.
- Kept fixer-diff-introduced blockers as immediate `STALLED_OSCILLATING` and added coverage documenting that ADR D7 interpretation.
- Required trusted orchestrator comment provenance before parsing `ai-orchestrator` markers and marked parsed data as `audit-only`.
- Added support for `terminal-state` and multiple `key=value` attributes in one marker.
