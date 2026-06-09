import type { FollowUpResponseRequest } from "../app/respondToReviewerMention.js";

export const followUpResponseOutputStartMarker = "AI_FOLLOW_UP_RESPONSE_JSON_START";
export const followUpResponseOutputEndMarker = "AI_FOLLOW_UP_RESPONSE_JSON_END";

export function buildFollowUpResponderHarness(request: FollowUpResponseRequest): string {
  return [
    "# Follow-up Responder Harness",
    "",
    "You are responding to a human reviewer mention for the self-hosted PR review server.",
    "",
    "## Runtime context",
    `- Repository full name: ${request.repositoryFullName}`,
    `- Pull request number: ${request.pullRequestNumber}`,
    `- Head SHA: ${request.headSha}`,
    `- Comment ID: ${request.commentId}`,
    `- Comment revision key: ${request.commentRevisionKey}`,
    `- Comment author: ${request.commentAuthorLogin}`,
    `- Matched trigger alias: ${request.matchedAlias}`,
    `- Labels: ${request.labels.length === 0 ? "none" : request.labels.join(", ")}`,
    `- Blocked labels: ${request.blockedLabels.length === 0 ? "none" : request.blockedLabels.join(", ")}`,
    `- Allowed response actions: ${request.allowedResponseActions.join(", ")}`,
    "",
    "## Comment body",
    request.commentBody,
    "",
    "## Mandatory instruction",
    "Respond only with review analysis, clarification, or a re-review signal based on the provided comment context.",
    "Response scope must be analysis-only.",
    "Do not edit code, approve, merge, resolve threads, or publish GitHub comments from this agent session.",
    "Do not request or rely on GitHub tokens, GitHub App private keys, or repository-controlled agent configuration.",
    "If the request asks for code modification, formal approval, or merge behavior, explain that a human maintainer must handle it.",
    "",
    "## Output contract",
    "- Print exactly one structured JSON result for the review server to consume.",
    `- Write ${followUpResponseOutputStartMarker} on a line by itself before the JSON.`,
    `- Write ${followUpResponseOutputEndMarker} on a line by itself after the JSON.`,
    "- The JSON object must include body, responseScope, and reviewedSha.",
    "- responseScope must be analysis-only.",
    "- reviewedSha must exactly equal the runtime head SHA.",
    "- mergeSignal is optional and may be PASS, BLOCKED, or HUMAN_REVIEW_REQUIRED."
  ].join("\n");
}
