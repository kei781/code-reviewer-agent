# Prompt Directory

P0 prompt files describe review-server roles.

- `orchestrator-cross-review.md` defines the local Claude Code orchestrator contract for independent Claude Code/Codex reviews and codebase-backed cross-validation.
- `reviewer-review.md` and `reviewer-interactive.md` are retained as role prompt references, but the canonical P0 execution path is the external review server rather than repository-hosted GitHub Actions.

Prompts should stay role-oriented. Provider-specific runtime wiring belongs in adapters or external review-server configuration.
