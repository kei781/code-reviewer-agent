# Review Server Cross-validation Architecture

This document records the corrected P0 runtime shape. The canonical P0 path is a webhook-driven review server that prepares a local checkout and then runs a Claude Code orchestrator with independent Claude Code and Codex reviewer agents.

## Runtime Flow

0. Preconfiguration
   - Install Codex.
   - Install Claude Code.
   - Connect Codex plugin/tooling into Claude Code so the orchestrator can invoke Codex as an independent reviewer.

1. GitHub PR event
   - A PR is created or updated for a specific branch.
   - GitHub sends the PR payload to the review server webhook endpoint.

2. Review server webhook intake
   - The review server validates the payload and extracts repository URL, PR number, base branch, head branch, and head SHA.

3. Local codebase setup
   - The review server prepares the exact webhook head SHA locally:

   ```text
   git clone <repo> <workspace>
   git -C <workspace> fetch --no-tags origin <branch>
   git -C <workspace> checkout --detach <head-sha>
   ```

   The local checkout is mandatory because independent review and cross-validation must inspect the actual codebase, not only webhook metadata or another agent summary. Pinning to the webhook head SHA prevents a queued review from silently reviewing a newer branch tip.

4. Orchestrated independent reviews
   - The MVP orchestrator is Claude Code.
   - Reviewer agent 1 is Claude Code.
   - Reviewer agent 2 is Codex.
   - The orchestrator keeps both reviewers independent until their candidate reviews are complete.

5. Codebase-backed cross-validation
   - The orchestrator reopens checked-out files for every candidate finding.
   - A finding is publishable only when it has concrete file and line evidence from the local checkout.
   - The orchestrator drops stale, duplicate, speculative, or non-reproducible findings.

6. Publish review comments
   - The orchestrator posts only valid findings as PR review comments, preferably inline on relevant code.
   - The orchestrator also posts a short summary with reviewed SHA, agent identities, and kept/dropped finding counts.

7. Human decision
   - A human reviews the comments and chooses whether to resolve, request additional development, or ask for follow-up review.
   - P0 remains review-only: no code edits, thread resolution, approval, or merge automation.

## Agent Topology

```text
review server
`-- local workspace for PR branch
    `-- orchestrator: Claude Code (judge, MVP)
        |-- reviewer agent 1: Claude Code
        `-- reviewer agent 2: Codex
```

## Harness Placement Rule

The orchestrator and both reviewer agents each have a harness file at the same module level under `src/agents/`:

```text
src/agents/
|-- orchestrator.ts
|-- orchestratorHarness.ts
|-- claudeReviewer.ts
|-- claudeReviewerHarness.ts
|-- codexReviewer.ts
`-- codexReviewerHarness.ts
```

Future agents must preserve this same-level pairing so module responsibility and prompt/harness contract are easy to audit together.
