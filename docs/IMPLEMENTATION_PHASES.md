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
- Add `src/orchestration` run-plan code that describes clone, fetch, webhook head-SHA checkout, and harness assembly without executing side effects.
- Add a central `log()` helper and setup automation.
- Document directory ownership and anti-breakage rules.

Exit criteria:

- The TypeScript scaffold builds.
- Tests cover phase metadata, directory rules, logger routing, and P0 run-plan construction.
- `docs/PHASE0_DIRECTORY_STRUCTURE.md` documents the v5 review-server boundaries.
- P0 remains review-only: no code modification, formal approval, thread resolve, merge automation, branch-protection bypass, or write-token model behavior.

## Phase 1: P0 Review-server Cross-validation MVP

Title: `P0: Implement webhook review-server cross-validation`

Scope:

- Implement webhook intake behind an app port.
- Validate repository URL, PR number, base branch, head branch, and head SHA.
- Prepare a local workspace pinned to the webhook head SHA through an adapter.
- Spawn independent Claude Code and Codex reviewer passes with fresh context.
- Cross-validate findings against local files and PR diff before posting.
- Publish only validated review comments and summary markers.

Exit criteria:

- Same-repo PR opened/synchronize/reopened/ready_for_review events can be processed by the review server.
- Draft, closed, fork, unsupported, and already-reviewed SHA cases produce explicit skip reasons.
- Review output contains reviewed SHA, agent identity, kept/dropped finding counts, and merge signal metadata.
- Human approve/merge remains required.

## Phase 2: P0 Follow-up Reviewer Interactions

Title: `P0: Add explicit reviewer follow-up interactions`

Scope:

- Respond to `issue_comment` created/edited events only when a configured reviewer trigger is present.
- Reuse the P0 same-repo/open PR guard and skip fork/closed/non-PR targets before side effects.
- Claim each delivery/comment/head-SHA pair before model or publisher calls.
- Keep the response contract analysis-only: explanation, risk clarification, and re-review signal are allowed; code changes, approval, merge, and write-token behavior are not.
- Publish skip and failure records through ports so concrete GitHub adapters can record audit trail later.

Exit criteria:

- Configured triggers create response publications.
- Ordinary comments do not auto-respond.
- Fix/merge requests remain read-only responses in P0.
- Duplicate comment/head-SHA claims are skipped before response generation.

## Completion Boundary

The implemented phase set ends at Phase 2. Once the review server posts validated review comments, the next action belongs to a human maintainer: resolve comments, request more development, or perform follow-up work in a separate human-directed task.
