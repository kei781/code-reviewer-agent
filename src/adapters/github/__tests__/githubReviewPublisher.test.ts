import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewPublication } from "../../../app/runEnsembleReview.js";
import type { FollowUpResponsePublication } from "../../../app/respondToReviewerMention.js";
import { createGitHubReviewPublisher, type GitHubReviewClient } from "../githubReviewPublisher.js";

function reviewPublication(): ReviewPublication {
  return {
    context: {
      repositoryUrl: "https://github.com/kei781/sql-agent.git",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      baseBranch: "main",
      headBranch: "feature/sql-guard",
      headSha: "abc123",
      localWorkspacePath: "/tmp/sql-agent"
    },
    findings: [
      {
        id: "sql-limit-bypass",
        fingerprint: "security:sql-limit-bypass:src/query.ts",
        reviewerAgentId: "reviewer-claude-code",
        title: "LIMIT can be bypassed",
        description: "The query path accepts model SQL without enforcing the default LIMIT.",
        severity: "blocker",
        evidence: [
          {
            filePath: "src/query.ts",
            lineStart: 12,
            observedInLocalCheckout: true
          }
        ],
        validationStatus: "publishable",
        validatedByOrchestrator: true,
        corroboratingAgentIds: ["reviewer-codex"]
      }
    ],
    summary: {
      reviewedSha: "abc123",
      reviewerAgentIds: ["reviewer-claude-code", "reviewer-codex"],
      keptFindingCount: 1,
      droppedFindingCount: 0,
      dedupedFindingCount: 0,
      mergeSignal: "BLOCKED",
      humanReviewReasons: [],
      recommendedLabels: ["security-sensitive"],
      riskyPathMatches: [],
      markerLines: ["<!-- ai-reviewer:reviewed-sha=abc123 -->"]
    }
  };
}

function followUpPublication(): FollowUpResponsePublication {
  return {
    request: {
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      headSha: "abc123",
      commentId: 9001,
      commentRevisionKey: "sha256:abc",
      commentBody: "@ai-reviewer explain this",
      commentAuthorLogin: "kei781",
      matchedAlias: "@ai-reviewer",
      labels: [],
      blockedLabels: [],
      allowedResponseActions: ["analysis", "explanation", "risk-clarification", "re-review-signal"]
    },
    response: {
      body: "The risk is limited to the changed SQL guard.",
      responseScope: "analysis-only",
      reviewedSha: "abc123",
      mergeSignal: "HUMAN_REVIEW_REQUIRED"
    }
  };
}

describe("createGitHubReviewPublisher", () => {
  it("publishes review findings through a server-side installation token without approving", async () => {
    const calls: unknown[] = [];
    const client: GitHubReviewClient = {
      async createPullRequestReview(input) {
        calls.push({ method: "createPullRequestReview", ...input });
      },
      async createIssueComment(input) {
        calls.push({ method: "createIssueComment", ...input });
      },
      async addLabels(input) {
        calls.push({ method: "addLabels", ...input });
      }
    };
    const publisher = createGitHubReviewPublisher({
      tokenProvider: { async getInstallationToken() { return "installation-token"; } },
      client
    });

    await publisher.publishReview(reviewPublication());

    assert.equal(calls.length, 2);
    const review = calls[0] as {
      token: string;
      event: string;
      body: string;
      comments: readonly { path: string; line: number; body: string }[];
    };
    assert.equal(review.token, "installation-token");
    assert.equal(review.event, "COMMENT");
    assert.match(review.body, /Merge signal: BLOCKED/u);
    assert.deepEqual(review.comments, [
      {
        path: "src/query.ts",
        line: 12,
        body: [
          "### LIMIT can be bypassed",
          "",
          "Severity: blocker",
          "Reviewer: reviewer-claude-code",
          "Corroborated by: reviewer-codex",
          "Fingerprint: `security:sql-limit-bypass:src/query.ts`",
          "",
          "The query path accepts model SQL without enforcing the default LIMIT."
        ].join("\n")
      }
    ]);
    assert.deepEqual((calls[1] as { labels: readonly string[] }).labels, ["security-sensitive"]);
  });

  it("publishes skips, failures, and follow-up responses as issue comments", async () => {
    const calls: unknown[] = [];
    const publisher = createGitHubReviewPublisher({
      tokenProvider: { async getInstallationToken() { return "installation-token"; } },
      client: {
        async createPullRequestReview(input) {
          calls.push({ method: "createPullRequestReview", ...input });
        },
        async createIssueComment(input) {
          calls.push({ method: "createIssueComment", ...input });
        }
      }
    });

    await publisher.publishSkip({
      deliveryId: "delivery-1",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      headSha: "abc123",
      reason: "draft"
    });
    await publisher.publishFailure({
      deliveryId: "delivery-2",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      headSha: "abc123",
      stage: "prepare-workspace",
      message: "secret=BEGIN PRIVATE KEY"
    });
    await publisher.publishFollowUpResponse(followUpPublication());

    assert.equal(calls.length, 3);
    assert.match((calls[0] as { body: string }).body, /Skipped automated review/u);
    assert.match((calls[1] as { body: string }).body, /Review server failure/u);
    assert.doesNotMatch((calls[1] as { body: string }).body, /BEGIN PRIVATE KEY/u);
    assert.match((calls[2] as { body: string }).body, /The risk is limited/u);
  });
});
