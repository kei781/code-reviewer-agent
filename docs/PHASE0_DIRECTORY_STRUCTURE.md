# Phase 0 Directory Structure and Agent Guardrails

Phase 0 establishes the repository layout that later phases must preserve. The goal is a structure that a human can scan quickly and that future agents can extend without breaking role boundaries.

## Source of Truth

This layout follows the latest root-level documents:

- `ADR.md` v4: architecture is role-oriented, with Reviewer (R), Fixer (F), Orchestrator, and Merge Gate separated from adapter details.
- `PRD.md` v4 plus the latest user correction: P0 review execution is webhook-driven through a local review server, with Claude Code as MVP orchestrator and Claude Code/Codex as independent reviewer agents.

## Directory Map

```text
.
├── ADR.md
├── PRD.md
├── docs/
│   ├── IMPLEMENTATION_PHASES.md
│   └── PHASE0_DIRECTORY_STRUCTURE.md
├── package.json
├── tsconfig.json
├── src/
│   ├── adapters/
│   │   ├── fixer/
│   │   └── reviewer/
│   ├── agents/
│   ├── config/
│   ├── domain/
│   │   ├── policy/
│   │   ├── review/
│   │   └── workflow/
│   ├── orchestration/
│   └── shared/
└── .github/
    ├── ai/
    │   ├── adapters/
    │   └── prompts/
    └── workflows/
```

## Ownership Rules

### `docs/`

Human-facing design and operating documents live here.

- Add phase plans, runbooks, and policy explanations here.
- Do not put executable workflow logic here.
- Do not duplicate ADR/PRD requirements; reference them and explain implementation decisions.

### `src/shared/`

Stable TypeScript primitives live here.

- Keep modules small and reusable across phases.
- Avoid business rules, GitHub-specific behavior, and model-specific logic.
- Export types and utility primitives that do not require external services.

### `src/domain/`

Pure business rules live here.

- `src/domain/review/`: review signal and verdict concepts.
- `src/domain/policy/`: guard decisions such as draft, closed, fork, risky path, labels, and attempts.
- `src/domain/workflow/`: phase/state definitions independent of a concrete runner.
- Domain modules must not import from `src/adapters/` or `.github/**`.

### `src/agents/`

Review-server agent modules and their harnesses live here.

- `orchestrator.ts`: MVP judge/orchestrator, currently Claude Code.
- `claudeReviewer.ts`: independent reviewer agent 1.
- `codexReviewer.ts`: independent reviewer agent 2.
- Each agent module must keep its harness as a sibling file at the same directory level, for example `orchestrator.ts` beside `orchestratorHarness.ts`.
- Harnesses must require direct inspection of the local checkout before candidate findings and again during cross-validation.

### `src/adapters/`

Concrete external integrations live here.

- `src/adapters/reviewer/`: reviewer model/action/tool adapters.
- `src/adapters/fixer/`: fixer model/action/tool adapters for P1+.
- Adapter modules may depend on domain contracts.
- Adapter modules must not define source-of-truth policy decisions.

### `src/config/`

Reusable runtime configuration helpers live here.

- Keep secrets out of source control.
- Prefer environment-variable names and validation helpers over concrete secret values.
- Do not hard-code vendor-specific model choices in domain modules.

### `src/orchestration/`

Workflow coordination lives here.

- Coordinate review-server webhook intake, local clone/checkout/pull setup, agent harness construction, cross-validation, PR markers, epochs, attempts, and audit trails.
- Keep pure rule evaluation in `src/domain/**`.
- Keep concrete tool invocation details in `src/adapters/**`.

### `.github/ai/prompts/`

Role-oriented prompts live here.

- P0 reviewer prompts must preserve structured output markers.
- P1 fixer prompts must only address actionable reviewer items.
- Prompts should describe untrusted PR content as untrusted input.

### `.github/ai/adapters/`

Workflow-facing adapter configuration lives here when needed.

- Use role names first and vendor names second.
- Do not make vendor configuration part of the architecture contract.

### `.github/workflows/`

P0 does not run AI review through repository-hosted GitHub Actions.

- GitHub PR events are delivered to the external review server as webhooks.
- Later workflows, if any, must be dispatcher/status helpers and must not replace local codebase-backed cross-validation.
- Do not add direct AI-review workflow execution unless a later ADR/PRD update explicitly changes the review-server architecture.

## Anti-breakage Rules for Future Agents

1. Do not flatten `src/domain`, `src/adapters`, `src/orchestration`, and `src/shared` into a single utilities directory.
2. Do not put vendor-specific model logic in `src/domain/**`.
3. Do not add write-capable fixer behavior to P0 review-server execution.
4. Do not move agent harness files away from their same-level agent module siblings.
5. Do not treat reviewer comments as formal approvals or merge authorization.
6. Do not start a later phase until the previous phase PR has all comments resolved.
7. Do not bypass fork, draft, closed, risky-path, label, branch-protection, or human-review gates when those gates apply.
8. Do not duplicate policy rules in prompts only; executable policy must live in TypeScript domain/orchestration modules as phases mature.
9. Do not store secrets, tokens, or concrete model credentials in the repository.
10. Do not remove README boundary files unless the same guidance is preserved in a clearer location.

## Phase 0 Completion Checklist

- [x] TypeScript project metadata exists.
- [x] Reusable module namespaces exist.
- [x] GitHub AI prompt directory exists, and workflow directory documents that P0 review execution is webhook/review-server based.
- [x] Directory ownership is documented.
- [x] Future-agent anti-breakage rules are documented.
- [x] Review-server, local checkout, Claude Code/Codex independent review, and codebase-backed cross-validation architecture is documented.
