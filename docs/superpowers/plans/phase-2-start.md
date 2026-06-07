# Phase 2 Start: Autofix Convergence Loop

## Branch

`codex/phase2-autofix-convergence-loop`

## Goal

Implement the P1 opt-in fixer convergence loop after Phase 1 review-server cross-validation is accepted.

## Initial Scope

- Add `ai-autofix` opt-in handling.
- Add model-pair independence checks.
- Add risky-path policy and actionable marker parsing.
- Add read-only fixer analyze output as a patch artifact.
- Add apply-job policy gates for patch validation, tests, commit, push, and comments.
- Track epoch, processed IDs, attempts, terminal state, and audit trail.

## Guardrails

- Do not allow fork PR autofix.
- Do not let a model hold write tokens directly.
- Keep apply behavior behind policy gates and adapter boundaries.
- Do not add auto-merge or branch-protection bypass behavior in this phase.
