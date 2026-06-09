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

## Phase 3: Self-hosted Webhook Server Runtime

Status: planned by `docs/superpowers/specs/2026-06-09-self-hosted-webhook-server-runtime-design.md`.

Goal: turn the reusable TypeScript review-server modules into a pm2-runnable self-hosted HTTP runtime.

Deliverables:

- Node.js server entrypoint with `GET /healthz` and `POST /webhooks/github`.
- GitHub webhook signature verification before JSON parsing.
- Runtime route mapping for supported `pull_request` and `issue_comment` events.
- Concrete GitHub, git workspace, state store, and Claude Code orchestrator adapters behind existing app ports.
- `npm start`, `npm run serve`, and pm2 ecosystem configuration.
- Operational runbook for local startup, webhook configuration, and shutdown.

Exit criteria:

- pm2 can keep the built server process alive.
- `/healthz` reports healthy status.
- Invalid webhook signatures are rejected without side effects.
- Supported webhook events reach the existing app use cases through injected adapters.
- GitHub credentials remain server-side and are never injected into agent sessions.
- The runtime remains review-only and human-gated.

## Completion Boundary

The implemented source modules currently cover Phase 0 through Phase 2. Phase 3 is the next planned runtime phase and is intentionally split into design, server boot, concrete adapters, and Claude Code orchestration implementation PRs. After review comments are posted, a human maintainer still decides whether to resolve them, request additional development, or start a separate human-directed implementation task.
