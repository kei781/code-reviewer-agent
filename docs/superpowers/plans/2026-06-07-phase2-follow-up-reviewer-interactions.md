# Phase 2 Follow-Up Reviewer Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P0 reviewer mention/command response path without granting code modification, approval, or merge authority.

**Architecture:** Add one app-level use case that accepts `issue_comment` webhook data, applies pure domain trigger/PR guards before side effects, atomically claims a comment/head-SHA follow-up, asks an injected responder for an analysis-only response, and publishes through an injected port. Domain policy remains pure, concrete GitHub/model/state work remains adapter-owned.

**Tech Stack:** TypeScript ESM, Node `node:test`, strict `tsc`, existing port-driven app pattern.

---

## File Structure

- Create `src/app/respondToReviewerMention.ts`: Phase 2 app use case, ports, event/result/response contracts, skip/failure publication types.
- Create `src/app/__tests__/respondToReviewerMention.test.ts`: red-green tests for trigger guards, same-repo/closed PR guards, claim ordering, analysis-only response scope, dedupe, and structured failure handling.
- Modify `src/index.ts`: export the Phase 2 use case and public contracts.
- Modify `src/app/README.md`: document the Phase 2 surface and side-effect boundaries.
- Modify `docs/architecture/directory-structure.md`: record that follow-up interactions stay app/port-driven.
- Modify `docs/구현내용.md`: append Phase 2 SDD notes and verification evidence.
- Modify `src/project/phase-plan.ts` and `src/project/__tests__/phase-plan.test.ts`: move current phase metadata forward after Phase 1 merge.

## Task 1: Follow-Up Use Case Tests

**Files:**
- Create: `src/app/__tests__/respondToReviewerMention.test.ts`
- Modify after red: `src/app/respondToReviewerMention.ts`
- Modify after red: `src/index.ts`

- [x] **Step 1: Write the failing test**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  respondToReviewerMention,
  type FollowUpClaimResult,
  type FollowUpResponseRequest,
  type ReviewerMentionCommentEvent,
  type ReviewerMentionPorts
} from "../../index.js";

function baseCommentEvent(overrides: Partial<ReviewerMentionCommentEvent> = {}): ReviewerMentionCommentEvent {
  return {
    deliveryId: "delivery-mention-1",
    action: "created",
    repositoryFullName: "kei781/sql-agent",
    pullRequestNumber: 42,
    headSha: "abc123",
    commentId: 9001,
    commentBody: "@ai-reviewer explain the SQL guard risk",
    commentAuthorLogin: "kei781",
    isPullRequest: true,
    isClosed: false,
    isFork: false,
    labels: [],
    ...overrides
  };
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run check`
Expected: TypeScript fails because `respondToReviewerMention` and related contracts are not exported yet.

- [x] **Step 3: Write minimal implementation**

Implement `respondToReviewerMention` with guard order:

1. Supported action: `created | edited`.
2. Valid payload.
3. Trigger alias detected by `detectReviewerTrigger`.
4. Target is PR.
5. PR is open and same-repo.
6. Atomic `claimFollowUp`.
7. `generateFollowUpResponse` receives only analysis-only action scope.
8. `publishFollowUpResponse`.
9. `markFollowUpResponded`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: TypeScript build and all Node tests pass.

## Task 2: Response Contract and Failure Paths

**Files:**
- Modify: `src/app/__tests__/respondToReviewerMention.test.ts`
- Modify: `src/app/respondToReviewerMention.ts`

- [x] **Step 1: Write failing tests**

Add tests that:

- skip ordinary comments before claim/responder calls;
- skip closed/fork/non-PR comments before claim;
- pass `allowedResponseActions` as `["analysis", "explanation", "risk-clarification", "re-review-signal"]`;
- preserve labels for read-only blocked-label context;
- publish structured failure and mark failure when the responder or publisher throws;
- skip when `claimFollowUp` returns `already-processed-comment`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run check`
Expected: failing assertions for missing behavior.

- [x] **Step 3: Write minimal implementation**

Add the missing branches and failure publication types. Do not add concrete GitHub/model adapters.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: all tests pass.

## Task 3: Metadata and Documentation

**Files:**
- Modify: `src/project/phase-plan.ts`
- Modify: `src/project/__tests__/phase-plan.test.ts`
- Modify: `src/app/README.md`
- Modify: `docs/architecture/directory-structure.md`
- Modify: `docs/구현내용.md`

- [x] **Step 1: Write failing metadata test changes**

Update tests so Phase 2 is the current implementing phase and no merged Phase 1 blocker remains first in line.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run check`
Expected: metadata assertions fail until phase statuses are updated.

- [x] **Step 3: Update metadata and docs**

Mark Phase 0 and Phase 1 implemented, Phase 2 implementing, and record Phase 2 boundaries in documentation.

- [x] **Step 4: Run full verification**

Run:

```bash
npm run check
node scripts/setup.mjs
git diff --check
rg "console\\.log" src scripts
```

Expected: `npm run check` and setup pass, diff whitespace check passes, and no direct `console.log` appears in source/runtime scripts.

## Self-Review

- Spec coverage: FR-002 trigger, PR target guard, closed/fork guard, analysis-only response scope, fix-request non-mutation rule, `HUMAN_REVIEW_REQUIRED` support, and skip/dedupe/failure records are mapped to Tasks 1-2.
- Placeholder scan: no implementation placeholders remain in the plan.
- Type consistency: tests and implementation share the `ReviewerMention*` and `FollowUp*` naming scheme.
