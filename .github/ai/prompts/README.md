# Prompt Directory

Role-oriented prompts live here.

P0 review-server prompts:

- `orchestrator-cross-review.md` defines the local Claude Code orchestrator contract for independent Claude Code/Codex reviews and codebase-backed cross-validation.
- `reviewer-review.md` and `reviewer-interactive.md` are retained as role prompt references, but the canonical P0 execution path is the external review server rather than repository-hosted GitHub Actions.

Prompts must preserve structured markers such as `MERGE_SIGNAL`, reviewed SHA, reviewer model metadata, and orchestrator state when those markers are used. Prompt files should stay role-oriented; provider-specific wiring belongs in adapter or review-server configuration.
