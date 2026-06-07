# Agent Module Boundary

P0 uses a local review-server agent topology:

- `orchestrator.ts` — the MVP judge, currently Claude Code.
- `claudeReviewer.ts` — reviewer agent 1, Claude Code.
- `codexReviewer.ts` — reviewer agent 2, Codex.

Each agent module has a sibling harness file at the same directory level:

- `orchestratorHarness.ts`
- `claudeReviewerHarness.ts`
- `codexReviewerHarness.ts`

Do not move harnesses into `.github/**` or hide them under unrelated utility folders. Harnesses are role prompts/contracts for local review-server execution, not GitHub Actions workflows.
