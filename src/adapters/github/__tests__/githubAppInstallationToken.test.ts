import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import {
  createGitHubAppInstallationTokenProvider,
  type GitHubAppInstallationTokenClient
} from "../githubAppInstallationToken.js";

function createPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function decodeJwtSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("createGitHubAppInstallationTokenProvider", () => {
  it("signs a GitHub App JWT and exchanges it for a repository installation token", async () => {
    const calls: unknown[] = [];
    const privateKeyPem = createPrivateKeyPem();
    const client: GitHubAppInstallationTokenClient = {
      async getRepositoryInstallationId(input) {
        calls.push({ method: "getRepositoryInstallationId", ...input });
        return 123456;
      },
      async createInstallationAccessToken(input) {
        calls.push({ method: "createInstallationAccessToken", ...input });
        return {
          token: "installation-token",
          expiresAt: "2026-06-09T12:10:00.000Z"
        };
      }
    };

    const provider = createGitHubAppInstallationTokenProvider({
      appId: "98765",
      privateKeyPem,
      client,
      now: () => new Date("2026-06-09T12:00:00.000Z")
    });

    const token = await provider.getInstallationToken("kei781/sql-agent");

    assert.equal(token, "installation-token");
    assert.equal(calls.length, 2);
    assert.deepEqual((calls[0] as { repositoryFullName: string }).repositoryFullName, "kei781/sql-agent");
    assert.deepEqual((calls[1] as { installationId: number }).installationId, 123456);

    const jwt = (calls[0] as { appJwt: string }).appJwt;
    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
    assert.equal(typeof encodedSignature, "string");
    assert.deepEqual(decodeJwtSegment(String(encodedHeader)), { alg: "RS256", typ: "JWT" });
    assert.deepEqual(decodeJwtSegment(String(encodedPayload)), {
      iat: 1781006340,
      exp: 1781006940,
      iss: "98765"
    });
    assert.doesNotMatch(JSON.stringify(calls), /BEGIN PRIVATE KEY/u);
  });

  it("reuses a still-valid installation token for the same repository", async () => {
    let exchangeCount = 0;
    const provider = createGitHubAppInstallationTokenProvider({
      appId: "98765",
      privateKeyPem: createPrivateKeyPem(),
      client: {
        async getRepositoryInstallationId() {
          return 123456;
        },
        async createInstallationAccessToken() {
          exchangeCount += 1;
          return {
            token: `installation-token-${exchangeCount}`,
            expiresAt: "2026-06-09T12:10:00.000Z"
          };
        }
      },
      now: () => new Date("2026-06-09T12:00:00.000Z")
    });

    assert.equal(await provider.getInstallationToken("kei781/sql-agent"), "installation-token-1");
    assert.equal(await provider.getInstallationToken("kei781/sql-agent"), "installation-token-1");
    assert.equal(exchangeCount, 1);
  });
});
