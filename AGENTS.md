# Agent Operating Principles

This repository implements the ADR/PRD-defined Frontier Pair AI PR review, autofix, verification, and convergence pipeline.

## Non-negotiable architecture rules

1. Read the latest root `ADR.md` and `PRD.md` before changing implementation code.
2. Keep Reviewer (R), Fixer (F), Orchestrator, policy, and adapter concerns separated.
3. Do not couple reusable domain rules to a specific model vendor, GitHub Action, or CLI. Vendor/tool details belong in adapters.
4. R and F must remain independently configurable and must not share hidden execution context or self-review traces.
5. Never add auto-merge, write-token fixer behavior, fork-PR secret access, or branch-protection bypasses without the phase that explicitly allows them.
6. Prefer small, reusable TypeScript modules with explicit exported types over inline scripts.
7. If a phase changes directory ownership or boundaries, update `docs/architecture/directory-structure.md` in the same PR.

## Directory ownership rules

- `src/domain`: pure reusable business rules, policies, state machines, and typed contracts. No process env, filesystem, network, GitHub SDK, model SDK, or shell execution.
- `src/app`: orchestration use cases that coordinate domain rules and ports. May depend on `src/domain` and `src/shared`, but not concrete adapters directly unless injected through ports.
- `src/adapters`: concrete integrations for GitHub, model providers, file artifacts, command execution, and CI/runtime surfaces. May implement ports declared by app/domain modules.
- `src/shared`: generic utilities that are not project-policy specific. Avoid dumping business logic here.
- `src/project`: repository-local constants, phase planning metadata, and human-readable implementation maps derived from the root ADR/PRD.
- `docs`: implementation plans, architecture notes, and operational runbooks.

## Testing and validation expectations

- Run `npm run check` after TypeScript changes whenever dependencies are available.
- Add or update tests for reusable rules, policy decisions, state transitions, and parsing logic.
- Keep generated output such as `dist/` out of source control unless a future phase explicitly requires checked-in build artifacts.
