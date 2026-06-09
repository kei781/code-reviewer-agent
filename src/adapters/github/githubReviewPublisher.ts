import type {
  ReviewFailurePublication,
  ReviewPublication,
  ReviewPublisherPort,
  ReviewSkipPublication
} from "../../app/runEnsembleReview.js";
import type {
  FollowUpFailurePublication,
  FollowUpPublisherPort,
  FollowUpResponsePublication,
  FollowUpSkipPublication
} from "../../app/respondToReviewerMention.js";
import type { CodebaseEvidence, CrossValidatedFinding } from "../../domain/review/crossValidation.js";
import type { GitHubInstallationTokenProvider } from "./githubAppInstallationToken.js";

export interface GitHubReviewComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

export interface GitHubCreatePullRequestReviewInput {
  readonly token: string;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
  readonly event: "COMMENT";
  readonly body: string;
  readonly comments: readonly GitHubReviewComment[];
}

export interface GitHubCreateIssueCommentInput {
  readonly token: string;
  readonly repositoryFullName: string;
  readonly issueNumber: number;
  readonly body: string;
}

export interface GitHubAddLabelsInput {
  readonly token: string;
  readonly repositoryFullName: string;
  readonly issueNumber: number;
  readonly labels: readonly string[];
}

export interface GitHubReviewClient {
  createPullRequestReview(input: GitHubCreatePullRequestReviewInput): Promise<void>;
  createIssueComment(input: GitHubCreateIssueCommentInput): Promise<void>;
  addLabels?(input: GitHubAddLabelsInput): Promise<void>;
}

export interface GitHubReviewPublisherOptions {
  readonly tokenProvider: GitHubInstallationTokenProvider;
  readonly client: GitHubReviewClient;
}

type FailurePublication = ReviewFailurePublication | FollowUpFailurePublication;
type SkipPublication = ReviewSkipPublication | FollowUpSkipPublication;

export function createGitHubReviewPublisher(
  options: GitHubReviewPublisherOptions
): ReviewPublisherPort & FollowUpPublisherPort {
  async function publishReview(publication: ReviewPublication): Promise<void> {
    const token = await options.tokenProvider.getInstallationToken(publication.context.repositoryFullName);

    await options.client.createPullRequestReview({
      token,
      repositoryFullName: publication.context.repositoryFullName,
      pullRequestNumber: publication.context.pullRequestNumber,
      event: "COMMENT",
      body: renderReviewBody(publication),
      comments: publication.findings.flatMap(renderFindingComments)
    });

    if (publication.summary.recommendedLabels.length > 0 && options.client.addLabels !== undefined) {
      await options.client.addLabels({
        token,
        repositoryFullName: publication.context.repositoryFullName,
        issueNumber: publication.context.pullRequestNumber,
        labels: publication.summary.recommendedLabels
      });
    }
  }

  async function publishFollowUpResponse(publication: FollowUpResponsePublication): Promise<void> {
    const token = await options.tokenProvider.getInstallationToken(publication.request.repositoryFullName);

    await options.client.createIssueComment({
      token,
      repositoryFullName: publication.request.repositoryFullName,
      issueNumber: publication.request.pullRequestNumber,
      body: renderFollowUpResponseBody(publication)
    });
  }

  const publishFailure: {
    (failure: ReviewFailurePublication): Promise<void>;
    (failure: FollowUpFailurePublication): Promise<void>;
  } = async (failure: FailurePublication): Promise<void> => {
    const token = await options.tokenProvider.getInstallationToken(failure.repositoryFullName);

    await options.client.createIssueComment({
      token,
      repositoryFullName: failure.repositoryFullName,
      issueNumber: failure.pullRequestNumber,
      body: renderFailureBody(failure)
    });
  };

  const publishSkip: {
    (skip: ReviewSkipPublication): Promise<void>;
    (skip: FollowUpSkipPublication): Promise<void>;
  } = async (skip: SkipPublication): Promise<void> => {
    const token = await options.tokenProvider.getInstallationToken(skip.repositoryFullName);

    await options.client.createIssueComment({
      token,
      repositoryFullName: skip.repositoryFullName,
      issueNumber: skip.pullRequestNumber,
      body: renderSkipBody(skip)
    });
  };

  return {
    publishReview,
    publishFollowUpResponse,
    publishFailure,
    publishSkip
  };
}

function renderReviewBody(publication: ReviewPublication): string {
  const summary = publication.summary;
  const lines = [
    "## AI ensemble review",
    "",
    `Reviewed SHA: ${summary.reviewedSha}`,
    `Merge signal: ${summary.mergeSignal}`,
    `Reviewer agents: ${summary.reviewerAgentIds.join(", ")}`,
    `Findings: ${summary.keptFindingCount} kept, ${summary.droppedFindingCount} dropped, ${summary.dedupedFindingCount} deduped`,
    `Human review reasons: ${summary.humanReviewReasons.length === 0 ? "none" : summary.humanReviewReasons.join(", ")}`,
    `Recommended labels: ${summary.recommendedLabels.length === 0 ? "none" : summary.recommendedLabels.join(", ")}`,
    "",
    ...summary.markerLines
  ];

  return lines.join("\n");
}

function renderFindingComments(finding: CrossValidatedFinding): readonly GitHubReviewComment[] {
  return finding.evidence.map((evidence) => ({
    path: evidence.filePath,
    line: reviewLine(evidence),
    body: renderFindingBody(finding)
  }));
}

function renderFindingBody(finding: CrossValidatedFinding): string {
  return [
    `### ${finding.title}`,
    "",
    `Severity: ${finding.severity}`,
    `Reviewer: ${finding.reviewerAgentId}`,
    `Corroborated by: ${finding.corroboratingAgentIds.join(", ")}`,
    `Fingerprint: \`${finding.fingerprint}\``,
    "",
    finding.description
  ].join("\n");
}

function renderSkipBody(skip: SkipPublication): string {
  if (isFollowUpSkip(skip)) {
    return [
      "## Skipped reviewer follow-up",
      "",
      `Reason: ${skip.reason}`,
      `Head SHA: ${skip.headSha}`,
      `Comment ID: ${skip.commentId}`,
      `Blocked labels: ${skip.blockedLabels.length === 0 ? "none" : skip.blockedLabels.join(", ")}`
    ].join("\n");
  }

  return ["## Skipped automated review", "", `Reason: ${skip.reason}`, `Head SHA: ${skip.headSha}`].join("\n");
}

function renderFailureBody(failure: FailurePublication): string {
  const lines = ["## Review server failure", "", `Stage: ${failure.stage}`, `Head SHA: ${failure.headSha}`];

  if (isFollowUpFailure(failure)) {
    lines.push(`Comment ID: ${failure.commentId}`);
  }

  lines.push("", "Details are retained in the server-side state store and logs.");
  return lines.join("\n");
}

function renderFollowUpResponseBody(publication: FollowUpResponsePublication): string {
  const lines = [
    publication.response.body,
    "",
    "---",
    `Reviewed SHA: ${publication.response.reviewedSha}`,
    `Response scope: ${publication.response.responseScope}`,
    `Source comment ID: ${publication.request.commentId}`
  ];

  if (publication.response.mergeSignal !== undefined) {
    lines.push(`Merge signal: ${publication.response.mergeSignal}`);
  }

  return lines.join("\n");
}

function reviewLine(evidence: CodebaseEvidence): number {
  return evidence.lineEnd ?? evidence.lineStart;
}

function isFollowUpFailure(failure: FailurePublication): failure is FollowUpFailurePublication {
  return "commentId" in failure;
}

function isFollowUpSkip(skip: SkipPublication): skip is FollowUpSkipPublication {
  return "commentId" in skip;
}
