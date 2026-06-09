export interface ModelEgressPolicyInput {
  readonly allowlist: readonly string[];
}

export interface ModelEgressSession {
  readonly env: Readonly<Record<string, string>>;
  dispose(): Promise<void>;
}

export type ModelEgressEnforcer = (input: ModelEgressPolicyInput) => Promise<ModelEgressSession>;

export interface ModelEgressGuard {
  enter(): Promise<ModelEgressSession>;
}

export interface ModelEgressGuardOptions {
  readonly allowlist: readonly string[];
  readonly enforce: ModelEgressEnforcer;
}

export function createModelEgressGuard(options: ModelEgressGuardOptions): ModelEgressGuard {
  const allowlist = normalizeAllowlist(options.allowlist);

  return {
    async enter() {
      if (allowlist.length === 0) {
        throw new Error("MODEL_EGRESS_ALLOWLIST must contain at least one host");
      }

      try {
        return await options.enforce({ allowlist });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        throw new Error(`Failed to enforce model egress policy: ${message}`);
      }
    }
  };
}

function normalizeAllowlist(allowlist: readonly string[]): readonly string[] {
  return allowlist.map((host) => host.trim()).filter((host) => host.length > 0);
}
