# Implementation Phases

This plan follows the latest root `ADR.md` and `PRD.md` v5 correction: P0 is a self-hosted review-server cross-validation MVP. Repository-hosted GitHub Actions do not run the AI review in P0.

## Phase Gate Rule

Each phase should be completed in a separately titled PR with a clear description. The next phase should start only after all review comments on the current phase PR are resolved.

## Phase 0: Directory Structure and Agent Guardrails

Title: `P0: Establish review-server TypeScript scaffold`

Scope:

- Add TypeScript project metadata and validation scripts.
- Add human-readable source boundaries under `src/`.
- Add `src/agents` modules for the Claude Code orchestrator, Claude Code reviewer, and Codex reviewer.
- Add same-level harness builders beside each agent module.
- Add `src/orchestration` run-plan code that describes clone, checkout, pull, and harness assembly without executing side effects.
- Add a central `log()` helper and setup automation.
- Document directory ownership and anti-breakage rules.

Exit criteria:

- The TypeScript scaffold builds.
- Tests cover phase metadata, directory rules, logger routing, and P0 run-plan construction.
- `docs/PHASE0_DIRECTORY_STRUCTURE.md` documents the v5 review-server boundaries.
- P0 remains review-only: no autofix, formal approval, thread resolve, auto-merge, branch-protection bypass, or write-token model behavior.

## Phase 1: P0 Review-server Cross-validation MVP

Title: `P0: Implement webhook review-server cross-validation`

Scope:

- Implement webhook intake behind an app port.
- Validate repository URL, PR number, base branch, head branch, and head SHA.
- Prepare a local branch workspace through an adapter.
- Spawn independent Claude Code and Codex reviewer passes with fresh context.
- Cross-validate findings against local files and PR diff before posting.
- Publish only validated review comments and summary markers.

Exit criteria:

- Same-repo PR opened/synchronize/reopened/ready_for_review events can be processed by the review server.
- Draft, closed, fork, unsupported, and already-reviewed SHA cases produce explicit skip reasons.
- Review output contains reviewed SHA, agent identity, kept/dropped finding counts, and merge signal metadata.
- Human approve/merge remains required.

## Phase 2: P1 Frontier Pair Autofix Pilot

Title: `P1: Add opt-in fixer convergence loop`

Scope:

- Add `ai-autofix` opt-in handling.
- Add model-pair independence checks.
- Add risky-path policy and actionable marker parsing.
- Add read-only fixer analyze output as a patch artifact.
- Add apply-job policy gates for patch validation, tests, commit, push, and comments.
- Track epoch, processed IDs, attempts, terminal state, and audit trail.

Exit criteria:

- Fork PRs, risky-path PRs, blocked-label PRs, and over-cap PRs are not autofixed.
- Fixer attempts are capped.
- Loops end as `CONVERGED_CLEAN`, `STALLED_OSCILLATING`, or `CAPPED_WITH_OPEN`.

## Phase 3: P2-H Conservative Merge Gate

Title: `P2-H: Add human-gated AI merge verdict`

Scope:

- Publish an `ai-review/verdict` check for the latest SHA.
- Preserve required CI and human review.
- Enable GitHub native auto-merge only when all required gates pass and `ai-automerge` is present.

Exit criteria:

- The merge gate never bypasses required checks, branch protection, human review, fork/risky-path blocks, or blocking labels.

## Phase 4: P2-A and P3 Advanced Operations

P2-A requires a separate ADR amendment before any autonomous low-risk merge behavior. P3 may add operations features such as thread tracking, reporting, alerts, cost summaries, and recovery workflows after the earlier phases are stable.
