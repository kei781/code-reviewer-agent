import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNodeCommandRunner } from "../commandRunner.js";

const envExpression = 'globalThis["process"].env';

function envProbeScript(keys: readonly string[]): string {
  return [
    `const env = ${envExpression};`,
    `const keys = ${JSON.stringify(keys)};`,
    "const result = Object.fromEntries(keys.map((key) => [key, env[key] ?? null]));",
    "globalThis.process.stdout.write(JSON.stringify(result));"
  ].join("\n");
}

describe("createNodeCommandRunner", () => {
  it("replaces the process environment when envMode is replace", async () => {
    const runner = createNodeCommandRunner({
      baseEnv: {
        PATH: "base-path",
        SECRET_TOKEN: "server-secret"
      }
    });

    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", envProbeScript(["SECRET_TOKEN", "SAFE_VALUE"])],
      envMode: "replace",
      env: {
        SAFE_VALUE: "allowed"
      }
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout) as unknown, {
      SECRET_TOKEN: null,
      SAFE_VALUE: "allowed"
    });
  });

  it("keeps merge mode as the default for non-agent commands", async () => {
    const runner = createNodeCommandRunner({
      baseEnv: {
        PATH: "base-path",
        EXISTING_VALUE: "inherited"
      }
    });

    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", envProbeScript(["PATH", "EXISTING_VALUE", "SAFE_VALUE"])],
      env: {
        SAFE_VALUE: "allowed"
      }
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.stdout) as unknown, {
      PATH: "base-path",
      EXISTING_VALUE: "inherited",
      SAFE_VALUE: "allowed"
    });
  });
});
