import { createSign } from "node:crypto";

export interface GitHubRepositoryInstallationInput {
  readonly appJwt: string;
  readonly repositoryFullName: string;
}

export interface GitHubCreateInstallationTokenInput {
  readonly appJwt: string;
  readonly installationId: number;
}

export interface GitHubInstallationTokenResponse {
  readonly token: string;
  readonly expiresAt: string;
}

export interface GitHubAppInstallationTokenClient {
  getRepositoryInstallationId(input: GitHubRepositoryInstallationInput): Promise<number>;
  createInstallationAccessToken(input: GitHubCreateInstallationTokenInput): Promise<GitHubInstallationTokenResponse>;
}

export interface GitHubInstallationTokenProvider {
  getInstallationToken(repositoryFullName: string): Promise<string>;
}

export interface GitHubAppInstallationTokenProviderOptions {
  readonly appId: string;
  readonly privateKeyPem: string;
  readonly client: GitHubAppInstallationTokenClient;
  readonly now?: () => Date;
}

interface CachedInstallationToken {
  readonly token: string;
  readonly expiresAtMs: number;
}

const jwtBackdateSeconds = 60;
const jwtLifetimeSeconds = 540;
const tokenRefreshSkewMs = 60_000;

export function createGitHubAppInstallationTokenProvider(
  options: GitHubAppInstallationTokenProviderOptions
): GitHubInstallationTokenProvider {
  const now = options.now ?? (() => new Date());
  const cache = new Map<string, CachedInstallationToken>();

  return {
    async getInstallationToken(repositoryFullName) {
      const cached = cache.get(repositoryFullName);
      const currentTimeMs = now().getTime();

      if (cached !== undefined && cached.expiresAtMs - currentTimeMs > tokenRefreshSkewMs) {
        return cached.token;
      }

      const appJwt = createGitHubAppJwt({
        appId: options.appId,
        privateKeyPem: options.privateKeyPem,
        now: now()
      });
      const installationId = await options.client.getRepositoryInstallationId({ appJwt, repositoryFullName });
      const token = await options.client.createInstallationAccessToken({ appJwt, installationId });
      const expiresAtMs = Date.parse(token.expiresAt);

      if (!Number.isFinite(expiresAtMs)) {
        throw new Error("GitHub installation token response has an invalid expiresAt value");
      }

      cache.set(repositoryFullName, { token: token.token, expiresAtMs });
      return token.token;
    }
  };
}

export function createGitHubAppJwt(input: {
  readonly appId: string;
  readonly privateKeyPem: string;
  readonly now: Date;
}): string {
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iat: nowSeconds - jwtBackdateSeconds,
    exp: nowSeconds + jwtLifetimeSeconds,
    iss: input.appId
  });
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(input.privateKeyPem).toString("base64url");

  return `${signingInput}.${signature}`;
}

function encodeJson(value: Readonly<Record<string, string | number>>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
