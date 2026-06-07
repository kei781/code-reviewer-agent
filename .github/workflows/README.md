# Workflow Directory

P0 does not run AI review through repository-hosted GitHub Actions.

The canonical v5 flow is webhook-driven:

1. GitHub sends PR events to the external review server.
2. The review server clones the repository, checks out the PR branch, and pulls the branch head.
3. The local Claude Code orchestrator runs Claude Code and Codex reviewers independently.
4. The orchestrator cross-validates candidate findings against the local codebase and posts valid PR comments.

Do not add direct AI-review GitHub Actions unless a later ADR/PRD update explicitly changes the architecture. Later workflow files, if any, should be minimal dispatcher/status helpers and must not replace local codebase-backed cross-validation.
