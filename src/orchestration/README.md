# Orchestration Boundary

Orchestration coordinates domain decisions, adapter calls, local workspace setup, agent harness construction, PR markers, epochs, attempts, and audit trails.

For P0, the canonical runtime is the review server flow in `reviewServerPipeline.ts`:

1. receive a GitHub PR webhook,
2. clone and checkout the PR branch locally,
3. run the Claude Code MVP orchestrator,
4. invoke Claude Code and Codex reviewer harnesses independently,
5. cross-validate candidate findings against the local codebase,
6. post only validated PR review comments.

Keep pure rules in `src/domain/**`, agent module/harness contracts in `src/agents/**`, and concrete external tool calls in `src/adapters/**`.
