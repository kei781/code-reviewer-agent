# AI Adapter Config Directory

Optional review-server or workflow-facing adapter configuration lives here.

Keep files role-oriented first and vendor-specific only where an adapter must bind to a concrete provider or tool.

P0 uses Claude Code as the MVP orchestrator, Claude Code as reviewer agent 1, and Codex as reviewer agent 2 through the Claude Code Codex plugin/tooling. Future adapters must preserve independent review and local codebase-backed cross-validation before swapping provider-specific implementation details.
