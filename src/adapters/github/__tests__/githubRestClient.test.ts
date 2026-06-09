import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGitHubRestClient } from "../githubRestClient.js";

interface RecordedFetch {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body?: unknown;
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("createGitHubRestClient", () => {
  it("implements GitHub App installation token calls with bearer app JWTs", async () => {
    const calls: RecordedFetch[] = [];
    const client = createGitHubRestClient({
      baseUrl: "https://api.github.test",
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init.method ?? "GET",
          authorization: new Headers(init.headers).get("authorization"),
          body: init.body === undefined ? undefined : JSON.parse(String(init.body))
        });

        if (String(url).endsWith("/repos/kei781/sql-agent/installation")) {
          return createJsonResponse({ id: 123456 });
        }

        return createJsonResponse({ token: "installation-token", expires_at: "2026-06-09T12:10:00.000Z" });
      }
    });

    assert.equal(
      await client.getRepositoryInstallationId({
        appJwt: "app-jwt",
        repositoryFullName: "kei781/sql-agent"
      }),
      123456
    );
    assert.deepEqual(
      await client.createInstallationAccessToken({
        appJwt: "app-jwt",
        installationId: 123456
      }),
      {
        token: "installation-token",
        expiresAt: "2026-06-09T12:10:00.000Z"
      }
    );

    assert.deepEqual(calls.map((call) => [call.method, call.url, call.authorization]), [
      ["GET", "https://api.github.test/repos/kei781/sql-agent/installation", "Bearer app-jwt"],
      ["POST", "https://api.github.test/app/installations/123456/access_tokens", "Bearer app-jwt"]
    ]);
  });

  it("posts pull request reviews, issue comments, and labels with installation tokens", async () => {
    const calls: RecordedFetch[] = [];
    const client = createGitHubRestClient({
      baseUrl: "https://api.github.test",
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init.method ?? "GET",
          authorization: new Headers(init.headers).get("authorization"),
          body: init.body === undefined ? undefined : JSON.parse(String(init.body))
        });

        return createJsonResponse({ ok: true });
      }
    });

    await client.createPullRequestReview({
      token: "installation-token",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      event: "COMMENT",
      body: "summary",
      comments: [{ path: "src/query.ts", line: 12, body: "finding" }]
    });
    await client.createIssueComment({
      token: "installation-token",
      repositoryFullName: "kei781/sql-agent",
      issueNumber: 42,
      body: "skip"
    });
    assert.ok(client.addLabels);
    await client.addLabels({
      token: "installation-token",
      repositoryFullName: "kei781/sql-agent",
      issueNumber: 42,
      labels: ["security-sensitive"]
    });

    assert.deepEqual(calls.map((call) => [call.method, call.url, call.authorization]), [
      ["POST", "https://api.github.test/repos/kei781/sql-agent/pulls/42/reviews", "Bearer installation-token"],
      ["POST", "https://api.github.test/repos/kei781/sql-agent/issues/42/comments", "Bearer installation-token"],
      ["POST", "https://api.github.test/repos/kei781/sql-agent/issues/42/labels", "Bearer installation-token"]
    ]);
    assert.deepEqual(calls[0]?.body, {
      event: "COMMENT",
      body: "summary",
      comments: [{ path: "src/query.ts", line: 12, body: "finding" }]
    });
    assert.deepEqual(calls[2]?.body, { labels: ["security-sensitive"] });
  });

  it("throws sanitized errors for failed GitHub API responses", async () => {
    const client = createGitHubRestClient({
      baseUrl: "https://api.github.test",
      fetch: async () => createJsonResponse({ message: "token expired" }, 401)
    });

    await assert.rejects(
      () =>
        client.createIssueComment({
          token: "secret-token",
          repositoryFullName: "kei781/sql-agent",
          issueNumber: 42,
          body: "body"
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /GitHub API request failed/u);
        assert.doesNotMatch(error.message, /secret-token/u);
        return true;
      }
    );
  });
});
