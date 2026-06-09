import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGitHubPullRequestMetadataProvider } from "../githubPullRequestMetadataProvider.js";

describe("createGitHubPullRequestMetadataProvider", () => {
  it("reads changed paths and PR metadata through installation-token-backed GitHub clients", async () => {
    const tokenRequests: string[] = [];
    const readCalls: Array<Readonly<Record<string, unknown>>> = [];
    const provider = createGitHubPullRequestMetadataProvider({
      tokenProvider: {
        async getInstallationToken(repositoryFullName) {
          tokenRequests.push(repositoryFullName);
          return "installation-token";
        }
      },
      client: {
        async listPullRequestChangedPaths(input) {
          readCalls.push({ method: "listPullRequestChangedPaths", ...input });
          return ["src/server.ts"];
        },
        async getPullRequestMetadata(input) {
          readCalls.push({ method: "getPullRequestMetadata", ...input });
          return { headSha: "abc123", isClosed: false, isFork: false };
        }
      }
    });

    assert.deepEqual(
      await provider.listChangedPaths({
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42
      }),
      ["src/server.ts"]
    );
    assert.deepEqual(
      await provider.getPullRequestMetadata({
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42
      }),
      { headSha: "abc123", isClosed: false, isFork: false }
    );
    assert.deepEqual(tokenRequests, ["kei781/sql-agent", "kei781/sql-agent"]);
    assert.deepEqual(readCalls, [
      {
        method: "listPullRequestChangedPaths",
        token: "installation-token",
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42
      },
      {
        method: "getPullRequestMetadata",
        token: "installation-token",
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42
      }
    ]);
  });
});
