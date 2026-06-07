# Implementation Phases

This plan is derived from the latest root-level ADR and PRD available on 2026-06-03:

- `ADR.md`: v4, role-oriented Frontier Pair architecture.
- `PRD.md`: v4, ready for P0 implementation and draft for P1+.

## Phase Gate Rule

Each phase must be completed in a separately titled PR with a clear description. The next phase may start only after all review comments on the current phase PR are resolved.

## Phase 0 — Directory Structure and Agent Guardrails

### Title

`P0: Establish role-oriented TypeScript project structure`

### Description

Create a human-readable repository layout before workflow implementation begins. The layout must make ownership boundaries obvious to future agents and prevent vendor-specific adapter details from leaking into reusable domain modules.

### Scope

- Add TypeScript project metadata.
- Add reusable module boundaries under `src/`.
- Add `.github/ai/` and `.github/workflows/` placeholders matching the PRD file-structure section.
- Document directory ownership and anti-breakage rules.
- Record this phased implementation plan.

### Exit Criteria

- The TypeScript compiler can validate the scaffold.
- `docs/PHASE0_DIRECTORY_STRUCTURE.md` exists and documents directory rules.
- Future agents can identify where to place review, policy, adapter, orchestration, and shared code.

## Phase 1 — P0 Review-server Cross-validation MVP

### Title

`P0: Align reviewer signal with webhook review-server cross-validation`

### Description

Implement the corrected P0 reviewer flow: GitHub sends PR events to a review server, the server prepares a local branch checkout, Claude Code orchestrates independent Claude Code and Codex reviews, and only codebase-validated findings are posted. This phase creates review comments but does not implement fixer autofix, formal approval, thread resolve, or auto-merge.

### Scope

- Document review-server webhook intake and local `git clone`, `git checkout`, `git pull origin <branch>` setup.
- Record required preconfiguration: Codex installed, Claude Code installed, and Claude Code connected to Codex plugin/tooling.
- Add agent modules for the MVP orchestrator, Claude Code reviewer, and Codex reviewer.
- Add same-level harness files beside each agent module.
- Require independent reviews followed by codebase-backed cross-validation.
- Publish only validated findings as PR comments; keep human resolve/follow-up decisions outside automation.

### Exit Criteria

- Review-server pipeline steps are represented in TypeScript and human-readable docs.
- Agent topology is explicit: orchestrator = Claude Code, reviewer 1 = Claude Code, reviewer 2 = Codex.
- Harness placement rule is documented and implemented with same-level files.
- Cross-validation requires inspecting the local checkout before publishing findings.
- P0 remains review-only: no code edits, formal approval, thread resolve, or merge automation.

## Phase 2 — P1 Frontier Pair Autofix Pilot

### Title

`P1: Add opt-in fixer autofix convergence loop`

### Description

Introduce label-gated fixer automation that processes actionable reviewer items only after policy gates pass.

### Scope

- Add `ai-autofix` opt-in handling.
- Add model-pair independence checks.
- Add risky-path policy and blocker/actionable parsers.
- Add read-only fixer analyze job producing a patch artifact.
- Add apply job that validates, tests, commits, pushes, and comments.
- Track epoch, processed IDs, attempts, terminal state, and audit trail.

### Exit Criteria

- Fork PRs, risky-path PRs, blocked-label PRs, and over-cap PRs are not autofixed.
- Fixer attempts are capped at three per PR by default.
- Fixer output converges to `CONVERGED_CLEAN`, `STALLED_OSCILLATING`, or `CAPPED_WITH_OPEN`.

## Phase 3 — P2-H Conservative Merge Gate

### Title

`P2-H: Add human-gated AI merge verdict`

### Description

Add latest-SHA AI verdict checks and conservative auto-merge activation without bypassing branch protection or human review.

### Scope

- Add CI prerequisite documentation/checks.
- Add `ai-review/verdict` check publication.
- Add `ai-automerge` label handling.
- Add merge gate workflow using GitHub native auto-merge only.

### Exit Criteria

- Required checks and required human review must pass before merge.
- Blocking labels, fork PRs, risky paths, and merge conflicts prevent auto-merge.

## Phase 4 — P2-A Autonomous Low-risk Merge

### Title

`P2-A: Define autonomous low-risk merge policy`

### Description

Proceed only after a separate ADR amendment defines low-risk autonomous merge boundaries.

### Scope

- Add low-risk path allowlists.
- Add trusted author/bot allowlists.
- Add rollback/manual intervention procedures.

### Exit Criteria

- Autonomous merge applies only to documented low-risk cases.
- Operators have tested rollback and manual override procedures.

## Phase 5 — P3 Advanced Operations

### Title

`P3: Add advanced review operations and reporting`

### Description

Improve operations after the core review/fix/merge gates are stable.

### Scope

- Optional review thread tracking when formal threads exist.
- PR activity summaries.
- Cost/usage reporting.
- Notifications.
- Rollback PR generation.

### Exit Criteria

- Operational reporting reduces maintainer effort without changing earlier safety gates.
