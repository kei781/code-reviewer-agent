# Phase 3 Start: Human-gated Merge Verdict

## Branch

`codex/phase3-human-gated-merge-verdict`

## Goal

Prepare the repository Phase 3 branch for the ADR P2-H conservative merge verdict after earlier review and convergence phases are accepted and CI/branch protection are available.

## Preconditions

- Phase 1 review-server cross-validation is merged and accepted.
- Phase 2 / ADR P1 convergence is merged and accepted.
- CI required checks are configured.
- Branch protection is enabled for the target branch.

## Initial Scope

- Publish an `ai-review/verdict` check for the latest SHA.
- Preserve required CI and human review.
- Enable GitHub native auto-merge only when all required gates pass and `ai-automerge` is present.
- Keep verdict state tied to the latest reviewed head SHA.
- Mark or republish any previous verdict as stale when the PR head SHA changes.
- Accept auto-merge eligibility only when the current head SHA has `ai-review/verdict=success`.
- Update `docs/architecture/directory-structure.md` in the implementation PR when verdict ports or GitHub checks/status adapters change directory boundaries.

## Guardrails

- Never bypass required checks, branch protection, human review, fork/risky-path blocks, or blocking labels.
- Do not implement direct merge behavior.
- Keep verdict publishing behind a port so concrete GitHub checks/status APIs stay in adapters.
- Publish verdicts outside the sandbox on the server side with minimum GitHub permissions: `contents: read` plus `checks: write` or `statuses: write`.
- Do not inject GitHub tokens or App keys into agent sessions or sandboxes for verdict publication.
