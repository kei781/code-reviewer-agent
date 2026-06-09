# Agent Operating Principles

This repository implements the ADR/PRD v5 self-hosted ensemble PR review server.

## Non-negotiable architecture rules

1. Read the latest root `ADR.md` and `PRD.md` before changing implementation code.
2. Keep the Claude Code reviewer, Codex reviewer, Orchestrator, policy, and adapter concerns separated.
3. Do not couple reusable domain rules to a specific model vendor, GitHub Action, or CLI. Vendor/tool details belong in adapters.
4. Claude Code and Codex reviewer passes must remain independently configurable and must not share hidden execution context or self-review traces.
5. Never add code modification, formal approval, merge automation, fork-PR secret access, write-token model behavior, or branch-protection bypasses to the active review-server runtime.
6. Prefer small, reusable TypeScript modules with explicit exported types over inline scripts.
7. If a phase changes directory ownership or boundaries, update `docs/architecture/directory-structure.md` in the same PR.

## v5 Operating Note

The current runtime is:

1. GitHub PR event arrives at the self-hosted webhook review server.
2. The review server prepares a local checkout pinned to the webhook head SHA.
3. The review server launches Claude Code as the orchestrator.
4. Claude Code orchestrates two fresh-context reviewer passes: Claude Code and Codex, invoking Codex through pre-connected plugin/tooling rather than a server-side Codex runtime command.
5. The orchestrator cross-validates candidate findings against the local checkout and PR diff.
6. Only valid findings are published as PR review comments.
7. A human maintainer decides whether to resolve comments or request additional development.

Codex is the second reviewer in this architecture, not an implementer role. Review comments are signals, not formal approvals or merge authorization.

MVP judgment-stage residual bias exception:

- Reviewer candidate generation keeps generation-stage independence: Claude Code and Codex are spawned as separate fresh-context passes and must not read each other's output before candidate findings are complete.
- The MVP judgment stage is intentionally not fully neutral because Claude Code also performs cross-validation and reconciliation after candidate generation.
- Track this as a temporary adapter limitation, not a permanent architecture rule. Replace the `OrchestratorPort` adapter with a neutral `ServerReconcileOrchestrator` when judgment neutrality is required; remove this exception note when that replacement lands.

Security invariants:

- Do not execute or trust PR-controlled agent configuration such as `.claude/`, `CLAUDE.md`, or git hooks.
- Do not inject GitHub tokens or GitHub App private keys into agent sessions or sandboxes.
- Keep server-side fetch and publication outside the sandbox.
- Restrict sandbox egress to model APIs.

## Directory ownership rules

- `src/domain`: pure reusable business rules, policies, state machines, and typed contracts. No process env, filesystem, network, GitHub SDK, model SDK, or shell execution.
- `src/app`: orchestration use cases that coordinate domain rules and ports. May depend on `src/domain` and `src/shared`, but not concrete adapters directly unless injected through ports.
- `src/adapters`: concrete integrations for GitHub, model providers, file artifacts, command execution, and runtime surfaces. May implement ports declared by app/domain modules.
- `src/server`: planned Phase 3 process entrypoint and HTTP route layer. Keep it thin; delegate GitHub, git, state, and model execution to adapters.
- `src/shared`: generic utilities and central runtime config. Avoid dumping business logic here.
- `src/project`: repository-local constants, phase planning metadata, and human-readable implementation maps derived from the root ADR/PRD.
- `docs`: implementation plans, architecture notes, and operational runbooks.

## Testing and validation expectations

- Run `npm run check` after TypeScript changes whenever dependencies are available.
- Add or update tests for reusable rules, policy decisions, state transitions, and parsing logic.
- Keep generated output such as `dist/` out of source control unless a future phase explicitly requires checked-in build artifacts.
