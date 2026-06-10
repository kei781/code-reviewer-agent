# Review Server Runtime Runbook

## Scope

Phase 3A provides the bootable self-hosted HTTP runtime. It opens a local Node.js server, exposes health and GitHub webhook routes, verifies GitHub webhook signatures, recognizes supported events, logs through `log()`, and returns safe acknowledgements.

Phase 3B provides the GitHub publication, git workspace preparation, and persistent state adapters. Phase 3C provides the guarded Claude Code orchestration adapter. Phase 3D adds the webhook dispatcher that routes recognized deliveries into the review and reviewer-mention use cases through injected runtime ports.

## Local Startup

1. Run setup if the repository has not been prepared:

```sh
sh scripts/setup.sh
```

2. Edit `.env` with real GitHub App and webhook values.

3. Build and start the server:

```sh
npm run serve
```

`npm run serve` builds first, then delegates to `npm start`. `npm start` uses Node 24 `--env-file=.env` and runs `dist/server/cli.js`.

## Health Check

```sh
curl http://127.0.0.1:3000/healthz
```

Expected response:

```json
{"status":"ok"}
```

## GitHub Webhook Route

Configure the GitHub App webhook URL to point at:

```text
POST /request_reviewer/webhook
```

`POST /webhooks/github` remains available as the legacy-compatible path.

The server requires `X-Hub-Signature-256` and verifies it against `GITHUB_WEBHOOK_SECRET` before JSON parsing.

In the repository webhook UI, choose `Let me select individual events.` under `Which events would you like to trigger this webhook?` Do not leave the default `Just the push event.` selected.

Recognized events:

- `pull_request`: `opened`, `synchronize`, `reopened`, `ready_for_review`
- `issue_comment`: `created`, `edited`

Unsupported events or repos outside `REVIEW_REPO_ALLOWLIST` return `202` with a skip reason and no review side effects.

Recognized deliveries are acknowledged with `202` without waiting for long-running review execution. Dispatch runs behind the configured callback and logs failures through `log()`.

## Runtime Dispatch

Phase 3D exposes `createWebhookDispatcher()` for wiring recognized webhook deliveries into:

- `runEnsembleReview` for supported `pull_request` deliveries.
- `respondToReviewerMention` for supported `issue_comment` reviewer mentions.

The dispatcher enriches events with GitHub PR changed paths and PR metadata before calling app use cases. Model execution still requires a concrete `ModelEgressGuard`; deployments must fail closed rather than launch Claude Code without an active allowlist enforcement mechanism.

## pm2

Start:

```sh
pm2 start ecosystem.config.cjs
```

Inspect:

```sh
pm2 status code-reviewer-agent
pm2 logs code-reviewer-agent --lines 50 --nostream
```

Stop:

```sh
pm2 stop code-reviewer-agent
```

The pm2 config runs `dist/server/cli.js` directly with Node 24 `--env-file=.env` and does not store secrets. Keep runtime values in `.env` or in the deployment environment.
