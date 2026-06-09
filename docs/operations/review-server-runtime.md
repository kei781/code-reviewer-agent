# Review Server Runtime Runbook

## Scope

Phase 3A provides the bootable self-hosted HTTP runtime. It opens a local Node.js server, exposes health and GitHub webhook routes, verifies GitHub webhook signatures, recognizes supported events, logs through `log()`, and returns safe acknowledgements.

Phase 3B provides the GitHub publication, git workspace preparation, and persistent state adapters. Phase 3C provides the guarded Claude Code orchestration adapter. Final HTTP-to-use-case dispatch wiring remains the next runtime integration step.

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
POST /webhooks/github
```

The server requires `X-Hub-Signature-256` and verifies it against `GITHUB_WEBHOOK_SECRET` before JSON parsing.

Recognized events:

- `pull_request`: `opened`, `synchronize`, `reopened`, `ready_for_review`
- `issue_comment`: `created`, `edited`

Unsupported events or repos outside `REVIEW_REPO_ALLOWLIST` return `202` with a skip reason and no review side effects.

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
