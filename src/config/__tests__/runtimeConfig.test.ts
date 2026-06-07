import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadConfigFromEnv, requiredConfigKeys } from "../../index.js";

describe("review server runtime env config", () => {
  const completeEnv = {
    REVIEW_SERVER_HOST: "127.0.0.1",
    REVIEW_SERVER_PORT: "3000",
    REVIEW_SERVER_DATABASE_PATH: ".data/review-server.sqlite",
    REVIEW_SERVER_WORKSPACE_ROOT: ".workspaces",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY_PATH: "/run/secrets/github-app.private-key.pem",
    GITHUB_WEBHOOK_SECRET: "replace-with-random-webhook-secret",
    GITHUB_OWNER: "kei781",
    GITHUB_REPO: "sql-agent",
    REVIEWER_PROVIDER: "anthropic",
    REVIEWER_MODEL: "replace-with-frontier-reviewer-model",
    REVIEWER_MODEL_FAMILY: "claude",
    REVIEWER_ADAPTER: "claude-code",
    REVIEWER_API_KEY: "replace-with-reviewer-api-key",
    FIXER_PROVIDER: "openai",
    FIXER_MODEL: "replace-with-frontier-fixer-model",
    FIXER_MODEL_FAMILY: "codex",
    FIXER_ADAPTER: "codex",
    FIXER_API_KEY: "replace-with-fixer-api-key",
    MODEL_EGRESS_ALLOWLIST: "api.anthropic.com,api.openai.com",
    MAX_FIX_ATTEMPTS: "3",
    AUTOFIX_LABEL: "ai-autofix",
    AUTOMERGE_LABEL: "ai-automerge",
    HUMAN_REVIEW_LABEL: "needs-human-review",
    SECURITY_SENSITIVE_LABEL: "security-sensitive",
    DO_NOT_MERGE_LABEL: "do-not-merge",
    TRUSTED_REVIEWERS: "claude[bot],claude-code[bot]",
    TRUSTED_FIXERS: "codex[bot],github-actions[bot]",
    TRUSTED_AUTHORS: "kei781,codex[bot]",
    LOW_RISK_PATH_ALLOWLIST: "docs/**,src/domain/**",
    RISKY_PATH_PATTERNS: ".github/workflows/**,secrets/**,*.pem,.env,.env.*"
  };

  it("documents every required runtime key in .env.example", () => {
    const example = readFileSync(".env.example", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8");

    for (const key of requiredConfigKeys) {
      assert.match(example, new RegExp(`^${key}=`, "mu"));
    }

    assert.match(gitignore, /^!.env.example$/mu);
    assert.doesNotMatch(example, /ghp_[A-Za-z0-9_]+/u);
    assert.doesNotMatch(example, /sk-[A-Za-z0-9_]+/u);
  });

  it("rejects missing config instead of falling back to hard-coded runtime values", () => {
    const result = loadConfigFromEnv({});

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.ok(result.missingKeys.includes("GITHUB_WEBHOOK_SECRET"));
      assert.ok(result.missingKeys.includes("REVIEWER_MODEL"));
      assert.ok(result.missingKeys.includes("FIXER_MODEL"));
      assert.deepEqual(result.invalidValues, []);
    }
  });

  it("loads typed runtime config from the supplied environment source", () => {
    const result = loadConfigFromEnv(completeEnv);

    assert.equal(result.ok, true);

    if (result.ok) {
      assert.deepEqual(result.config.server, {
        host: "127.0.0.1",
        port: 3000,
        databasePath: ".data/review-server.sqlite",
        workspaceRoot: ".workspaces"
      });
      assert.deepEqual(result.config.github, {
        appId: "123456",
        privateKeyPath: "/run/secrets/github-app.private-key.pem",
        webhookSecret: "replace-with-random-webhook-secret",
        owner: "kei781",
        repo: "sql-agent"
      });
      assert.equal(result.config.reviewer.model, "replace-with-frontier-reviewer-model");
      assert.equal(result.config.fixer.model, "replace-with-frontier-fixer-model");
      assert.deepEqual(result.config.modelEgressAllowlist, ["api.anthropic.com", "api.openai.com"]);
      assert.equal(result.config.policy.maxFixAttempts, 3);
      assert.deepEqual(result.config.policy.lowRiskPathAllowlist, ["docs/**", "src/domain/**"]);
    }
  });

  it("keeps process.env reads isolated to the central config module", () => {
    const envReaders = listTypeScriptFiles("src")
      .filter((path) => !path.includes(`${separator()}__tests__${separator()}`))
      .filter((path) => readFileSync(path, "utf8").includes("process.env"));
    const indexSource = readFileSync("src/index.ts", "utf8");

    assert.deepEqual(envReaders, [join("src", "config", "config.ts")]);
    assert.match(indexSource, /from "\.\/config\/config\.js"/u);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return listTypeScriptFiles(path);
    }

    return path.endsWith(".ts") ? [path] : [];
  });
}

function separator(): string {
  return /\\/u.test(join("a", "b")) ? "\\" : "/";
}
