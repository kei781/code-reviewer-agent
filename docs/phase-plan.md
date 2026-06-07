# Implementation Phase Plan

This plan follows the latest root `ADR.md` and `PRD.md` v5 correction. The active product is a self-hosted review server that runs independent Claude Code and Codex reviewer passes, cross-validates their findings against the local checkout, and posts only valid review comments.

Each phase should be implemented in its own pull request. The next phase starts only after review comments on the current PR are resolved.

## Phase 0: Governance and Structure

Goal: establish a human-readable TypeScript project layout and durable agent guardrails.

Deliverables:

- Strict TypeScript package baseline.
- `src` split into domain, app, adapters, agents, orchestration, shared, and project areas.
- Central `log()` helper.
- Setup automation with POSIX bootstrap and local Node preparation.
- Directory ownership documentation and tests.

Exit criteria:

- `npm run check` succeeds.
- Directory and phase metadata are explicit.
- P0 boundaries are documented.

## Phase 1: Review-server Cross-validation

Goal: process PR webhook events through injected ports and publish only codebase-backed review findings.

Deliverables:

- Webhook event contract.
- Local workspace preparation contract pinned to the webhook head SHA.
- Independent Claude Code and Codex reviewer orchestration port.
- Cross-validation of candidate findings.
- Review publication summary with reviewed SHA, agent identities, finding counts, and `MERGE_SIGNAL`.

Exit criteria:

- Supported PR events are processed.
- Draft, closed, fork, unsupported, duplicate delivery, and already-reviewed SHA cases skip before side effects where possible.
- Review comments remain review signals, not formal approvals.

## Phase 2: Human Handoff Follow-up

Goal: answer explicit reviewer mentions or commands without taking ownership of code changes.

Deliverables:

- Mention trigger parser for configured aliases.
- Follow-up response use case with state-claim dedupe.
- Response contract limited to analysis, explanation, risk clarification, or re-review signal.

Exit criteria:

- Ordinary comments do not trigger the reviewer.
- Fork, closed, non-PR, blocked-label, duplicate, and stale comment cases skip safely.
- Requests to change code or merge remain read-only responses.

## Completion Boundary

The implemented phase set ends at Phase 2. After review comments are posted, a human maintainer decides whether to resolve them, request additional development, or start a separate human-directed implementation task.
