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
|   |-- server/        # Phase 3 HTTP entrypoint and route layer
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
3. The server launches Claude Code as the MVP orchestrator.
4. Claude Code invokes both fresh-context reviewer passes: Claude Code directly and Codex through the pre-connected plugin/tooling.
5. The orchestrator cross-validates candidate findings against the local checkout and PR diff.
6. Only codebase-backed findings are posted as review comments.

Concrete webhook, GitHub, git, sandbox, state, and model calls belong behind ports/adapters. Phase 1 starts this by adding an app-level `RunEnsembleReview` use case that accepts typed webhook event data, atomically claims review work through an injected state port, deduplicates posted finding fingerprints, and coordinates injected ports without calling concrete integrations directly.

Phase 2 keeps the same boundary for reviewer follow-up interactions. `RespondToReviewerMention` accepts typed `issue_comment` data, uses the pure trigger policy for `@ai-reviewer`, `@claude`, and `/ai review`, rejects non-PR, closed, fork, and `ai-blocked` targets before response side effects, atomically claims the comment/head-SHA/body-revision tuple, and asks an injected responder only for analysis, explanation, risk clarification, or re-review signals. Concrete comment posting, model execution, persistence, and raw GitHub `issue_comment` enrichment remain adapter responsibilities; adapters must load PR metadata such as head SHA and fork status before calling the use case.

The active implementation stops there. After review comments are posted, a human maintainer decides whether to resolve them or request additional development.

Phase 3 opens the runtime boundary described in `docs/superpowers/specs/2026-06-09-self-hosted-webhook-server-runtime-design.md`. Phase 3A adds the `src/server` process entrypoint and HTTP route handling. Concrete GitHub publication, git workspace, state, and Claude Code execution effects still belong in `src/adapters`, and reusable review decisions stay in `src/domain` and `src/app`.

## Dependency Rules

```text
src/project       -> static repository metadata
src/shared        -> project-agnostic utilities and central runtime config parsing; importable by any layer
src/domain        -> pure policies, contracts, and state; may import shared/project
src/app           -> use cases and ports; may import domain/shared/project
src/agents        -> role specs and harness builders; may import domain/project context types
src/server        -> process entrypoint and HTTP route layer; may import app/adapters/shared but must not contain reusable review policy
src/orchestration -> side-effect-free P0 run plans; may import agents/domain/project/shared
src/adapters      -> concrete SDK, filesystem, network, shell, model, and GitHub implementations
```

Forbidden directions:

- `src/domain` must not import `src/app` or `src/adapters`.
- `src/app` must not hard-code a model provider, GitHub SDK, shell command implementation, or persistence implementation.
- `src/server` must keep HTTP concerns thin and delegate GitHub, git, state, and model execution to adapters.
- `src/shared` must not contain project-specific PR review policy.
- `src/shared/config.ts` is the only TypeScript source module that may read `process.env`; adapter/runtime code should consume the exported typed config instead of reading env directly.
- `src/agents` harnesses must not hold secrets, GitHub tokens, or hidden shared reviewer context.
- `src/orchestration` run-plan code must not execute shell commands directly.
- Adapter code must not redefine domain policy.

## Why This Matters

The ADR/PRD v5 scope requires the two reviewer passes, orchestrator, policy, and adapter concerns to remain separate. These boundaries prevent hidden shared review context, formal approval dependencies, fork secret access, branch-protection bypasses, or merge automation from entering the review-only runtime.
