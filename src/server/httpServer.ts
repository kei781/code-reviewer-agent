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
  readonly onRecognizedWebhook?: (input: RecognizedWebhookHandlerInput) => void | Promise<void>;
}

export interface RecognizedWebhookHandlerInput {
  readonly delivery: RecognizedWebhookDelivery;
  readonly payload: Record<string, unknown>;
}

const defaultMaxBodyBytes = 1024 * 1024;

const webhookSetupGuideText = `[/request_reviewer/webhook 세팅 가이드]

리뷰 요청을 받는 GitHub 웹훅 엔드포인트입니다. POST 로 호출합니다.

GitHub App(또는 저장소 Settings > Webhooks)에 아래 값을 등록하세요.

1. Payload URL
   https://<이 서버의 공개 주소>/request_reviewer/webhook
   (로컬 예시: http://127.0.0.1:3001/request_reviewer/webhook)

2. Content type
   application/json

3. Secret
   이 서버 .env 의 GITHUB_WEBHOOK_SECRET 값과 동일한 문자열
   - 서버는 X-Hub-Signature-256 헤더(sha256=HMAC_SHA256(secret, 요청 본문))로 서명을 검증하며,
     서명이 다르면 401 invalid-signature 로 거절합니다.

4. 구독 이벤트 (Subscribe to events)
   - Pull requests: opened / synchronize / reopened / ready_for_review 액션에서 리뷰 시작
   - Issue comments: PR 코멘트에서 리뷰어 멘션 시 후속 응답(follow-up) 처리

5. 요청 헤더 (GitHub이 자동으로 채움 / curl 등으로 직접 호출할 때는 직접 세팅)
   Content-Type: application/json
   X-GitHub-Event: pull_request 또는 issue_comment
   X-GitHub-Delivery: <고유 delivery id>
   X-Hub-Signature-256: sha256=<요청 본문의 HMAC-SHA256 서명>

6. 서버 쪽 .env 필수 값
   REVIEW_SERVER_HOST / REVIEW_SERVER_PORT  : 서버 바인드 주소
   GITHUB_APP_ID                            : GitHub App ID
   GITHUB_APP_PRIVATE_KEY_PATH              : GitHub App private key(.pem) 절대경로
   GITHUB_WEBHOOK_SECRET                    : 위 3번 Secret 과 동일한 값
   (선택) REVIEW_REPO_ALLOWLIST=owner/repo,owner/repo2
          - 설정하면 나열한 저장소의 웹훅만 처리하고 나머지는 skip 합니다.
          - 비워두면 GitHub App 이 설치된 모든 저장소를 처리합니다.

응답 코드
   202 accepted  : 리뷰 파이프라인에 접수됨
   202 skipped   : 서명은 유효하나 대상 아님(미지원 이벤트/액션, allowlist 밖 저장소)
   400 / 401 / 413 : 잘못된 JSON / 서명 불일치 / 본문 1MB 초과
`;

const rootGuideText = `code-reviewer-agent — AI PR 리뷰 서버

리뷰요청:
  /request_reviewer/*

예시: 리뷰요청을 웹훅으로
  POST /request_reviewer/webhook
  (세팅 가이드: GET /request_reviewer/webhook — 아래에도 동일 내용 포함)

기타 엔드포인트:
  GET /healthz : 헬스체크
  POST /webhooks/github : /request_reviewer/webhook 과 동일(구버전 호환 경로)

${webhookSetupGuideText}`;

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

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/request_reviewer" || url.pathname === "/request_reviewer/")) {
    sendText(response, 200, rootGuideText);
    return;
  }

  const isWebhookPath = url.pathname === "/request_reviewer/webhook" || url.pathname === "/webhooks/github";

  if (request.method === "GET" && isWebhookPath) {
    sendText(response, 200, webhookSetupGuideText);
    return;
  }

  if (request.method === "POST" && isWebhookPath) {
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
    response.shouldKeepAlive = false;
    sendJson(response, 413, { status: "rejected", reason: "body-too-large" }, () => {
      request.destroy();
    });
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

  dispatchRecognizedWebhook(options, { delivery: recognition.delivery, payload });
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

function dispatchRecognizedWebhook(options: ReviewHttpServerOptions, input: RecognizedWebhookHandlerInput): void {
  if (options.onRecognizedWebhook === undefined) {
    return;
  }

  setImmediate(() => {
    void Promise.resolve()
      .then(() => options.onRecognizedWebhook?.(input))
      .catch((error: unknown) => {
        log("github webhook dispatch failed", {
          level: "error",
          metadata: {
            deliveryId: input.delivery.deliveryId,
            eventName: input.delivery.eventName,
            action: input.delivery.action,
            repositoryFullName: input.delivery.repositoryFullName,
            message: error instanceof Error ? error.message : "unknown error"
          }
        });
      });
  });
}

type RawBodyResult =
  | { readonly status: "ok"; readonly rawBody: Buffer }
  | { readonly status: "too-large" };

function readRawBody(request: IncomingMessage, maxBodyBytes: number): Promise<RawBodyResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let isSettled = false;

    const settle = (result: RawBodyResult): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      request.off("data", onData);
      request.off("end", onEnd);
      resolve(result);
    };

    const fail = (error: Error): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      reject(error);
    };

    const onData = (chunk: Buffer | string): void => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      receivedBytes += buffer.length;

      if (receivedBytes > maxBodyBytes) {
        request.pause();
        settle({ status: "too-large" });
        return;
      }

      chunks.push(buffer);
    };

    const onEnd = (): void => {
      settle({ status: "ok", rawBody: Buffer.concat(chunks) });
    };

    const onError = (error: Error): void => {
      fail(error);
    };

    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
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

function sendText(response: ServerResponse, statusCode: number, body: string): void {
  if (response.headersSent) {
    return;
  }

  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Readonly<Record<string, unknown>>,
  onFinished?: () => void
): void {
  if (response.headersSent) {
    onFinished?.();
    return;
  }

  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body), onFinished);
}
