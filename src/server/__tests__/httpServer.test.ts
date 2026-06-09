import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetLogSink, setLogSink } from "../../shared/log.js";
import { createReviewHttpServer, type RecognizedWebhookDelivery } from "../httpServer.js";

const webhookSecret = "test-webhook-secret";
const servers: Server[] = [];

beforeEach(() => {
  setLogSink(() => undefined);
});

afterEach(async () => {
  resetLogSink();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    )
  );
});

describe("createReviewHttpServer", () => {
  it("serves a health endpoint", async () => {
    const { baseUrl } = await listen(createReviewHttpServer({ webhookSecret }));

    const response = await fetch(`${baseUrl}/healthz`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("rejects invalid webhook signatures before recognizing events", async () => {
    const recognized: RecognizedWebhookDelivery[] = [];
    const { baseUrl } = await listen(
      createReviewHttpServer({
        webhookSecret,
        onRecognizedWebhook(delivery) {
          recognized.push(delivery);
        }
      })
    );

    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: {
        "X-GitHub-Delivery": "delivery-1",
        "X-GitHub-Event": "pull_request",
        "X-Hub-Signature-256": "sha256=bad"
      },
      body: JSON.stringify({ action: "opened", repository: { full_name: "kei781/sql-agent" } })
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "rejected", reason: "invalid-signature" });
    assert.deepEqual(recognized, []);
  });

  it("acknowledges supported pull_request events after signature and repo allowlist checks", async () => {
    const recognized: RecognizedWebhookDelivery[] = [];
    const { baseUrl } = await listen(
      createReviewHttpServer({
        webhookSecret,
        repoAllowlist: ["kei781/sql-agent"],
        onRecognizedWebhook(delivery) {
          recognized.push(delivery);
        }
      })
    );
    const body = JSON.stringify({ action: "opened", repository: { full_name: "kei781/sql-agent" } });

    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders("pull_request", "delivery-2", body),
      body
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      status: "accepted",
      eventName: "pull_request",
      action: "opened",
      deliveryId: "delivery-2",
      repositoryFullName: "kei781/sql-agent"
    });
    assert.deepEqual(recognized, [
      {
        deliveryId: "delivery-2",
        eventName: "pull_request",
        action: "opened",
        repositoryFullName: "kei781/sql-agent"
      }
    ]);
  });

  it("skips unsupported events and repositories without side effects", async () => {
    const recognized: RecognizedWebhookDelivery[] = [];
    const { baseUrl } = await listen(
      createReviewHttpServer({
        webhookSecret,
        repoAllowlist: ["kei781/sql-agent"],
        onRecognizedWebhook(delivery) {
          recognized.push(delivery);
        }
      })
    );
    const unsupportedEventBody = JSON.stringify({ action: "deleted", repository: { full_name: "kei781/sql-agent" } });
    const disallowedRepoBody = JSON.stringify({ action: "opened", repository: { full_name: "other/repo" } });

    const unsupportedEventResponse = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders("pull_request", "delivery-3", unsupportedEventBody),
      body: unsupportedEventBody
    });
    const disallowedRepoResponse = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders("pull_request", "delivery-4", disallowedRepoBody),
      body: disallowedRepoBody
    });

    assert.equal(unsupportedEventResponse.status, 202);
    assert.deepEqual(await unsupportedEventResponse.json(), {
      status: "skipped",
      reason: "unsupported-action",
      eventName: "pull_request",
      action: "deleted",
      deliveryId: "delivery-3",
      repositoryFullName: "kei781/sql-agent"
    });
    assert.equal(disallowedRepoResponse.status, 202);
    assert.deepEqual(await disallowedRepoResponse.json(), {
      status: "skipped",
      reason: "repo-not-allowed",
      eventName: "pull_request",
      action: "opened",
      deliveryId: "delivery-4",
      repositoryFullName: "other/repo"
    });
    assert.deepEqual(recognized, []);
  });

  it("rejects oversized webhook bodies", async () => {
    const { baseUrl } = await listen(createReviewHttpServer({ webhookSecret, maxBodyBytes: 10 }));
    const body = JSON.stringify({ action: "opened", repository: { full_name: "kei781/sql-agent" } });

    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders("pull_request", "delivery-5", body),
      body
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { status: "rejected", reason: "body-too-large" });
  });

  it("rejects malformed JSON after a valid signature", async () => {
    const { baseUrl } = await listen(createReviewHttpServer({ webhookSecret }));
    const body = "{";

    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders("pull_request", "delivery-6", body),
      body
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "rejected", reason: "invalid-json" });
  });
});

async function listen(server: Server): Promise<{ readonly baseUrl: string }> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  assert.ok(address !== null && typeof address === "object");

  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

function signedHeaders(eventName: string, deliveryId: string, body: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-GitHub-Delivery": deliveryId,
    "X-GitHub-Event": eventName,
    "X-Hub-Signature-256": `sha256=${createHmac("sha256", webhookSecret).update(body).digest("hex")}`
  };
}
