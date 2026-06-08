import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadConfigFromEnv, requiredConfigKeys } from "../../index.js";

describe("shared runtime config", () => {
  const completeEnv = {
    REVIEW_SERVER_HOST: "127.0.0.1",
    REVIEW_SERVER_PORT: "3000",
    REVIEW_SERVER_DATABASE_PATH: ".data/review-server.sqlite",
    REVIEW_SERVER_WORKSPACE_ROOT: ".workspaces",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY_PATH: "/run/secrets/github-app.private-key.pem",
    GITHUB_WEBHOOK_SECRET: "replace-with-random-webhook-secret",
    CLAUDE_CODE_COMMAND: "claude",
    CLAUDE_CODE_AUTH_MODE: "local-oauth",
    MODEL_EGRESS_ALLOWLIST: "api.anthropic.com,api.openai.com",
    HUMAN_REVIEW_LABEL: "needs-human-review",
    SECURITY_SENSITIVE_LABEL: "security-sensitive",
    DO_NOT_MERGE_LABEL: "do-not-merge",
    TRUSTED_REVIEWERS: "claude[bot],claude-code[bot]",
    RISKY_PATH_PATTERNS: ".github/workflows/**,secrets/**,*.pem,.env,.env.*"
  };

  it("documents every required runtime key in .env.example", () => {
    const example = readFileSync(".env.example", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8");

    for (const key of requiredConfigKeys) {
      assert.match(example, new RegExp(`^${key}=`, "mu"));
    }

    assert.deepEqual(
      requiredConfigKeys.filter((key) =>
        /API_KEY|FIXER|AUTOFIX|AUTOMERGE|MAX_FIX_ATTEMPTS|TRUSTED_FIXERS|CODEX_COMMAND|CODEX_AUTH_MODE/u.test(key)
      ),
      []
    );
    assert.match(gitignore, /^\.env$/mu);
    assert.match(gitignore, /^\.env\.\*$/mu);
    assert.match(gitignore, /^!\.env\.example$/mu);
    assert.equal(isGitIgnored(".env"), true);
    assert.equal(isGitIgnored(".env.local"), true);
    assert.equal(isGitIgnored(".env.example"), false);
    assert.doesNotMatch(example, /API_KEY/u);
    assert.doesNotMatch(example, /CODEX_COMMAND|CODEX_AUTH_MODE/u);
    assert.match(example, /Local OAuth-authenticated Claude Code orchestrator/u);
    assert.doesNotMatch(example, /ghp_[A-Za-z0-9_]+/u);
    assert.doesNotMatch(example, /sk-[A-Za-z0-9_]+/u);
  });

  it("rejects missing config instead of falling back to hard-coded runtime values", () => {
    const result = loadConfigFromEnv({});

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.ok(result.missingKeys.includes("GITHUB_WEBHOOK_SECRET"));
      assert.ok(result.missingKeys.includes("CLAUDE_CODE_COMMAND"));
      assert.equal(result.missingKeys.some((key) => key.startsWith("CODEX_")), false);
      assert.equal(result.missingKeys.some((key) => key.includes("API_KEY")), false);
      assert.equal(result.missingKeys.some((key) => key.startsWith("FIXER_")), false);
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
        webhookSecret: "replace-with-random-webhook-secret"
      });
      assert.deepEqual(result.config.orchestrator, {
        command: "claude",
        authMode: "local-oauth"
      });
      assert.deepEqual(result.config.modelEgressAllowlist, ["api.anthropic.com", "api.openai.com"]);
      assert.deepEqual(result.config.policy.trustedReviewers, ["claude[bot]", "claude-code[bot]"]);
      assert.deepEqual(result.config.repoAllowlist, []);
    }
  });

  it("is repo-agnostic by default and parses an optional repo allowlist when set", () => {
    const agnostic = loadConfigFromEnv(completeEnv);
    assert.equal(agnostic.ok, true);
    if (agnostic.ok) {
      assert.deepEqual(agnostic.config.repoAllowlist, []);
    }

    const scoped = loadConfigFromEnv({
      ...completeEnv,
      REVIEW_REPO_ALLOWLIST: "kei781/sql-agent, kei781/code-reviewer-agent"
    });
    assert.equal(scoped.ok, true);
    if (scoped.ok) {
      assert.deepEqual(scoped.config.repoAllowlist, ["kei781/sql-agent", "kei781/code-reviewer-agent"]);
    }
  });

  it("rejects an egress allowlist that contains no hosts", () => {
    const result = loadConfigFromEnv({
      ...completeEnv,
      MODEL_EGRESS_ALLOWLIST: ",,"
    });

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.deepEqual(result.missingKeys, []);
      assert.deepEqual(result.invalidValues, [
        {
          key: "MODEL_EGRESS_ALLOWLIST",
          reason: "must list at least one allowed egress host"
        }
      ]);
    }
  });

  it("keeps process.env reads isolated to the central config module", () => {
    const envReaders = listTypeScriptFiles("src")
      .filter((path) => !path.includes(`${separator()}__tests__${separator()}`))
      .filter((path) => readFileSync(path, "utf8").includes("process.env"));
    const indexSource = readFileSync("src/index.ts", "utf8");

    assert.deepEqual(envReaders, [join("src", "shared", "config.ts")]);
    assert.match(indexSource, /from "\.\/shared\/config\.js"/u);
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

function isGitIgnored(path: string): boolean {
  const result = spawnSync("git", ["check-ignore", "--quiet", path], { stdio: "ignore" });

  if (result.status === 0) {
    return true;
  }

  if (result.status === 1) {
    return false;
  }

  const errorMessage = result.error === undefined ? `exit code ${result.status ?? "unknown"}` : result.error.message;
  throw new Error(`git check-ignore failed for ${path}: ${errorMessage}`);
}
