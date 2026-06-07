export interface PullRequestReviewContext {
  readonly repositoryUrl: string;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly localWorkspacePath: string;
}
