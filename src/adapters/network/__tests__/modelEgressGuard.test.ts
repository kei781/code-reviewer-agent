import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createModelEgressGuard, type ModelEgressEnforcer } from "../modelEgressGuard.js";

describe("createModelEgressGuard", () => {
  it("fails closed when the model egress allowlist is empty", async () => {
    const guard = createModelEgressGuard({
      allowlist: [],
      async enforce() {
        throw new Error("should not run");
      }
    });

    await assert.rejects(() => guard.enter(), /MODEL_EGRESS_ALLOWLIST must contain at least one host/u);
  });

  it("prevents agent launch when enforcement fails", async () => {
    const calls: unknown[] = [];
    const guard = createModelEgressGuard({
      allowlist: ["api.anthropic.com"],
      async enforce(input) {
        calls.push(input);
        throw new Error("firewall unavailable");
      }
    });

    await assert.rejects(() => guard.enter(), /Failed to enforce model egress policy/u);
    assert.deepEqual(calls, [{ allowlist: ["api.anthropic.com"] }]);
  });

  it("returns session env and disposes the active policy", async () => {
    const calls: string[] = [];
    const enforce: ModelEgressEnforcer = async (input) => {
      calls.push(`enforce:${input.allowlist.join(",")}`);
      return {
        env: {
          MODEL_EGRESS_POLICY_ID: "policy-1"
        },
        async dispose() {
          calls.push("dispose");
        }
      };
    };
    const guard = createModelEgressGuard({
      allowlist: ["api.anthropic.com", "api.openai.com"],
      enforce
    });

    const session = await guard.enter();

    assert.deepEqual(session.env, {
      MODEL_EGRESS_POLICY_ID: "policy-1"
    });
    await session.dispose();
    assert.deepEqual(calls, ["enforce:api.anthropic.com,api.openai.com", "dispose"]);
  });
});
