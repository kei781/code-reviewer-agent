# Phase 5 Conservative Merge Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pure P2-H merge-gate contracts for `ai-review/verdict` check outcomes and conservative GitHub native auto-merge eligibility while preserving human final review.

**Architecture:** Keep Phase 5 in domain modules. `src/domain/merge/verdictCheck.ts` maps review/convergence facts to an `ai-review/verdict` check publication contract. `src/domain/merge/mergeGatePolicy.ts` decides whether an adapter may enable GitHub native auto-merge. No module will call GitHub, run `gh pr merge`, bypass branch protection, approve PRs, or inspect process environment.

**Tech Stack:** TypeScript, Node.js test runner, existing domain/export patterns.

---

## File Structure

- Create `src/domain/merge/verdictCheck.ts`: pure `ai-review/verdict` conclusion mapping for latest-head review signals.
- Create `src/domain/merge/mergeGatePolicy.ts`: pure conservative auto-merge eligibility for P2-H.
- Create `src/domain/merge/__tests__/mergeGatePolicy.test.ts`: red-green coverage for verdict success/failure/neutral and merge gate blockers.
- Modify `src/index.ts`: export Phase 5 functions and types.
- Modify `src/project/phase-plan.ts` and `src/project/__tests__/phase-plan.test.ts`: mark Phase 4 implemented and Phase 5 implementing.
- Modify `docs/구현내용.md` and `docs/architecture/directory-structure.md`: record Phase 5 SDD scope and boundary.

## Task 1: Verdict Check Contract

- [x] **Step 1: Write failing tests**

```typescript
const check = decideVerdictCheck({
  currentHeadSha: "sha2",
  reviewedHeadSha: "sha2",
  mergeSignal: "PASS",
  convergenceState: "CONVERGED_CLEAN",
  passOrigin: "LOOP_FIXPOINT",
  unresolvedBlockerCount: 0,
  supportedPullRequest: true
});

assert.equal(check.name, "ai-review/verdict");
assert.equal(check.conclusion, "success");
assert.equal(check.headSha, "sha2");
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because `decideVerdictCheck` is not exported.

- [x] **Step 3: Implement verdict check**

Map latest `CONVERGED_CLEAN` and first-pass blocker-zero review signals to `success`, blockers to `failure`, and human-review/stale/unsupported states to `neutral`. Keep the result as data for adapters.

- [x] **Step 4: Run GREEN**

Run: `npm run check`

Expected: verdict tests pass.

## Task 2: Conservative Merge Gate

- [x] **Step 1: Write failing tests**

```typescript
const decision = decideConservativeMergeGate(validMergeGateInput());

assert.equal(decision.allowed, true);
assert.equal(decision.nextAction, "enable-github-auto-merge");
assert.equal(decision.mergeMethod, "squash");
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because `decideConservativeMergeGate` is not exported.

- [x] **Step 3: Implement policy**

Require `ai-automerge`, latest successful `ai-review/verdict`, successful required CI checks, branch protection, required human review, no stale approval, no blocking labels, no risky paths, no fork PR, no merge conflict, trusted author, model-pair independence, and fix attempts below cap.

- [x] **Step 4: Run GREEN**

Run: `npm run check`

Expected: merge gate tests pass.

## Task 3: Metadata and Docs

- [x] **Step 1: Write/update phase metadata test**

Phase 4 should be `implemented`; Phase 5 should be `implementing`.

- [x] **Step 2: Update docs**

Record that Phase 5 provides branch-protection-compatible data contracts only. Concrete check-run/status publishing, label creation, branch protection configuration, and `gh pr merge --auto --squash` execution remain adapter/ops work.

- [x] **Step 3: Final verification**

Run:

```bash
npm run check
node scripts/setup.mjs
git diff --check
rg -n "console\\.log" src scripts
```

Expected: all checks pass; `rg` has no direct `console.log` matches.

## Self-Review

- Spec coverage: ADR D14, D15, D16 and PRD FR-013/FR-014 P2-H acceptance criteria are covered.
- Scope check: No GitHub SDK calls, shell merge commands, branch-protection bypass, approval substitution, or write-token behavior is included.
- Type consistency: new exported names are `decideVerdictCheck`, `decideConservativeMergeGate`, `VerdictCheckPublication`, and `ConservativeMergeGateDecision`.
