import type { AgentModuleSpec } from './orchestrator.js';

export const claudeReviewerAgent = {
  id: 'reviewer-claude-code',
  role: 'reviewer',
  runtime: 'claude-code',
  responsibility:
    'Perform an independent read-only PR review from Claude Code against the local checked-out codebase before cross-validation.',
  mayPostReviewComments: false
} as const satisfies AgentModuleSpec;
