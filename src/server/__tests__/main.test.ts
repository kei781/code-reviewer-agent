import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import type { Config } from "../../shared/config.js";
import { resetLogSink, setLogSink } from "../../shared/log.js";
import { closeReviewServer, createRuntimeServer, summarizeConfigFailure } from "../main.js";

const servers: Server[] = [];

afterEach(async () => {
  resetLogSink();
  await Promise.all(servers.splice(0).map((server) => closeReviewServer(server)));
});

describe("review server runtime main", () => {
  it("wires runtime config into the HTTP server", async () => {
    setLogSink(() => undefined);
    const config = baseConfig({ repoAllowlist: ["kei781/sql-agent"] });
    const server = createRuntimeServer(config);
    const { baseUrl } = await listen(server);
    const body = JSON.stringify({ action: "opened", repository: { full_name: "kei781/sql-agent" } });

    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders(config.github.webhookSecret, "pull_request", "delivery-main-1", body),
      body
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      status: "accepted",
      eventName: "pull_request",
      action: "opened",
      deliveryId: "delivery-main-1",
      repositoryFullName: "kei781/sql-agent"
    });
  });

  it("summarizes config failures without leaking config values", () => {
    const summary = summarizeConfigFailure({
      ok: false,
      missingKeys: ["GITHUB_WEBHOOK_SECRET"],
      invalidValues: [{ key: "MODEL_EGRESS_ALLOWLIST", reason: "must list at least one allowed egress host" }]
    });

    assert.deepEqual(summary, {
      missingKeys: ["GITHUB_WEBHOOK_SECRET"],
      invalidKeys: ["MODEL_EGRESS_ALLOWLIST"]
    });
    assert.doesNotMatch(JSON.stringify(summary), /secret-value|api\.openai\.com/u);
  });

  it("closes the runtime server gracefully", async () => {
    const server = createRuntimeServer(baseConfig());
    await listen(server);

    await closeReviewServer(server);

    assert.equal(server.listening, false);
  });
});

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    server: {
      host: "127.0.0.1",
      port: 0,
      databasePath: ".data/review-server.sqlite",
      workspaceRoot: ".workspaces"
    },
    github: {
      appId: "123456",
      privateKeyPath: "/run/secrets/github-app.private-key.pem",
      webhookSecret: "test-webhook-secret"
    },
    orchestrator: {
      command: "claude",
      authMode: "local-oauth"
    },
    modelEgressAllowlist: ["api.anthropic.com", "api.openai.com"],
    repoAllowlist: [],
    policy: {
      labels: {
        humanReview: "needs-human-review",
        securitySensitive: "security-sensitive",
        doNotMerge: "do-not-merge"
      },
      trustedReviewers: ["claude[bot]", "claude-code[bot]"],
      riskyPathPatterns: [".github/workflows/**"]
    },
    ...overrides
  };
}

async function listen(server: Server): Promise<{ readonly baseUrl: string }> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  assert.ok(address !== null && typeof address === "object");

  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

function signedHeaders(secret: string, eventName: string, deliveryId: string, body: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-GitHub-Delivery": deliveryId,
    "X-GitHub-Event": eventName,
    "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  };
}
