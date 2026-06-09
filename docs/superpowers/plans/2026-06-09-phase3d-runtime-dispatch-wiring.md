# Phase 3D Runtime Dispatch Wiring Plan

## Goal

Wire the self-hosted webhook HTTP server to the already-built review use cases so a recognized GitHub webhook can be dispatched into the runtime safely:

- `pull_request` webhooks map to `runEnsembleReview`.
- `issue_comment` reviewer mentions map to `respondToReviewerMention`.
- GitHub PR metadata and changed paths are fetched outside the agent sandbox.
- Agent execution remains behind injected ports and the existing egress guard abstraction.

This phase does not add fixer behavior, approval behavior, merge automation, fork secret access, or any branch-protection bypass.

## Architecture Boundary

Runtime dispatch belongs under `src/server` because it bridges HTTP delivery to app use cases. It may depend on app ports and concrete adapters through explicit injection.

New/changed modules:

- `src/server/httpServer.ts`
  - Pass the parsed webhook payload to the recognized-webhook callback.
  - Keep HTTP response behavior unchanged: valid webhook deliveries return `202`.
- `src/server/webhookDispatcher.ts`
  - Own webhook-to-use-case routing.
  - Fetch PR changed paths for `pull_request` events before mapping.
  - Fetch PR metadata for PR `issue_comment` events before mapping.
  - Return structured dispatch results for tests and logs.
- `src/adapters/github/githubRestClient.ts`
  - Add read-only PR metadata APIs.
  - Add read-only PR changed-file listing.
- `src/adapters/github/githubPullRequestMetadataProvider.ts`
  - Convert installation-token-backed GitHub REST reads into the dispatcher metadata provider.
- `src/adapters/orchestrator/claudeCodeFollowUpResponderAdapter.ts`
  - Implement `FollowUpResponderPort` using Claude Code as a read-only responder.
  - Reuse command execution, environment scrubbing, timeout, and egress guard patterns.
- `src/agents/followUpResponderHarness.ts`
  - Keep follow-up prompt construction separate from the adapter.
  - Require JSON markers and analysis-only response semantics.
- `docs/architecture/directory-structure.md`
  - Update only if new runtime files change ownership descriptions.
- `docs/superpowers/implementation/phase-3d-runtime-dispatch-wiring.md`
  - Record implemented behavior, tests, and residual deployment notes.

## TDD Tasks

1. HTTP payload forwarding
   - Add a failing test that `createReviewHttpServer` passes both recognition metadata and parsed payload to `onRecognizedWebhook`.
   - Implement the callback input shape.

2. GitHub metadata reads
   - Add failing tests for:
     - PR changed-path pagination/filename extraction.
     - PR metadata mapping to `GitHubPullRequestMetadata`.
     - malformed repository names fail closed.
   - Implement REST client methods and metadata provider.

3. Pull-request dispatch
   - Add failing tests that a recognized `pull_request` event:
     - fetches changed paths;
     - maps payload through `mapPullRequestWebhookPayload`;
     - calls `runEnsembleReview` ports;
     - logs through `log()`.
   - Implement dispatcher branch.

4. Reviewer-mention dispatch
   - Add failing tests that a recognized PR `issue_comment` event:
     - fetches PR metadata;
     - maps payload through `mapReviewerMentionWebhookPayload`;
     - calls `respondToReviewerMention` ports.
   - Implement dispatcher branch.

5. Follow-up responder adapter
   - Add failing tests for:
     - prompt/harness contains no fixer or approval instructions;
     - adapter parses bounded JSON markers;
     - invalid JSON, missing markers, command failures, and disallowed scopes fail closed.
   - Implement the adapter and harness.

6. Runtime factory integration
   - Add failing tests that runtime server wiring invokes a supplied dispatcher callback after webhook recognition.
   - Keep concrete sandbox egress enforcement injected; default runtime must not silently bypass the egress guard.

7. Verification
   - Run `npm run check`.
   - Inspect `git diff` for accidental `console.log`, fixer/API-key regressions, or directory-boundary violations.
   - Push branch and open PR.

## Residual Deployment Note

The current architecture deliberately keeps model egress enforcement as an injected adapter. If a deployment has not supplied an active enforcement mechanism, the runtime must fail closed rather than launch Claude Code or Codex without the configured allowlist boundary.
