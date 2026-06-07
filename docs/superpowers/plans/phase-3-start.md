# Phase 3 Start: Human-gated Merge Verdict

## Branch

`codex/phase3-human-gated-merge-verdict`

## Goal

Implement the P2-H conservative merge verdict after earlier review and convergence phases are accepted.

## Initial Scope

- Publish an `ai-review/verdict` check for the latest SHA.
- Preserve required CI and human review.
- Enable GitHub native auto-merge only when all required gates pass and `ai-automerge` is present.
- Keep verdict state tied to the latest reviewed head SHA.

## Guardrails

- Never bypass required checks, branch protection, human review, fork/risky-path blocks, or blocking labels.
- Do not implement direct merge behavior.
- Keep verdict publishing behind a port so concrete GitHub checks/status APIs stay in adapters.
