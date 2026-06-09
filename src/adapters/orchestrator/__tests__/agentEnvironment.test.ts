import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentEnvironment, isSecretEnvironmentKey } from "../agentEnvironment.js";

describe("buildAgentEnvironment", () => {
  it("keeps local tool auth environment but removes server-side secrets", () => {
    const env = buildAgentEnvironment(
      {
        PATH: "path-value",
        HOME: "/home/reviewer",
        APPDATA: "appdata-value",
        GITHUB_TOKEN: "github-token",
        GITHUB_APP_PRIVATE_KEY_PATH: "/secret/app.pem",
        GITHUB_WEBHOOK_SECRET: "webhook-secret",
        REVIEW_SERVER_DATABASE_PATH: "/server/state.sqlite",
        CLAUDE_CODE_COMMAND: "claude",
        MODEL_EGRESS_ALLOWLIST: "api.anthropic.com"
      },
      {
        MODEL_EGRESS_POLICY_ID: "policy-1"
      }
    );

    assert.deepEqual(env, {
      PATH: "path-value",
      HOME: "/home/reviewer",
      APPDATA: "appdata-value",
      MODEL_EGRESS_POLICY_ID: "policy-1"
    });
  });

  it("detects secret-like environment keys conservatively", () => {
    assert.equal(isSecretEnvironmentKey("GITHUB_TOKEN"), true);
    assert.equal(isSecretEnvironmentKey("GITHUB_APP_PRIVATE_KEY_PATH"), true);
    assert.equal(isSecretEnvironmentKey("GITHUB_WEBHOOK_SECRET"), true);
    assert.equal(isSecretEnvironmentKey("PATH"), false);
  });
});
