# Phase 3C Claude Orchestrator Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Phase 3C Claude Code orchestrator runtime adapter so prepared PR workspaces can be reviewed through a guarded, secret-scrubbed local Claude Code process.

**Architecture:** Keep process execution in `src/adapters/orchestrator`, network policy handoff in `src/adapters/network`, and HTTP/webhook dispatch in `src/server`. Claude Code receives no GitHub credentials, must be launched only after a model egress guard creates an active session, and returns structured review JSON that the existing app use case publishes through server-side GitHub adapters.

**Tech Stack:** TypeScript, Node 24 `node:test`, existing `CommandRunner`, existing Claude/Codex harness builders, injected fake command runners and fake egress enforcers, `npm run check`.

---

## File Structure

- Create `src/adapters/network/modelEgressGuard.ts`
  - Owns `ModelEgressGuard`, `ModelEgressSession`, and a command/enforcer-backed guard factory.
  - Fails closed when the allowlist is empty or guard enforcement fails.
- Create `src/adapters/orchestrator/agentEnvironment.ts`
  - Builds a minimal agent process environment.
  - Excludes GitHub tokens, webhook secrets, private key paths, and other server-only secret variables.
- Create `src/adapters/orchestrator/claudeCodeOrchestratorAdapter.ts`
  - Implements `ReviewOrchestratorPort`.
  - Builds the orchestrator harness, enters egress guard session, runs Claude Code with replace-env command execution, parses structured JSON output, and throws sanitized failures.
- Modify `src/adapters/workspace/commandRunner.ts`
  - Add `envMode: "merge" | "replace"` so agent processes can avoid inheriting `.env` secrets.
- Modify `src/agents/orchestratorHarness.ts`
  - Change the output contract from direct GitHub posting to server-consumed structured JSON.
- Add tests under `src/adapters/network/__tests__` and `src/adapters/orchestrator/__tests__`.
- Modify `src/app/__tests__/runEnsembleReview.test.ts`
  - Add explicit orchestrator failure publication coverage.
- Modify `src/index.ts`, docs, and phase metadata after green tests.

## Task 1: Command Env Isolation

**Files:**
- Modify: `src/adapters/workspace/commandRunner.ts`
- Test: `src/adapters/workspace/__tests__/commandRunner.test.ts`

- [x] **Step 1: Write failing command runner tests**

Add tests proving `envMode: "replace"` does not inherit base secrets and `envMode: "merge"` preserves existing behavior.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test "dist/adapters/workspace/__tests__/commandRunner.test.js"`

Expected: FAIL because `envMode` is not implemented.

- [x] **Step 3: Implement `envMode`**

Add `readonly envMode?: "merge" | "replace"` to `CommandInvocation`. In spawn options, merge base env by default, but use only `command.env` when `envMode === "replace"`.

- [x] **Step 4: Run targeted tests**

Run: `npm run build && node --test "dist/adapters/workspace/__tests__/commandRunner.test.js" "dist/adapters/workspace/__tests__/gitWorkspaceAdapter.test.js"`

Expected: PASS.

## Task 2: Model Egress Guard

**Files:**
- Create: `src/adapters/network/modelEgressGuard.ts`
- Test: `src/adapters/network/__tests__/modelEgressGuard.test.ts`

- [x] **Step 1: Write failing guard tests**

Test that an empty allowlist fails closed, failed enforcement prevents a session, and successful enforcement returns env/session metadata.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test "dist/adapters/network/__tests__/modelEgressGuard.test.js"`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement guard interfaces and factory**

Create `createModelEgressGuard({ allowlist, enforce })`; the injected `enforce` function represents deployment-specific firewall/container/sandbox enforcement. The guard returns env containing only non-secret policy references and a disposable session.

- [x] **Step 4: Run targeted guard tests**

Run: `npm run build && node --test "dist/adapters/network/__tests__/modelEgressGuard.test.js"`

Expected: PASS.

## Task 3: Agent Environment Scrubber

**Files:**
- Create: `src/adapters/orchestrator/agentEnvironment.ts`
- Test: `src/adapters/orchestrator/__tests__/agentEnvironment.test.ts`

- [x] **Step 1: Write failing env tests**

Test that PATH/HOME-like runtime variables survive while GitHub tokens, webhook secrets, private key paths, and server database paths are excluded.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test "dist/adapters/orchestrator/__tests__/agentEnvironment.test.js"`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement env scrubber**

Export `buildAgentEnvironment(baseEnv, extraEnv)` and `isSecretEnvironmentKey(key)`. Keep only a conservative allowlist plus provided guard/session env.

- [x] **Step 4: Run targeted env tests**

Run: `npm run build && node --test "dist/adapters/orchestrator/__tests__/agentEnvironment.test.js"`

Expected: PASS.

## Task 4: Claude Code Orchestrator Adapter

**Files:**
- Create: `src/adapters/orchestrator/claudeCodeOrchestratorAdapter.ts`
- Test: `src/adapters/orchestrator/__tests__/claudeCodeOrchestratorAdapter.test.ts`
- Modify: `src/agents/orchestratorHarness.ts`

- [x] **Step 1: Write failing adapter tests**

Test command construction, guard-before-command ordering, PR-checkout cwd separation, secret exclusion, timeout/nonzero failures, and JSON output parsing into `OrchestratedReviewResult`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test "dist/adapters/orchestrator/__tests__/claudeCodeOrchestratorAdapter.test.js"`

Expected: FAIL because the adapter does not exist.

- [x] **Step 3: Implement adapter**

Use default args `["--print", harness]`, avoid defaulting cwd to the PR-controlled local checkout, use `envMode: "replace"`, timeout from options, guard session env included, and parse output between `AI_REVIEW_RESULT_JSON_START` and `AI_REVIEW_RESULT_JSON_END`.

- [x] **Step 4: Run targeted adapter tests**

Run: `npm run build && node --test "dist/adapters/orchestrator/__tests__/claudeCodeOrchestratorAdapter.test.js"`

Expected: PASS.

## Task 5: Failure Publication Coverage

**Files:**
- Modify: `src/app/__tests__/runEnsembleReview.test.ts`

- [x] **Step 1: Add failing orchestrator failure test**

Add a test that `orchestrator.runIndependentReviews` throwing publishes a failure with stage `run-independent-reviews`.

- [x] **Step 2: Run targeted app test**

Run: `npm run build && node --test "dist/app/__tests__/runEnsembleReview.test.js"`

Expected: PASS once existing catch behavior is confirmed; if it fails, fix app failure handling.

## Task 6: Exports, Docs, and Phase Metadata

**Files:**
- Modify: `src/index.ts`
- Modify: `src/project/phase-plan.ts`
- Modify: `src/project/__tests__/phase-plan.test.ts`
- Modify: `docs/phase-plan.md`
- Modify: `docs/IMPLEMENTATION_PHASES.md`
- Modify: `docs/architecture/directory-structure.md`
- Modify: `docs/구현내용.md`

- [x] **Step 1: Export new adapter factories and types**

Expose orchestrator, egress guard, and env scrubber modules from `src/index.ts`.

- [x] **Step 2: Update docs and phase metadata**

Mark Phase 3C adapter implementation complete while leaving any future neutral reconciliation or advanced ops out of scope.

- [x] **Step 3: Run full verification**

Run:

```powershell
npm run check
rg -n "process\.env|console\.log" src --glob "*.ts" --glob "!src/shared/config.ts" --glob "!src/shared/__tests__/config.test.ts"
```

Expected: `npm run check` passes and direct env/log scan has no matches.

## Task 7: Commit, Push, PR

**Files:**
- All changed files.

- [ ] **Step 1: Commit**

Run:

```powershell
git status --short
git add docs src
git commit -m "feat: add phase 3c claude orchestrator runtime"
```

- [ ] **Step 2: Push and open PR**

Run:

```powershell
git push -u origin codex/phase3c-claude-orchestrator-runtime
gh pr create --title "Phase 3C Claude orchestrator runtime" --body "<summary and test plan>"
```

## Self-Review

- Spec coverage: The plan covers the Claude Code command adapter, harness handoff, egress guard handoff, agent env scrubber, timeout/failure handling, secret exclusion, and tests. Full GitHub webhook dispatch wiring can be added only if this adapter layer remains readable; otherwise it should be a follow-up Phase 3D runtime wiring PR.
- Placeholder scan: No task uses placeholder filenames or undefined modules.
- Type consistency: New modules depend on existing app/domain contracts and reuse `CommandRunner`.
