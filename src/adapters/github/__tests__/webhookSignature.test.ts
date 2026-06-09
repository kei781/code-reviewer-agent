import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { verifyGitHubWebhookSignature } from "../webhookSignature.js";

const secret = "test-webhook-secret";
const rawBody = Buffer.from(JSON.stringify({ action: "opened" }));

function signatureFor(body: Buffer, signingSecret = secret): string {
  return `sha256=${createHmac("sha256", signingSecret).update(body).digest("hex")}`;
}

describe("verifyGitHubWebhookSignature", () => {
  it("accepts a valid sha256 signature for the raw body", () => {
    assert.equal(
      verifyGitHubWebhookSignature({
        rawBody,
        secret,
        signatureHeader: signatureFor(rawBody)
      }),
      true
    );
  });

  it("rejects missing, malformed, and mismatched signatures", () => {
    assert.equal(verifyGitHubWebhookSignature({ rawBody, secret, signatureHeader: undefined }), false);
    assert.equal(verifyGitHubWebhookSignature({ rawBody, secret, signatureHeader: "sha1=abc" }), false);
    assert.equal(verifyGitHubWebhookSignature({ rawBody, secret, signatureHeader: "sha256=not-hex" }), false);
    assert.equal(
      verifyGitHubWebhookSignature({
        rawBody,
        secret,
        signatureHeader: signatureFor(Buffer.from("{}"))
      }),
      false
    );
  });
});
