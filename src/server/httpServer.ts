import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  readPayloadAction,
  readRepositoryFullName,
  recognizeGitHubWebhookDelivery,
  type RecognizedWebhookDelivery
} from "../adapters/github/webhookRecognition.js";
import { verifyGitHubWebhookSignature } from "../adapters/github/webhookSignature.js";
import { log } from "../shared/log.js";

export type { RecognizedWebhookDelivery } from "../adapters/github/webhookRecognition.js";

export interface ReviewHttpServerOptions {
  readonly webhookSecret: string;
  readonly maxBodyBytes?: number;
  readonly repoAllowlist?: readonly string[];
  readonly onRecognizedWebhook?: (delivery: RecognizedWebhookDelivery) => void | Promise<void>;
}

const defaultMaxBodyBytes = 1024 * 1024;

export function createReviewHttpServer(options: ReviewHttpServerOptions): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, options).catch((error: unknown) => {
      log("review server request failed", {
        level: "error",
        metadata: { message: error instanceof Error ? error.message : "unknown error" }
      });
      sendJson(response, 500, { status: "error", reason: "internal-server-error" });
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ReviewHttpServerOptions
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/healthz") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/webhooks/github") {
    await handleGitHubWebhook(request, response, options);
    return;
  }

  sendJson(response, 404, { status: "rejected", reason: "not-found" });
}

async function handleGitHubWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  options: ReviewHttpServerOptions
): Promise<void> {
  const maxBodyBytes = options.maxBodyBytes ?? defaultMaxBodyBytes;
  const rawBodyResult = await readRawBody(request, maxBodyBytes);

  if (rawBodyResult.status === "too-large") {
    sendJson(response, 413, { status: "rejected", reason: "body-too-large" });
    return;
  }

  const rawBody = rawBodyResult.rawBody;
  const signatureHeader = request.headers["x-hub-signature-256"];

  if (!verifyGitHubWebhookSignature({ rawBody, secret: options.webhookSecret, signatureHeader })) {
    sendJson(response, 401, { status: "rejected", reason: "invalid-signature" });
    return;
  }

  const payload = parseJsonObject(rawBody);

  if (payload === undefined) {
    sendJson(response, 400, { status: "rejected", reason: "invalid-json" });
    return;
  }

  const eventName = readSingleHeader(request.headers, "x-github-event");
  const deliveryId = readSingleHeader(request.headers, "x-github-delivery") ?? "unknown-delivery";
  const recognition = recognizeGitHubWebhookDelivery({
    deliveryId,
    eventName,
    payload,
    repoAllowlist: options.repoAllowlist ?? []
  });

  if (recognition.status === "skipped") {
    log("github webhook skipped", {
      level: "info",
      metadata: {
        reason: recognition.reason,
        deliveryId,
        eventName: eventName ?? "missing",
        action: readPayloadAction(payload) ?? "missing",
        repositoryFullName: readRepositoryFullName(payload) ?? "missing"
      }
    });
    sendJson(response, 202, recognition.body);
    return;
  }

  await options.onRecognizedWebhook?.(recognition.delivery);
  log("github webhook accepted", {
    level: "info",
    metadata: {
      deliveryId: recognition.delivery.deliveryId,
      eventName: recognition.delivery.eventName,
      action: recognition.delivery.action,
      repositoryFullName: recognition.delivery.repositoryFullName
    }
  });
  sendJson(response, 202, { status: "accepted", ...recognition.delivery });
}

type RawBodyResult =
  | { readonly status: "ok"; readonly rawBody: Buffer }
  | { readonly status: "too-large" };

function readRawBody(request: IncomingMessage, maxBodyBytes: number): Promise<RawBodyResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let isTooLarge = false;

    request.on("data", (chunk: Buffer | string) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      receivedBytes += buffer.length;

      if (receivedBytes > maxBodyBytes) {
        isTooLarge = true;
        return;
      }

      chunks.push(buffer);
    });
    request.on("end", () => {
      if (isTooLarge) {
        resolve({ status: "too-large" });
        return;
      }

      resolve({ status: "ok", rawBody: Buffer.concat(chunks) });
    });
    request.on("error", reject);
  });
}

function parseJsonObject(rawBody: Buffer): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;

    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function readSingleHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function sendJson(response: ServerResponse, statusCode: number, body: Readonly<Record<string, unknown>>): void {
  if (response.headersSent) {
    return;
  }

  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
