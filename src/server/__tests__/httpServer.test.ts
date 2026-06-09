import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { createConnection, type Socket } from "node:net";
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
        onRecognizedWebhook(input) {
          recognized.push(input.delivery);
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
        onRecognizedWebhook(input) {
          recognized.push(input.delivery);
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

  it("passes the parsed payload with recognized webhook metadata", async () => {
    const recognized: Array<{
      readonly delivery: RecognizedWebhookDelivery;
      readonly payload: Record<string, unknown>;
    }> = [];
    const { baseUrl } = await listen(
      createReviewHttpServer({
        webhookSecret,
        repoAllowlist: ["kei781/sql-agent"],
        onRecognizedWebhook(input) {
          recognized.push(input);
        }
      })
    );
    const payload = {
      action: "opened",
      repository: { full_name: "kei781/sql-agent" },
      pull_request: { number: 42 }
    };
    const body = JSON.stringify(payload);

    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders("pull_request", "delivery-with-payload", body),
      body
    });

    assert.equal(response.status, 202);
    await waitFor(() => recognized.length === 1);
    assert.deepEqual(recognized, [
      {
        delivery: {
          deliveryId: "delivery-with-payload",
          eventName: "pull_request",
          action: "opened",
          repositoryFullName: "kei781/sql-agent"
        },
        payload
      }
    ]);
  });

  it("acknowledges accepted webhooks without waiting for asynchronous dispatch completion", async () => {
    const { baseUrl } = await listen(
      createReviewHttpServer({
        webhookSecret,
        repoAllowlist: ["kei781/sql-agent"],
        async onRecognizedWebhook() {
          await new Promise(() => undefined);
        }
      })
    );
    const body = JSON.stringify({ action: "opened", repository: { full_name: "kei781/sql-agent" } });

    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: signedHeaders("pull_request", "delivery-async-dispatch", body),
      body,
      signal: AbortSignal.timeout(500)
    });

    assert.equal(response.status, 202);
  });

  it("skips unsupported events and repositories without side effects", async () => {
    const recognized: RecognizedWebhookDelivery[] = [];
    const { baseUrl } = await listen(
      createReviewHttpServer({
        webhookSecret,
        repoAllowlist: ["kei781/sql-agent"],
        onRecognizedWebhook(input) {
          recognized.push(input.delivery);
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

  it("stops reading an oversized webhook stream as soon as the limit is crossed", async () => {
    const { port } = await listen(createReviewHttpServer({ webhookSecret, maxBodyBytes: 10 }));
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.on("error", () => undefined);

    try {
      await once(socket, "connect");
      socket.write(
        [
          "POST /webhooks/github HTTP/1.1",
          "Host: 127.0.0.1",
          "Content-Type: application/json",
          "Content-Length: 1000000",
          "X-GitHub-Delivery: delivery-oversized-stream",
          "X-GitHub-Event: pull_request",
          `X-Hub-Signature-256: sha256=${"0".repeat(64)}`,
          "",
          "12345678901"
        ].join("\r\n")
      );

      const responseText = await waitForSocketText(socket, (text) => text.includes("\r\n\r\n"));

      assert.match(responseText, /^HTTP\/1\.1 413 /u);
      assert.match(responseText, /\r\nConnection: close\r\n/iu);
      await waitForSocketClose(socket);
    } finally {
      socket.destroy();
    }
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

async function listen(server: Server): Promise<{ readonly baseUrl: string; readonly port: number }> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  assert.ok(address !== null && typeof address === "object");

  return { baseUrl: `http://127.0.0.1:${address.port}`, port: address.port };
}

function signedHeaders(eventName: string, deliveryId: string, body: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-GitHub-Delivery": deliveryId,
    "X-GitHub-Event": eventName,
    "X-Hub-Signature-256": `sha256=${createHmac("sha256", webhookSecret).update(body).digest("hex")}`
  };
}

function waitForSocketText(
  socket: Socket,
  predicate: (text: string) => boolean,
  timeoutMs = 500
): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for socket response. Received: ${JSON.stringify(text)}`));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("close", onClose);
    };

    const onData = (chunk: Buffer): void => {
      text += chunk.toString("utf8");

      if (predicate(text)) {
        cleanup();
        resolve(text);
      }
    };

    const onClose = (): void => {
      cleanup();

      if (predicate(text)) {
        resolve(text);
        return;
      }

      reject(new Error(`Socket closed before expected response. Received: ${JSON.stringify(text)}`));
    };

    socket.on("data", onData);
    socket.on("close", onClose);
  });
}

function waitForSocketClose(socket: Socket, timeoutMs = 500): Promise<void> {
  if (socket.destroyed) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for socket close"));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("close", onClose);
    };

    const onClose = (): void => {
      cleanup();
      resolve();
    };

    socket.on("close", onClose);
  });
}

function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("Timed out waiting for predicate"));
        return;
      }

      setTimeout(poll, 5);
    };

    poll();
  });
}
