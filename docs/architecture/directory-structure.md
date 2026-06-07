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

Phase 2 keeps the same boundary for reviewer follow-up interactions. `RespondToReviewerMention` accepts typed `issue_comment` data, uses the pure trigger policy for `@ai-reviewer`, `@claude`, and `/ai review`, rejects non-PR, closed, fork, and `ai-blocked` targets before response side effects, atomically claims the comment/head-SHA/body-revision tuple, and asks an injected responder only for analysis, explanation, risk clarification, or re-review signals. Concrete comment posting, model execution, persistence, and raw GitHub `issue_comment` enrichment remain adapter responsibilities; adapters must load PR metadata such as head SHA and fork status before calling the use case.

Phase 3 adds only pure P1 policy contracts. `src/domain/fixer` owns reviewer actionable marker parsing for future fixer inputs, while `src/domain/policy` owns model-pair independence and `ai-autofix` eligibility. Actionable marker parsing requires a trusted reviewer summary source so adapters cannot pass arbitrary PR bodies, user comments, or repository content into the fixer contract. These modules decide whether a future adapter may start a read-only fixer analyze pass; they do not create patches, apply patches, push commits, approve, merge, or bypass CI.

Phase 4 keeps the P1 loop contract in the domain layer. `src/domain/convergence` owns terminal-state decisions for delta verification, round caps, and oscillation detection, while `src/domain/review/orchestratorStateMarker.ts` parses hidden `ai-orchestrator` PR comment markers into typed audit state. The marker parser requires trusted orchestrator comment provenance and marks parsed data as `audit-only`; future adapters must keep authoritative loop state in their injected persistence such as SQLite. These contracts let adapters persist and recover loop context without moving GitHub comment reads, model execution, patch application, or status publishing into domain code.

Phase 5 adds P2-H merge-gate contracts without adding merge side effects. `src/domain/merge` owns `ai-review/verdict` check conclusion mapping and conservative GitHub native auto-merge eligibility. These policies return data such as `success`, `failure`, `neutral`, `enable-github-auto-merge`, or explicit block reasons; adapters remain responsible for publishing check runs/statuses, managing labels, configuring branch protection, and invoking GitHub native auto-merge only when the domain decision allows it.

Phase 6 adds P2-A/P3 guardrail contracts without adding autonomous side effects. `src/domain/operations` owns low-risk autonomous readiness decisions and operational follow-up planning. The autonomous readiness policy requires an explicit ADR amendment, low-risk path allowlist, trusted author allowlist, human-review relaxation approval, rollback procedure, latest successful verdict, required CI success, and branch protection before returning `allow-low-risk-autonomous-evaluation`. The operational follow-up planner returns alert reasons, recommended channels, and runbook ids as data only; adapters remain responsible for GitHub GraphQL, Slack/GitHub Discussion posting, rollback PR creation, and any concrete recovery execution.

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
