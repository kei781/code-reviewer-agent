# Phase 6 Advanced Ops Guardrails Plan

## Source Context

- ADR D16 and PRD P2-A state that autonomous low-risk merge requires a separate ADR amendment and an explicit maintainer decision.
- P2-A may relax the human review requirement only for low-risk paths and trusted authors/bots after `ai-review/verdict`, CI, branch protection, and rollback/manual intervention procedures exist.
- PRD P3 lists operational features such as thread tracking, reporting, alerts, cost/usage reporting, and rollback PR automation as future operations work.

## Scope

This phase adds pure TypeScript contracts only. It does not enable auto-merge, submit approvals, call GitHub GraphQL, post Slack/GitHub Discussion alerts, create rollback PRs, or bypass branch protection.

## Implementation Steps

1. Add RED tests for P2-A autonomous readiness and P3 operational follow-up planning.
2. Add `src/domain/operations/autonomousReadiness.ts` for the explicit ADR approval, low-risk path, trusted author, verdict, CI, branch protection, rollback, and shared merge-safety gates.
3. Add `src/domain/operations/operationalFollowUp.ts` for alert reasons, recommended channels, and recovery runbook ids as data.
4. Export the new contracts from `src/index.ts`.
5. Mark Phase 5 as implemented and Phase 6 as implementing.
6. Update architecture and implementation notes.

## Verification Plan

- `npm run build`
- `npm run test`
- `npm run check`
- `node scripts/setup.mjs`
- `git diff --check`
- `rg -n "console\\.log" src scripts`
