# Phase 4 Start: Advanced Operations

## Branch

`codex/phase4-advanced-operations`

## Goal

Prepare the P2-A and P3 advanced operations track after earlier phase gates are stable.

## Initial Scope

- Treat autonomous low-risk merge as blocked until a separate ADR amendment is accepted.
- Add operational features only after the earlier review, autofix, and verdict phases are stable.
- Consider thread tracking, reporting, alerts, cost summaries, and recovery workflows.
- Keep rollback and manual intervention procedures visible to maintainers.

## Guardrails

- Do not add autonomous merge behavior without the required ADR amendment.
- Do not bypass human review, required checks, branch protection, fork/risky-path blocks, or blocking labels.
- Keep operations integrations behind adapters and leave reusable policy in TypeScript domain modules.
