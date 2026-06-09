import type { GitHubInstallationTokenProvider } from "./githubAppInstallationToken.js";
import type { GitHubPullRequestReadClient } from "./githubRestClient.js";
import type { GitHubPullRequestMetadata } from "./webhookEventMapper.js";

export interface PullRequestMetadataRequest {
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
}

export interface PullRequestMetadataProvider {
  listChangedPaths(input: PullRequestMetadataRequest): Promise<readonly string[]>;
  getPullRequestMetadata(input: PullRequestMetadataRequest): Promise<GitHubPullRequestMetadata>;
}

export interface GitHubPullRequestMetadataProviderOptions {
  readonly tokenProvider: GitHubInstallationTokenProvider;
  readonly client: GitHubPullRequestReadClient;
}

export function createGitHubPullRequestMetadataProvider(
  options: GitHubPullRequestMetadataProviderOptions
): PullRequestMetadataProvider {
  return {
    async listChangedPaths(input) {
      const token = await options.tokenProvider.getInstallationToken(input.repositoryFullName);

      return options.client.listPullRequestChangedPaths({
        token,
        repositoryFullName: input.repositoryFullName,
        pullRequestNumber: input.pullRequestNumber
      });
    },
    async getPullRequestMetadata(input) {
      const token = await options.tokenProvider.getInstallationToken(input.repositoryFullName);

      return options.client.getPullRequestMetadata({
        token,
        repositoryFullName: input.repositoryFullName,
        pullRequestNumber: input.pullRequestNumber
      });
    }
  };
}
