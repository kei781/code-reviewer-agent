import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
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

  it("escalates timed out commands to SIGKILL when SIGTERM does not close the process", async () => {
    const killSignals: string[] = [];
    const runner = createNodeCommandRunner({
      baseEnv: {},
      defaultTimeoutKillGraceMs: 1,
      spawnProcess() {
        const child = new EventEmitter() as EventEmitter & {
          readonly stdout: PassThrough;
          readonly stderr: PassThrough;
          kill(signal: string): boolean;
        };

        Object.assign(child, {
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          kill(signal: string) {
            killSignals.push(signal);
            if (signal === "SIGKILL") {
              setImmediate(() => child.emit("close", null));
            }

            return true;
          }
        });

        return child;
      }
    });

    const result = await runner.run({
      executable: "fake-command",
      args: [],
      timeoutMs: 1
    });

    assert.deepEqual(killSignals, ["SIGTERM", "SIGKILL"]);
    assert.equal(result.exitCode, 124);
    assert.match(result.stderr, /Command timed out after 1ms/u);
  });
});
