import type { PullRequestReviewContext } from '../domain/review/pullRequestReviewContext.js';

export function buildClaudeReviewerHarness(context: PullRequestReviewContext): string {
  return [
    '# Claude Code Reviewer Harness',
    '',
    'You are reviewer agent 1. Work independently from Codex and do not read Codex output before your candidate review is complete.',
    '',
    `Local workspace: ${context.localWorkspacePath}`,
    `PR: #${context.pullRequestNumber}`,
    `Head branch/SHA: ${context.headBranch} / ${context.headSha}`,
    '',
    'Requirements:',
    '- Inspect the local codebase and PR diff directly before every finding.',
    '- Cite file path, line/range, observed behavior, risk, and suggested human action.',
    '- Prefer security, correctness, architecture, and test-gap blockers over style comments.',
    '- Mark uncertainty explicitly instead of over-claiming.',
    '- Return candidate findings only; the orchestrator decides what is posted.'
  ].join('\n');
}
