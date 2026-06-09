import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  mapPullRequestWebhookPayload,
  mapReviewerMentionWebhookPayload,
  type GitHubPullRequestMetadata
} from "../webhookEventMapper.js";

function pullRequestPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "synchronize",
    repository: {
      full_name: "kei781/sql-agent",
      clone_url: "https://github.com/kei781/sql-agent.git"
    },
    pull_request: {
      number: 42,
      draft: false,
      state: "open",
      base: { ref: "main" },
      head: {
        ref: "feature/sql-guard",
        sha: "abc123",
        repo: {
          full_name: "kei781/sql-agent",
          fork: false
        }
      }
    },
    ...overrides
  };
}

describe("mapPullRequestWebhookPayload", () => {
  it("maps repository and PR identity from the payload plus API-provided changed paths", () => {
    const result = mapPullRequestWebhookPayload({
      deliveryId: "delivery-1",
      payload: pullRequestPayload(),
      changedPaths: ["src/query.ts"]
    });

    assert.deepEqual(result, {
      ok: true,
      event: {
        deliveryId: "delivery-1",
        action: "synchronize",
        repositoryUrl: "https://github.com/kei781/sql-agent.git",
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42,
        baseBranch: "main",
        headBranch: "feature/sql-guard",
        headSha: "abc123",
        isDraft: false,
        isClosed: false,
        isFork: false,
        changedPaths: ["src/query.ts"]
      }
    });
  });

  it("detects fork, draft, and closed PR metadata without static repository config", () => {
    const result = mapPullRequestWebhookPayload({
      deliveryId: "delivery-2",
      payload: pullRequestPayload({
        pull_request: {
          number: 7,
          draft: true,
          state: "closed",
          base: { ref: "main" },
          head: {
            ref: "contrib/change",
            sha: "def456",
            repo: {
              full_name: "someone/sql-agent",
              fork: true
            }
          }
        }
      }),
      changedPaths: ["README.md"]
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.event.isDraft, true);
    assert.equal(result.ok && result.event.isClosed, true);
    assert.equal(result.ok && result.event.isFork, true);
  });

  it("fails closed for unsupported actions, malformed payloads, and empty changed paths", () => {
    assert.deepEqual(
      mapPullRequestWebhookPayload({
        deliveryId: "delivery-3",
        payload: pullRequestPayload({ action: "labeled" }),
        changedPaths: ["src/query.ts"]
      }),
      { ok: false, reason: "unsupported-action" }
    );

    assert.deepEqual(
      mapPullRequestWebhookPayload({
        deliveryId: "delivery-4",
        payload: { action: "opened" },
        changedPaths: ["src/query.ts"]
      }),
      { ok: false, reason: "invalid-payload" }
    );

    assert.deepEqual(
      mapPullRequestWebhookPayload({
        deliveryId: "delivery-5",
        payload: pullRequestPayload(),
        changedPaths: []
      }),
      { ok: false, reason: "changed-paths-unavailable" }
    );
  });

  it("does not reintroduce static owner or repo routing", () => {
    const source = readFileSync(new URL("../webhookEventMapper.js", import.meta.url), "utf8");

    assert.doesNotMatch(source, /GITHUB_OWNER|GITHUB_REPO/u);
  });
});

describe("mapReviewerMentionWebhookPayload", () => {
  const metadata: GitHubPullRequestMetadata = {
    headSha: "abc123",
    isClosed: false,
    isFork: false
  };

  it("maps issue_comment payloads using injected pull request metadata", () => {
    const result = mapReviewerMentionWebhookPayload({
      deliveryId: "delivery-mention-1",
      payload: {
        action: "created",
        repository: { full_name: "kei781/sql-agent" },
        issue: {
          number: 42,
          pull_request: { url: "https://api.github.com/repos/kei781/sql-agent/pulls/42" },
          labels: [{ name: "security-sensitive" }, { name: "bug" }]
        },
        comment: {
          id: 9001,
          body: "@ai-reviewer explain this",
          user: { login: "kei781" }
        }
      },
      pullRequestMetadata: metadata
    });

    assert.deepEqual(result, {
      ok: true,
      event: {
        deliveryId: "delivery-mention-1",
        action: "created",
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42,
        headSha: "abc123",
        commentId: 9001,
        commentBody: "@ai-reviewer explain this",
        commentAuthorLogin: "kei781",
        isPullRequest: true,
        isClosed: false,
        isFork: false,
        labels: ["security-sensitive", "bug"]
      }
    });
  });

  it("fails closed when issue comments are not pull request comments or metadata is missing", () => {
    assert.deepEqual(
      mapReviewerMentionWebhookPayload({
        deliveryId: "delivery-mention-2",
        payload: {
          action: "created",
          repository: { full_name: "kei781/sql-agent" },
          issue: { number: 42, labels: [] },
          comment: { id: 9001, body: "@ai-reviewer explain this", user: { login: "kei781" } }
        },
        pullRequestMetadata: metadata
      }),
      { ok: false, reason: "not-pull-request" }
    );

    assert.deepEqual(
      mapReviewerMentionWebhookPayload({
        deliveryId: "delivery-mention-3",
        payload: {
          action: "edited",
          repository: { full_name: "kei781/sql-agent" },
          issue: {
            number: 42,
            pull_request: { url: "https://api.github.com/repos/kei781/sql-agent/pulls/42" },
            labels: []
          },
          comment: { id: 9001, body: "@ai-reviewer explain this", user: { login: "kei781" } }
        }
      }),
      { ok: false, reason: "pull-request-metadata-unavailable" }
    );
  });
});
