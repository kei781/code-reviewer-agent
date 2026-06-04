# Directory Structure and Dependency Direction

The repository is intentionally split by responsibility so each module can be reused by future GitHub Actions, CLIs, local simulations, or alternative model adapters.

```text
.
├── ADR.md                         # Latest architecture decision record
├── PRD.md                         # Latest product requirements document
├── AGENTS.md                      # Binding instructions for future agents
├── docs/
│   ├── phase-plan.md              # Ordered PR-by-PR implementation plan
│   └── architecture/
│       └── directory-structure.md # This boundary document
├── src/
│   ├── domain/                    # Pure policies, types, state machines
│   ├── app/                       # Use cases and orchestration ports
│   ├── adapters/                  # GitHub/model/runtime implementations
│   ├── shared/                    # Generic utilities
│   └── project/                   # Repo-local phase and directory metadata
├── package.json
└── tsconfig.json
```

## Dependency rules

```text
src/project ─┐
src/shared ──┼── may be imported by any source module
src/domain ──┼── may import shared/project only when needed for static metadata
src/app ─────┼── may import domain/shared/project and injected ports
src/adapters ┘   may import app/domain/shared/project and concrete SDKs
```

Forbidden dependency directions:

- `src/domain` must not import `src/app` or `src/adapters`.
- `src/app` must not hard-code a concrete model provider or GitHub SDK implementation.
- `src/shared` must not contain project-specific PR review policy.
- Adapter code must not redefine domain policy; it should call domain/app modules.

## Why this matters

The ADR/PRD requires the system to stay vendor-neutral at the architecture layer while allowing concrete reviewer/fixer adapters. These boundaries keep the Reviewer R, Fixer F, Orchestrator, and Merge Gate independently testable and prevent a future agent from accidentally implementing a write-token model loop or formal-approval dependency before the approved phase.
