# Phase 3 Autofix Policy Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first P1 `ai-autofix` policy gate and actionable marker contract without adding patch generation, push, merge, or write-token behavior.

**Architecture:** Keep Phase 3 in pure domain modules. The domain layer parses reviewer actionable markers, checks R/F model independence, and decides whether a fixer analyze pass is eligible. App/adapters will consume this contract in later phases through ports, so this PR must not add GitHub Actions fixer jobs or concrete SDK calls.

**Tech Stack:** TypeScript, Node.js test runner, existing `src/domain`, `src/project`, and docs structure.

---

## File Structure

- Create `src/domain/fixer/actionableMarker.ts`: parse `<!-- ai-review:actionable ... -->` comments into a typed, human-editable contract.
- Create `src/domain/policy/modelPairPolicy.ts`: pure R/F frontier and independence gate.
- Create `src/domain/policy/autofixPolicy.ts`: pure `ai-autofix` eligibility decision using labels, PR state, risky paths, attempt cap, SHA freshness, actionable markers, and model pair decision.
- Create `src/domain/policy/__tests__/autofixPolicy.test.ts`: red-green tests for the Phase 3 contract.
- Modify `src/index.ts`: export new pure policy functions and types.
- Modify `src/project/phase-plan.ts` and `src/project/__tests__/phase-plan.test.ts`: mark Phase 2 implemented and Phase 3 implementing.
- Modify `docs/구현내용.md`: record Phase 3 SDD notes and verification.
- Modify `docs/architecture/directory-structure.md`: record the new pure fixer-domain boundary.

## Task 1: Actionable Marker Contract

**Files:**
- Create: `src/domain/fixer/actionableMarker.ts`
- Test: `src/domain/policy/__tests__/autofixPolicy.test.ts`

- [x] **Step 1: Write the failing marker parser tests**

```typescript
it("parses actionable reviewer markers into stable fixer inputs", () => {
  const markers = extractActionableMarkers(`
    <!-- ai-review:actionable id=A1 blocker=B1 severity=high category=security -->
    <!-- ai-review:actionable id=A2 blocker=B2 severity=medium category=tests -->
  `);

  assert.deepEqual(markers, [
    { id: "A1", blockerId: "B1", severity: "high", category: "security" },
    { id: "A2", blockerId: "B2", severity: "medium", category: "tests" }
  ]);
});
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because `extractActionableMarkers` is not exported.

- [x] **Step 3: Implement the parser**

Use a small HTML-comment marker scanner. The parser accepts only markers whose `id`, `blocker`, `severity`, and `category` attributes are present, so malformed comments never become fixer inputs.

- [x] **Step 4: Run GREEN**

Run: `npm run check`

Expected: marker tests pass.

## Task 2: Model Pair Independence Gate

**Files:**
- Create: `src/domain/policy/modelPairPolicy.ts`
- Test: `src/domain/policy/__tests__/autofixPolicy.test.ts`

- [x] **Step 1: Write failing tests for R/F policy**

```typescript
it("requires different frontier model families before fixer analysis", () => {
  const result = decideModelPairIndependence({
    reviewer: { provider: "anthropic", model: "claude-opus", family: "claude", isFrontier: true },
    fixer: { provider: "openai", model: "gpt-5", family: "gpt", isFrontier: true }
  });

  assert.equal(result.allowed, true);
});

it("blocks same-family or non-frontier model pairs", () => {
  const sameFamily = decideModelPairIndependence({
    reviewer: { provider: "anthropic", model: "claude-opus", family: "claude", isFrontier: true },
    fixer: { provider: "anthropic", model: "claude-sonnet", family: "claude", isFrontier: true }
  });

  const nonFrontier = decideModelPairIndependence({
    reviewer: { provider: "anthropic", model: "claude-opus", family: "claude", isFrontier: true },
    fixer: { provider: "openai", model: "cheap-helper", family: "small", isFrontier: false }
  });

  assert.equal(sameFamily.allowed, false);
  assert.equal(nonFrontier.allowed, false);
});
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because `decideModelPairIndependence` is not exported.

- [x] **Step 3: Implement the policy**

Return explicit block reasons for same model, non-frontier reviewer/fixer, and same model family. Different provider is recommended by ADR/PRD but same provider with different family remains a future policy amendment decision, so Phase 3 records provider difference as a warning rather than a hard block.

- [x] **Step 4: Run GREEN**

Run: `npm run check`

Expected: model pair tests pass.

## Task 3: Autofix Eligibility Gate

**Files:**
- Create: `src/domain/policy/autofixPolicy.ts`
- Test: `src/domain/policy/__tests__/autofixPolicy.test.ts`

- [x] **Step 1: Write failing eligibility tests**

```typescript
it("allows only fresh same-repo opt-in PRs with actionable markers", () => {
  const decision = decideAutofixEligibility(validAutofixInput());

  assert.equal(decision.allowed, true);
  assert.equal(decision.actionableMarkers.length, 1);
});

it("blocks missing opt-in labels, forks, stale review SHA, risky paths, and attempt caps", () => {
  assert.equal(decideAutofixEligibility(validAutofixInput({ labels: [] })).allowed, false);
  assert.equal(decideAutofixEligibility(validAutofixInput({ isFork: true })).allowed, false);
  assert.equal(decideAutofixEligibility(validAutofixInput({ reviewerReviewedSha: "old" })).allowed, false);
  assert.equal(decideAutofixEligibility(validAutofixInput({ changedPaths: [".github/workflows/review.yml"] })).allowed, false);
  assert.equal(decideAutofixEligibility(validAutofixInput({ fixAttempts: 3 })).allowed, false);
});
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because `decideAutofixEligibility` is not exported.

- [x] **Step 3: Implement the gate**

Use explicit reasons: `missing-autofix-label`, `draft-pr`, `closed-pr`, `fork-pr`, `blocked-label`, `risky-path`, `attempt-cap-reached`, `stale-review`, `no-actionable-items`, and `model-pair-not-independent`.

- [x] **Step 4: Run GREEN**

Run: `npm run check`

Expected: all policy tests pass.

## Task 4: Phase Metadata and Docs

**Files:**
- Modify: `src/project/phase-plan.ts`
- Modify: `src/project/__tests__/phase-plan.test.ts`
- Modify: `docs/구현내용.md`
- Modify: `docs/architecture/directory-structure.md`

- [x] **Step 1: Write failing phase metadata test**

```typescript
it("marks phase 3 as the current implementation phase", () => {
  const phase2 = implementationPhases.find((phase) => phase.id === "phase-2");
  const phase3 = implementationPhases.find((phase) => phase.id === "phase-3");

  assert.equal(phase2?.status, "implemented");
  assert.equal(phase3?.status, "implementing");
});
```

- [x] **Step 2: Run RED**

Run: `npm run build`

Expected: fail because Phase 3 is still `planned`.

- [x] **Step 3: Update phase metadata and docs**

Record Phase 3 as the current branch scope. Add implementation notes explaining that this PR is a policy/contract pilot only and does not implement fixer patch generation, apply job, push, approve, merge, or branch-protection bypass.

- [x] **Step 4: Run verification**

Run:

```bash
npm run check
node scripts/setup.mjs
git diff --check
rg -n "console\\.log" src scripts
```

Expected: all checks pass, and any `console.log` hits are only inside the central `log()` implementation if present.

## Self-Review

- Spec coverage: ADR/PRD D4, D9, D10, D12, FR-006, and P1 acceptance criteria are represented as pure policy checks. Patch artifact generation and apply jobs remain out of scope for this PR.
- Placeholder scan: no `TBD`, `TODO`, or open-ended implementation step is used.
- Type consistency: `ActionableMarker`, `ModelPairPolicyInput`, `AutofixPolicyInput`, and `AutofixPolicyDecision` are defined before use and exported through `src/index.ts`.
