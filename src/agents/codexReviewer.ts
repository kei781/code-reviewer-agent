import type { AgentModuleSpec } from './orchestrator.js';

export const codexReviewerAgent = {
  id: 'reviewer-codex',
  role: 'reviewer',
  runtime: 'codex',
  responsibility:
    'Perform an independent read-only PR review from Codex against the local checked-out codebase before cross-validation.',
  mayPostReviewComments: false
} as const satisfies AgentModuleSpec;
