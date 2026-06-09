# Self-hosted Webhook Server Runtime Design

## Status

Runtime design record. Phase 3A added the listening server and pm2 entrypoint, Phase 3B added GitHub/workspace/state adapters, Phase 3C added the guarded Claude Code orchestration adapter, and Phase 3D added dispatch wiring from recognized webhooks into the app use cases.

## Intent

The repository currently exposes TypeScript domain, app, orchestration, config, and harness modules. That is enough to test the review workflow as reusable code, but not enough to operate the product. A process manager such as pm2 needs a concrete entrypoint that opens a port, accepts GitHub webhooks, verifies them, maps payloads into existing app use cases, and wires concrete adapters.

Phase 3 turns the review-server scaffold into an operable self-hosted runtime while preserving the v5 architecture: review-only behavior, no model write tokens in agent sessions, no auto-fix, no approval, no merge automation, and no branch-protection bypass.

## Goals

- Provide a Node.js server entrypoint that can be run with `npm start` and managed by pm2.
- Expose `GET /healthz` for local and pm2 health checks.
- Expose `POST /webhooks/github` for GitHub App webhook delivery.
- Verify GitHub webhook signatures before parsing trusted event data.
- Route supported `pull_request` and `issue_comment` events into the existing app use cases.
- Keep concrete GitHub, git workspace, state store, and Claude Code execution concerns in adapters.
- Keep `src/shared/config.ts` as the only runtime environment read point.
- Keep all logs behind `log()` rather than direct `console.log()`.
- Preserve human handoff: the server publishes review signals and follow-up responses, not formal approvals or code changes.

## Non-goals

- No auto-fix, patch application, branch push, formal approval, auto-merge, or thread resolve.
- No production dashboard, Slack integration, billing, or cost reporting.
- No neutral `ServerReconcileOrchestrator`; the existing Claude Code MVP judgment-stage residual-bias exception remains tracked.
- No repository-hosted GitHub Actions AI review workflow.
- No TLS termination inside the Node process; use a reverse proxy or tunnel in deployment if HTTPS termination is required.
- No secret injection into agent workspaces or Claude/Codex prompts.

## Approach Options

### Option A: Thin Node HTTP Runtime (Recommended)

Use Node's built-in HTTP server for a small routing layer, then call typed adapter/use-case modules. This keeps dependencies small, works with the existing TypeScript setup, and makes each boundary easy to test with plain request/response objects.

Trade-off: routing and body parsing are hand-written. The server surface is intentionally tiny, so this is acceptable.

### Option B: Express or Fastify Runtime

Add a web framework and implement routes using middleware.

Trade-off: easier routing, but adds runtime dependencies and framework-specific conventions before the server needs them. This is not needed for two endpoints.

### Option C: External Server Wrapper

Keep this repo as a library and build the webhook server in another repository.

Trade-off: avoids adding runtime code here, but splits config, phase ownership, tests, and operational docs. It also leaves this repository unable to satisfy the self-hosted review-server product on its own.

## Recommended Architecture

```text
pm2
`-- node --env-file=.env dist/server/cli.js
        |-- shared/config.ts
        |-- server/httpServer.ts
        |-- adapters/github/*
        |-- adapters/workspace/*
        |-- adapters/state/*
        |-- adapters/orchestrator/*
        `-- app/runEnsembleReview.ts and app/respondToReviewerMention.ts
```

### Runtime Modules

- `src/server/cli.ts`
- `src/server/main.ts`
  - Process entrypoint.
  - Loads typed config.
  - Exposes a dispatcher hook for wiring concrete runtime adapters.
  - Starts the HTTP server.
  - Handles `SIGINT` and `SIGTERM` by closing the server and logging shutdown.

- `src/server/httpServer.ts`
  - Creates the Node HTTP server.
  - Handles `GET /healthz`.
  - Handles `POST /webhooks/github`.
  - Rejects unsupported methods and paths.
  - Enforces a bounded request body size.
  - Does not import GitHub SDKs or run shell commands directly.

- `src/adapters/github/webhookSignature.ts`
  - Verifies `X-Hub-Signature-256` using `GITHUB_WEBHOOK_SECRET`.
  - Uses constant-time comparison.
  - Rejects missing, malformed, or mismatched signatures before JSON parsing.

- `src/adapters/github/webhookEventMapper.ts`
  - Maps GitHub webhook payloads into `PullRequestWebhookEvent` and `ReviewerMentionCommentEvent`.
  - Reads repository identity, clone URL, PR number, branches, and head SHA from the payload, not static owner/repo config.
  - Applies optional repo allowlist if `REVIEW_REPO_ALLOWLIST` exists in the merged config line.

- `src/adapters/github/githubReviewPublisher.ts`
  - Publishes review summaries, findings, skips, and failures through GitHub App installation tokens.
  - Keeps GitHub tokens server-side and never passes them to agent sessions.

- `src/adapters/workspace/gitWorkspaceAdapter.ts`
  - Prepares local checkout with clone, fetch, and detached checkout pinned to webhook head SHA.
  - Uses native `git` commands through a command runner adapter.
  - Rejects unsafe workspace paths.

- `src/adapters/state/sqliteReviewStateStore.ts`
  - Stores review claims and publication fingerprints at `REVIEW_SERVER_DATABASE_PATH`.
  - Keeps duplicate webhook deliveries idempotent across process restarts.

- `src/adapters/orchestrator/claudeCodeOrchestratorAdapter.ts`
  - Launches the local OAuth-authenticated Claude Code command from config.
  - Provides the orchestrator harness and local checkout context.
  - Lets Claude Code invoke Codex through pre-connected plugin/tooling.
  - Launches Claude Code only after a model egress guard has applied `MODEL_EGRESS_ALLOWLIST`.
  - Does not inject GitHub tokens or App private keys into the agent process.

- `src/adapters/network/modelEgressGuard.ts`
  - Applies a deny-by-default network policy to the Claude Code agent process.
  - Allows only hosts listed in `config.modelEgressAllowlist`.
  - Uses the deployment's concrete network mechanism, such as a sandbox network policy, container network policy, or OS firewall wrapper.
  - Fails closed when the allowlist is empty, malformed, or cannot be enforced.

- `ecosystem.config.cjs`
  - pm2 process definition for `node --env-file=.env dist/server/cli.js`.
  - Uses environment variables supplied outside source control.

## Runtime Flow

1. pm2 starts `dist/server/cli.js` with Node 24 `--env-file=.env`.
2. `src/server/cli.ts` calls `main()`, and `src/server/main.ts` loads config through `loadConfig()`.
3. The HTTP server listens on `REVIEW_SERVER_HOST` and `REVIEW_SERVER_PORT`.
4. `GET /healthz` returns `200` with basic status.
5. GitHub sends a webhook to `POST /webhooks/github`.
6. The server reads the raw body with a fixed maximum size.
7. The server verifies `X-Hub-Signature-256`.
8. The mapper converts supported events:
   - `pull_request` opened, synchronize, reopened, ready_for_review -> `runEnsembleReview`.
   - `issue_comment` created, edited -> `respondToReviewerMention`.
9. Unsupported events return `202` with a logged skip reason.
10. App use cases coordinate injected ports.
11. Concrete adapters perform workspace preparation, orchestration, state claim, and publication.
12. The HTTP response acknowledges delivery after the server has either queued or completed the review action for the chosen implementation stage.

## Phase Breakdown

### Phase 3A: Bootable Server Runtime

Intent: make the repository pm2-runnable without pretending the full review pipeline is wired.

Deliverables:

- `src/server/cli.ts`
- `src/server/main.ts`
- `src/server/httpServer.ts`
- `GET /healthz`
- `POST /webhooks/github` route with raw body capture and signature verification
- `npm start`, `npm run serve`, and pm2 ecosystem config
- Tests for route handling, signature verification, body limits, config failure, and graceful shutdown

Exit criteria:

- `npm run check` passes.
- `npm start` runs `dist/server/cli.js` with Node 24 `--env-file=.env` after build.
- pm2 can start the process and hit `/healthz`.
- Webhook delivery with invalid signature is rejected before JSON parsing.
- Supported GitHub events can be recognized and logged, even if later adapters are still stubbed for Phase 3A.

### Phase 3B: GitHub, Workspace, and State Adapters

Intent: connect webhook events to existing app use cases with server-side GitHub and git effects.

Deliverables:

- GitHub webhook payload mapper
- GitHub App installation token adapter
- GitHub publisher adapter
- Git workspace adapter pinned to head SHA
- Persistent state store adapter
- Tests using fake GitHub, fake command runner, and temporary state directory

Exit criteria:

- A pull request webhook can prepare a local workspace through the adapter boundary.
- Duplicate webhook delivery is skipped through persistent state.
- Publication uses server-side GitHub credentials only.
- Fork, draft, closed, and unsupported events keep existing safe skip behavior.

### Phase 3C: Claude Code Orchestrator Adapter

Intent: run the local Claude Code orchestrator as the concrete review engine.

Status: implemented as the adapter and safety boundary layer. Phase 3D connects recognized webhook deliveries to app use cases through explicit dispatcher ports.

Deliverables:

- Claude Code command adapter
- Harness handoff for orchestrator, Claude reviewer, and Codex reviewer
- Model egress guard adapter and deny-by-default network policy handoff
- Agent process environment scrubber
- Runtime timeout and failure publication handling
- Tests for command construction, egress allowlist enforcement, secret exclusion, timeout handling, and failure records

Exit criteria:

- The server can invoke Claude Code against a prepared local checkout.
- Claude Code is never launched without an active egress guard that enforces `MODEL_EGRESS_ALLOWLIST`.
- If egress policy setup fails, the adapter fails closed before launching the agent process.
- GitHub tokens and App private keys are absent from the agent environment.
- Codex remains invoked by Claude Code plugin/tooling, not a server-side Codex config command.
- Review failures produce safe failure records instead of hanging the webhook server.

## Security Requirements

- Verify webhook signatures against the raw request body.
- Use constant-time digest comparison.
- Reject invalid signatures before JSON parsing.
- Bound request body size.
- Keep GitHub App private key and installation tokens in server adapters only.
- Do not pass GitHub credentials, webhook secrets, or private key paths to Claude Code or Codex.
- Restrict agent process network egress to `MODEL_EGRESS_ALLOWLIST` with a deny-by-default guard owned by `claudeCodeOrchestratorAdapter`.
- Fail closed if `MODEL_EGRESS_ALLOWLIST` is missing, empty, or cannot be enforced for the agent process.
- Do not execute repository-controlled `.claude/`, `CLAUDE.md`, git hooks, or agent config.
- Do not default the agent process working directory to the PR-controlled checkout; pass the checkout path as untrusted review data instead.
- Pin local checkout to webhook head SHA.
- Treat payload text, PR comments, commit messages, and repository content as untrusted input.

## Configuration Requirements

Phase 3B prerequisite: the repo-agnostic config change from PR #24 must be present before implementing `src/adapters/github/webhookEventMapper.ts`. The mapper must read repository identity from each webhook payload and optional `REVIEW_REPO_ALLOWLIST`; it must not reintroduce static `GITHUB_OWNER` or `GITHUB_REPO` routing.

Required current keys on main after PR #24:

- `REVIEW_SERVER_HOST`
- `REVIEW_SERVER_PORT`
- `REVIEW_SERVER_DATABASE_PATH`
- `REVIEW_SERVER_WORKSPACE_ROOT`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY_PATH`
- `GITHUB_WEBHOOK_SECRET`
- `CLAUDE_CODE_COMMAND`
- `CLAUDE_CODE_AUTH_MODE`
- `MODEL_EGRESS_ALLOWLIST`
- `HUMAN_REVIEW_LABEL`
- `SECURITY_SENSITIVE_LABEL`
- `DO_NOT_MERGE_LABEL`
- `TRUSTED_REVIEWERS`
- `RISKY_PATH_PATTERNS`

Optional current keys:

- `REVIEW_REPO_ALLOWLIST`: comma-separated `owner/repo` entries. Unset or empty means every repository where the GitHub App is installed is eligible. If set to a non-empty string that parses to zero entries, config loading must fail closed.

## Testing Strategy

- TDD for every new runtime module.
- Unit-test HTTP route behavior without opening a real network port where possible.
- Integration-test server listen and `/healthz` on a random local port.
- Unit-test signature verification with valid, missing, malformed, and mismatched signatures.
- Unit-test body size rejection.
- Unit-test mapper behavior for supported and unsupported GitHub events.
- Unit-test that Phase 3B mapper rejects implementation paths that depend on static `GITHUB_OWNER` or `GITHUB_REPO`.
- Unit-test egress guard behavior: missing or empty allowlist fails closed, guard setup failure prevents Claude Code launch, and successful launch receives only allowed model API hosts.
- Unit-test every adapter with injected fake command runners or fake GitHub clients before using real side effects.
- Keep `npm run check` as the required merge verification.
- Add static tests that no module outside `src/shared/config.ts` reads `process.env` directly and no source/script calls `console.log()` directly.

## Human Editability Rules

- Keep runtime modules short and named by responsibility.
- Keep route parsing separate from GitHub mapping.
- Keep GitHub API calls separate from domain/app use cases.
- Keep git shell execution behind a command runner interface.
- Keep Claude Code process execution behind an orchestrator adapter.
- Prefer plain exported TypeScript types over hidden object shapes.

## Design Decisions for Implementation Plan

- Phase 3A returns `202 Accepted` after raw-body capture, signature verification, event classification, repo allowlist checks, and a logged recognized-event record. Full review use-case invocation remains a final dispatch wiring step now that the Phase 3B GitHub/workspace/state adapters and Phase 3C orchestrator adapter exist.
- Phase 3B uses Node 24 `node:sqlite` behind a `ReviewStateStore` adapter because the pinned local runtime provides it. The adapter must keep SQLite APIs out of `src/domain` and `src/app`, so a later move to an external SQLite package only changes `src/adapters/state`.
- pm2 runs the built `dist/server/cli.js` directly with Node 24 `--env-file=.env`. `npm start` uses the same Node command, and `npm run serve` builds first and then delegates to `npm start`. The pm2 ecosystem file does not store secrets.

## Success Criteria

- A maintainer can run setup, build, start the server, and keep it alive with pm2.
- GitHub can deliver signed webhooks to a stable endpoint.
- The server can reject unsafe or unsupported events without side effects.
- The server can eventually drive the already-implemented app use cases through adapters.
- The runtime remains review-only and human-gated.
