import { buildClaudeReviewerHarness } from '../agents/claudeReviewerHarness.js';
import { buildCodexReviewerHarness } from '../agents/codexReviewerHarness.js';
import { buildOrchestratorHarness } from '../agents/orchestratorHarness.js';
import type { PullRequestReviewContext } from '../domain/review/pullRequestReviewContext.js';

export type ReviewServerSetupRequirement =
  | 'codex-cli-installed'
  | 'claude-code-installed'
  | 'claude-code-codex-plugin-connected';

export interface GitCommandPlan {
  readonly command: 'git';
  readonly args: readonly string[];
  readonly cwd?: string;
}

export interface ReviewServerRunPlan {
  readonly setupRequirements: readonly ReviewServerSetupRequirement[];
  readonly workspaceCommands: readonly GitCommandPlan[];
  readonly orchestratorHarness: string;
  readonly reviewerHarnesses: {
    readonly claudeCode: string;
    readonly codex: string;
  };
}

export const reviewServerSetupRequirements = [
  'codex-cli-installed',
  'claude-code-installed',
  'claude-code-codex-plugin-connected'
] as const satisfies readonly ReviewServerSetupRequirement[];

export function buildWorkspaceSyncCommands(context: PullRequestReviewContext): readonly GitCommandPlan[] {
  return [
    { command: 'git', args: ['clone', context.repositoryUrl, context.localWorkspacePath] },
    { command: 'git', args: ['fetch', '--no-tags', 'origin', context.headBranch], cwd: context.localWorkspacePath },
    { command: 'git', args: ['checkout', '--detach', context.headSha], cwd: context.localWorkspacePath }
  ];
}

export function buildReviewServerRunPlan(context: PullRequestReviewContext): ReviewServerRunPlan {
  return {
    setupRequirements: reviewServerSetupRequirements,
    workspaceCommands: buildWorkspaceSyncCommands(context),
    orchestratorHarness: buildOrchestratorHarness(context),
    reviewerHarnesses: {
      claudeCode: buildClaudeReviewerHarness(context),
      codex: buildCodexReviewerHarness(context)
    }
  };
}
