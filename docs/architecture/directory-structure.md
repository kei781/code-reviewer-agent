# Directory Structure and Dependency Direction

This repository is split by responsibility so each module can be reused by a future webhook server, CLI, GitHub adapter, model adapter, or local simulation without changing domain rules.

```text
.
|-- ADR.md
|-- PRD.md
|-- AGENTS.md
|-- docs/
|   |-- implementation notes and phase plans
|   `-- architecture/
|       `-- directory-structure.md
|-- src/
|   |-- domain/
|   |-- app/
|   |-- adapters/
|   |-- agents/
|   |-- orchestration/
|   |-- shared/
|   `-- project/
|-- package.json
`-- tsconfig.json
```

## P0 v5 Shape

The latest ADR/PRD v5 correction makes the P0 runtime an external review server, not a repository-hosted GitHub Actions AI review job.

The P0 scaffold therefore models this flow as data:

1. GitHub sends PR events to a self-hosted webhook server.
2. The server prepares a local workspace with `git clone`, `git fetch --no-tags origin <branch>`, and `git checkout --detach <head-sha>`.
3. Claude Code acts as the MVP orchestrator.
4. Claude Code and Codex reviewer passes run independently with fresh context.
5. The orchestrator cross-validates candidate findings against the local checkout and PR diff.
6. Only codebase-backed findings are posted as review comments.

Concrete webhook, GitHub, git, sandbox, state, and model calls belong behind ports/adapters. Phase 1 starts this by adding an app-level `RunEnsembleReview` use case that accepts typed webhook event data, atomically claims review work through an injected state port, deduplicates posted finding fingerprints, and coordinates injected ports without calling concrete integrations directly.

## Dependency Rules

```text
src/project       -> static repository metadata
src/shared        -> project-agnostic utilities; importable by any layer
src/domain        -> pure policies, contracts, and state; may import shared/project
src/app           -> use cases and ports; may import domain/shared/project
src/agents        -> role specs and harness builders; may import domain/project context types
src/orchestration -> side-effect-free P0 run plans; may import agents/domain/project/shared
src/adapters      -> concrete SDK, filesystem, network, shell, model, and GitHub implementations
```

Forbidden directions:

- `src/domain` must not import `src/app` or `src/adapters`.
- `src/app` must not hard-code a model provider, GitHub SDK, shell command implementation, or persistence implementation.
- `src/shared` must not contain project-specific PR review policy.
- `src/agents` harnesses must not hold secrets, GitHub tokens, or hidden shared reviewer context.
- `src/orchestration` run-plan code must not execute shell commands directly.
- Adapter code must not redefine domain policy.

## Why This Matters

The ADR/PRD requires Reviewer, Fixer, Orchestrator, policy, and adapter concerns to remain separate. These boundaries prevent future phases from accidentally adding write-token fixer behavior, formal approval dependencies, fork secret access, or merge automation before the phase that explicitly allows them.
