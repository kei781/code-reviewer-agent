export interface AgentModuleSpec {
  readonly id: string;
  readonly role: 'orchestrator' | 'reviewer';
  readonly runtime: 'claude-code' | 'codex';
  readonly responsibility: string;
  readonly mayPostReviewComments: boolean;
}

export const mvpOrchestratorAgent = {
  id: 'orchestrator-claude-code',
  role: 'orchestrator',
  runtime: 'claude-code',
  responsibility:
    'Judge the independent Claude Code and Codex review outputs, force codebase-backed cross-validation, and publish only findings that survive validation.',
  mayPostReviewComments: true
} as const satisfies AgentModuleSpec;
