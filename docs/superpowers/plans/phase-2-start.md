# Phase 2 Start: ADR P1 Autofix Convergence Loop

## Branch

`codex/phase2-autofix-convergence-loop`

## Goal

Prepare the repository Phase 2 branch for the ADR P1 opt-in fixer convergence loop after Phase 1 review-server cross-validation is accepted and the root ADR/PRD explicitly re-enable FR-007 through FR-014.

## Phase Mapping

- Repository Phase 1 maps to ADR P0 review-server cross-validation.
- Repository Phase 2 maps to ADR P1 Frontier Pair Autofix Pilot.
- Repository Phase 3 maps to ADR P2-H conservative merge gate readiness.

## Preconditions

- Phase 1 review-server cross-validation is merged and accepted.
- ADR.md and PRD.md are amended, or a phase approval is cited, to re-enable automatic Fixer/apply/convergence behavior that v5 moved to future scope.
- No implementation work beyond planning starts until the preconditions above are satisfied.

## Initial Scope

- Add `ai-autofix` opt-in handling.
- Add model-pair independence checks.
- Add risky-path policy and actionable marker parsing.
- Add read-only fixer analyze output as a patch artifact.
- Add apply-job policy gates for patch validation, tests, commit, push, and comments.
- Track epoch, processed IDs, attempts, terminal state, and audit trail.

## Guardrails

- Do not allow fork PR autofix.
- Do not run fixer behavior until the R != F model-pair independence gate passes.
- Block autofix for risky paths or `security-sensitive` changes.
- Enforce `fix_attempts < max_fix_attempts` before every fixer attempt.
- Do not let a model hold write tokens directly.
- Keep apply behavior behind policy gates and adapter boundaries.
- Do not add auto-merge or branch-protection bypass behavior in this phase.
