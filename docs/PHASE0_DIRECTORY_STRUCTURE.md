# Phase 0 Directory Structure

Phase 0 makes the project easy to inspect and safe to extend. It does not implement runtime review execution, autofix, formal approval, thread resolution, or merge automation.

## Source of Truth

- `ADR.md`: v5 self-hosted review-server correction, with Reviewer/Fixer/Orchestrator/policy/adapter separation.
- `PRD.md`: P0 review-server cross-validation MVP.
- `docs/superpowers/specs/2026-06-04-frontier-pair-self-hosted-orchestrator-design.md`: detailed v5 design.

## Directory Map

```text
src/
|-- domain/
|   |-- policy/
|   |-- review/
|   `-- workflow/
|-- app/
|-- adapters/
|   |-- reviewer/
|   `-- fixer/
|-- agents/
|-- orchestration/
|-- project/
`-- shared/

.github/
`-- ai/
    |-- adapters/
    `-- prompts/
```

## Ownership Rules

### `src/domain`

Pure reusable business rules, policies, state machines, and typed contracts live here. Domain code must not read process env, touch the filesystem, execute shell commands, call GitHub SDKs, or call model SDKs.

### `src/app`

Use cases and ports live here. App code coordinates domain rules through injected dependencies. It may define ports for GitHub, git workspaces, sandbox runners, state stores, queues, orchestrators, and reviewer passes.

### `src/adapters`

Concrete integrations live here. Adapters may call GitHub SDKs, model providers, the filesystem, shell commands, SQLite, and container runtimes, but they must implement ports rather than redefining domain policy.

### `src/agents`

P0 agent role specs and same-level harness builders live here.

- `orchestrator.ts` and `orchestratorHarness.ts`
- `claudeReviewer.ts` and `claudeReviewerHarness.ts`
- `codexReviewer.ts` and `codexReviewerHarness.ts`

Harnesses must require local checkout inspection and must keep Claude Code and Codex reviewer passes independent until candidate findings are complete.

### `src/orchestration`

Side-effect-free run-plan construction lives here. P0 orchestration returns structured commands and harness text; it does not execute git, call GitHub, call models, read secrets, or post comments directly.

### `src/shared`

Project-agnostic helpers live here. The central `log()` helper belongs here so future log routing can be changed in one place.

### `src/project`

Repository-local metadata derived from ADR/PRD lives here, including phase plans and directory rules.

### `.github/ai`

Role-oriented prompt and adapter reference files live here. Provider-specific runtime wiring belongs in adapters or external review-server configuration.

### `.github/workflows`

P0 does not run AI review through repository-hosted GitHub Actions. If later phases add workflows, they must be dispatcher/status helpers unless ADR/PRD are amended.

## Anti-breakage Rules

1. Do not put vendor-specific model logic in `src/domain`.
2. Do not move agent harnesses away from their same-level agent modules.
3. Do not add write-capable fixer behavior to P0.
4. Do not treat reviewer comments as formal approvals or merge authorization.
5. Do not introduce fork secret access, branch-protection bypass, or auto-merge before the phase that explicitly allows it.
6. Do not write directly to the console outside a `log()` helper.
7. Do not duplicate executable policy only in prompts; reusable policy belongs in TypeScript modules.

## Phase 0 Checklist

- [x] TypeScript project metadata exists.
- [x] Source directories have clear ownership.
- [x] Agent modules and same-level harnesses exist.
- [x] Review-server run-plan scaffold exists without side effects.
- [x] Setup automation installs npm dependencies and verifies the build.
- [x] POSIX shell bootstrap can prepare Node.js locally before setup on macOS/Linux.
- [x] Central logging helper exists.
- [x] Tests cover the scaffold.
