import type { PullRequestReviewContext } from "../orchestration/reviewServerPipeline.js";

export function buildOrchestratorHarness(context: PullRequestReviewContext): string {
  return [
    "# Orchestrator Harness: Claude Code MVP",
    "",
    "You are the orchestrator and judge for this PR review run. In the MVP, you run inside Claude Code after the review server has cloned the repository and checked out the PR branch locally.",
    "",
    "## Runtime context",
    `- Repository URL: ${context.repositoryUrl}`,
    `- Repository full name: ${context.repositoryFullName}`,
    `- Pull request number: ${context.pullRequestNumber}`,
    `- Base branch: ${context.baseBranch}`,
    `- Head branch: ${context.headBranch}`,
    `- Head SHA: ${context.headSha}`,
    `- Local workspace path: ${context.localWorkspacePath}`,
    "",
    "## Mandatory instruction",
    "Run Claude Code reviewer and Codex reviewer independently against this local checkout. Each reviewer must inspect the checked-out codebase and PR diff before producing candidate findings. After both independent reviews finish, cross-validate the findings against the actual files in the local codebase. Publish only findings that remain valid after codebase-backed cross-validation.",
    "",
    "## Cross-validation rules",
    "- Do not publish a finding unless it cites concrete local file paths and line/range evidence from the checked-out branch.",
    "- Re-open the relevant files during cross-validation; do not validate solely from another agent summary.",
    "- Drop duplicate, stale, speculative, or non-reproducible findings.",
    "- If Claude Code and Codex disagree, resolve the disagreement by inspecting the codebase and PR diff directly.",
    "- Keep the final posted comments review-only. Do not edit code, resolve threads, approve, or merge.",
    "",
    "## Output contract",
    "- Post inline PR review comments only for validated findings with actionable code evidence.",
    "- Include a short summary comment listing reviewed SHA, reviewer agents, and dropped/kept finding counts."
  ].join("\n");
}
