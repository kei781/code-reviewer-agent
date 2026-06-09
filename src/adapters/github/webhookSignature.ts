import { createHmac, timingSafeEqual } from "node:crypto";

export interface GitHubWebhookSignatureInput {
  readonly rawBody: Buffer;
  readonly secret: string;
  readonly signatureHeader: string | readonly string[] | undefined;
}

const signaturePrefix = "sha256=";
const sha256HexLength = 64;

export function verifyGitHubWebhookSignature(input: GitHubWebhookSignatureInput): boolean {
  const signatureHeader = normalizeSignatureHeader(input.signatureHeader);

  if (input.secret.trim().length === 0 || signatureHeader === undefined) {
    return false;
  }

  if (!signatureHeader.startsWith(signaturePrefix)) {
    return false;
  }

  const providedHex = signatureHeader.slice(signaturePrefix.length);

  if (!/^[a-f0-9]+$/iu.test(providedHex) || providedHex.length !== sha256HexLength) {
    return false;
  }

  const expectedHex = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const providedDigest = Buffer.from(providedHex, "hex");
  const expectedDigest = Buffer.from(expectedHex, "hex");

  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }

  return timingSafeEqual(providedDigest, expectedDigest);
}

function normalizeSignatureHeader(header: string | readonly string[] | undefined): string | undefined {
  if (typeof header === "string") {
    return header;
  }

  return header?.[0];
}
