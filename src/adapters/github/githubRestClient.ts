import type { GitHubAppInstallationTokenClient } from "./githubAppInstallationToken.js";
import type { GitHubReviewClient } from "./githubReviewPublisher.js";
import type { GitHubPullRequestMetadata } from "./webhookEventMapper.js";

export type GitHubFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubRestClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: GitHubFetch;
  readonly userAgent?: string;
}

export interface GitHubPullRequestReadInput {
  readonly token: string;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
}

export interface GitHubPullRequestReadClient {
  listPullRequestChangedPaths(input: GitHubPullRequestReadInput): Promise<readonly string[]>;
  getPullRequestMetadata(input: GitHubPullRequestReadInput): Promise<GitHubPullRequestMetadata>;
}

export type GitHubRestClient = GitHubAppInstallationTokenClient & GitHubReviewClient & GitHubPullRequestReadClient;

const defaultGitHubApiBaseUrl = "https://api.github.com";
const defaultUserAgent = "code-reviewer-agent";
const gitHubApiVersion = "2022-11-28";

export function createGitHubRestClient(options: GitHubRestClientOptions = {}): GitHubRestClient {
  const baseUrl = trimTrailingSlash(options.baseUrl ?? defaultGitHubApiBaseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const userAgent = options.userAgent ?? defaultUserAgent;

  return {
    async getRepositoryInstallationId(input) {
      const route = `/repos/${encodeRepositoryFullName(input.repositoryFullName)}/installation`;
      const json = await requestJson(fetchImpl, {
        baseUrl,
        userAgent,
        route,
        method: "GET",
        token: input.appJwt
      });
      const id = readNumberField(json, "id");

      if (id === undefined) {
        throw new Error("GitHub installation response did not include a numeric id");
      }

      return id;
    },
    async createInstallationAccessToken(input) {
      const route = `/app/installations/${input.installationId}/access_tokens`;
      const json = await requestJson(fetchImpl, {
        baseUrl,
        userAgent,
        route,
        method: "POST",
        token: input.appJwt
      });
      const token = readStringField(json, "token");
      const expiresAt = readStringField(json, "expires_at");

      if (token === undefined || expiresAt === undefined) {
        throw new Error("GitHub installation token response was missing token or expires_at");
      }

      return { token, expiresAt };
    },
    async createPullRequestReview(input) {
      await requestJson(fetchImpl, {
        baseUrl,
        userAgent,
        route: `/repos/${encodeRepositoryFullName(input.repositoryFullName)}/pulls/${input.pullRequestNumber}/reviews`,
        method: "POST",
        token: input.token,
        body: {
          event: input.event,
          body: input.body,
          comments: input.comments
        }
      });
    },
    async createIssueComment(input) {
      await requestJson(fetchImpl, {
        baseUrl,
        userAgent,
        route: `/repos/${encodeRepositoryFullName(input.repositoryFullName)}/issues/${input.issueNumber}/comments`,
        method: "POST",
        token: input.token,
        body: {
          body: input.body
        }
      });
    },
    async addLabels(input) {
      await requestJson(fetchImpl, {
        baseUrl,
        userAgent,
        route: `/repos/${encodeRepositoryFullName(input.repositoryFullName)}/issues/${input.issueNumber}/labels`,
        method: "POST",
        token: input.token,
        body: {
          labels: input.labels
        }
      });
    },
    async listPullRequestChangedPaths(input) {
      assertPositivePullRequestNumber(input.pullRequestNumber);
      const paths: string[] = [];
      let page = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await requestJsonWithHeaders(fetchImpl, {
          baseUrl,
          userAgent,
          route: `/repos/${encodeRepositoryFullName(input.repositoryFullName)}/pulls/${input.pullRequestNumber}/files?per_page=100&page=${page}`,
          method: "GET",
          token: input.token
        });

        paths.push(...readPullRequestFileNames(response.json));
        hasNextPage = hasNextLink(response.headers);
        page += 1;
      }

      return paths;
    },
    async getPullRequestMetadata(input) {
      assertPositivePullRequestNumber(input.pullRequestNumber);
      const json = await requestJson(fetchImpl, {
        baseUrl,
        userAgent,
        route: `/repos/${encodeRepositoryFullName(input.repositoryFullName)}/pulls/${input.pullRequestNumber}`,
        method: "GET",
        token: input.token
      });

      return readPullRequestMetadata(json);
    }
  };
}

interface GitHubRequestInput {
  readonly baseUrl: string;
  readonly userAgent: string;
  readonly route: string;
  readonly method: "GET" | "POST";
  readonly token: string;
  readonly body?: unknown;
}

async function requestJson(fetchImpl: GitHubFetch, input: GitHubRequestInput): Promise<unknown> {
  return (await requestJsonWithHeaders(fetchImpl, input)).json;
}

interface GitHubJsonResponse {
  readonly json: unknown;
  readonly headers: Headers;
}

async function requestJsonWithHeaders(fetchImpl: GitHubFetch, input: GitHubRequestInput): Promise<GitHubJsonResponse> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${input.token}`,
    "user-agent": input.userAgent,
    "x-github-api-version": gitHubApiVersion
  };
  const init: RequestInit = {
    method: input.method,
    headers
  };

  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  const response = await fetchImpl(`${input.baseUrl}${input.route}`, init);

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${input.method} ${input.route} returned ${response.status}`);
  }

  if (response.status === 204) {
    return { json: {}, headers: response.headers };
  }

  return {
    json: await response.json(),
    headers: response.headers
  };
}

function encodeRepositoryFullName(repositoryFullName: string): string {
  const [owner, repo, ...extra] = repositoryFullName.split("/");

  if (owner === undefined || repo === undefined || extra.length > 0 || owner.length === 0 || repo.length === 0) {
    throw new Error("Repository full name must use owner/repo format");
  }

  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function assertPositivePullRequestNumber(pullRequestNumber: number): void {
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new Error("Pull request number must be a positive integer");
  }
}

function readPullRequestFileNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error("GitHub pull request files response must be an array");
  }

  return value.map((file) => {
    const filename = readStringField(file, "filename");

    if (filename === undefined) {
      throw new Error("GitHub pull request files response included a file without filename");
    }

    return filename;
  });
}

function readPullRequestMetadata(value: unknown): GitHubPullRequestMetadata {
  const state = readStringField(value, "state");
  const head = readRecordField(value, "head");
  const base = readRecordField(value, "base");
  const headSha = readStringField(head, "sha");
  const headRepo = readRecordField(head, "repo");
  const baseRepo = readRecordField(base, "repo");
  const headRepositoryFullName = readStringField(headRepo, "full_name");
  const baseRepositoryFullName = readStringField(baseRepo, "full_name");
  const headRepositoryFork = readBooleanField(headRepo, "fork");

  if (
    state === undefined ||
    headSha === undefined ||
    headRepositoryFullName === undefined ||
    baseRepositoryFullName === undefined ||
    headRepositoryFork === undefined
  ) {
    throw new Error("GitHub pull request metadata response was missing required fields");
  }

  return {
    headSha,
    isClosed: state === "closed",
    isFork: headRepositoryFork || headRepositoryFullName !== baseRepositoryFullName
  };
}

function hasNextLink(headers: Headers): boolean {
  const linkHeader = headers.get("link");

  return linkHeader?.split(",").some((link) => /\brel="next"/u.test(link)) ?? false;
}

function readNumberField(value: unknown, key: string): number | undefined {
  const field = readField(value, key);

  return typeof field === "number" ? field : undefined;
}

function readStringField(value: unknown, key: string): string | undefined {
  const field = readField(value, key);

  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function readBooleanField(value: unknown, key: string): boolean | undefined {
  const field = readField(value, key);

  return typeof field === "boolean" ? field : undefined;
}

function readRecordField(value: unknown, key: string): Record<string, unknown> {
  const field = readField(value, key);

  return typeof field === "object" && field !== null && !Array.isArray(field) ? field as Record<string, unknown> : {};
}

function readField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}
