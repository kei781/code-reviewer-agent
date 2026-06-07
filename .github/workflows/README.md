# Workflow Directory

P0 does **not** rely on repository-hosted GitHub Actions for AI review execution.

The canonical flow is webhook-driven:

1. GitHub sends PR events to the external review server.
2. The review server clones the repository, checks out the PR branch, and pulls the branch head.
3. The local Claude Code orchestrator runs Claude Code and Codex reviewers independently.
4. The orchestrator cross-validates candidate findings against the local codebase and posts valid PR comments.

Do not add direct AI-review GitHub Actions unless a later ADR/PRD update explicitly changes the review-server architecture. If a workflow is added in a later phase, it must be a minimal dispatcher/status helper and must not replace local codebase-backed cross-validation.
