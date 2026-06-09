export const requiredConfigKeys = [
  "REVIEW_SERVER_HOST",
  "REVIEW_SERVER_PORT",
  "REVIEW_SERVER_DATABASE_PATH",
  "REVIEW_SERVER_WORKSPACE_ROOT",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY_PATH",
  "GITHUB_WEBHOOK_SECRET",
  "CLAUDE_CODE_COMMAND",
  "CLAUDE_CODE_AUTH_MODE",
  "MODEL_EGRESS_ALLOWLIST",
  "HUMAN_REVIEW_LABEL",
  "SECURITY_SENSITIVE_LABEL",
  "DO_NOT_MERGE_LABEL",
  "TRUSTED_REVIEWERS",
  "RISKY_PATH_PATTERNS"
] as const;

export type ConfigKey = (typeof requiredConfigKeys)[number];

export const optionalConfigKeys = ["REVIEW_REPO_ALLOWLIST"] as const;
export type OptionalConfigKey = (typeof optionalConfigKeys)[number];

export type ConfigEnvSource = {
  readonly [key: string]: string | undefined;
};

export interface OrchestratorCliConfig {
  readonly command: string;
  readonly authMode: string;
}

export interface Config {
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly databasePath: string;
    readonly workspaceRoot: string;
  };
  readonly github: {
    readonly appId: string;
    readonly privateKeyPath: string;
    readonly webhookSecret: string;
  };
  readonly orchestrator: OrchestratorCliConfig;
  readonly modelEgressAllowlist: readonly string[];
  // Optional repo scope. Empty = review ANY repo the GitHub App is installed on;
  // repo identity is taken per-event from the webhook payload, not from static config.
  readonly repoAllowlist: readonly string[];
  readonly policy: {
    readonly labels: {
      readonly humanReview: string;
      readonly securitySensitive: string;
      readonly doNotMerge: string;
    };
    readonly trustedReviewers: readonly string[];
    readonly riskyPathPatterns: readonly string[];
  };
}

export interface InvalidConfigValue {
  readonly key: ConfigKey | OptionalConfigKey;
  readonly reason: string;
}

export type ConfigLoadResult =
  | {
      readonly ok: true;
      readonly config: Config;
    }
  | {
      readonly ok: false;
      readonly missingKeys: readonly ConfigKey[];
      readonly invalidValues: readonly InvalidConfigValue[];
    };

export function loadConfig(): ConfigLoadResult {
  return loadConfigFromEnv(process.env);
}

export function loadConfigFromEnv(env: ConfigEnvSource): ConfigLoadResult {
  const missingKeys = requiredConfigKeys.filter((key) => readEnvValue(env, key) === undefined);

  if (missingKeys.length > 0) {
    return { ok: false, missingKeys, invalidValues: [] };
  }

  const invalidValues: InvalidConfigValue[] = [];
  const port = readPositiveInteger(env, "REVIEW_SERVER_PORT", invalidValues);
  const modelEgressAllowlist = readNonEmptyCsv(
    env,
    "MODEL_EGRESS_ALLOWLIST",
    invalidValues,
    "must list at least one allowed egress host"
  );

  const repoAllowlist = readOptionalAllowlist(env, "REVIEW_REPO_ALLOWLIST", invalidValues);

  if (
    invalidValues.length > 0 ||
    port === undefined ||
    modelEgressAllowlist === undefined ||
    repoAllowlist === undefined
  ) {
    return { ok: false, missingKeys: [], invalidValues };
  }

  return {
    ok: true,
    config: {
      server: {
        host: requiredValue(env, "REVIEW_SERVER_HOST"),
        port,
        databasePath: requiredValue(env, "REVIEW_SERVER_DATABASE_PATH"),
        workspaceRoot: requiredValue(env, "REVIEW_SERVER_WORKSPACE_ROOT")
      },
      github: {
        appId: requiredValue(env, "GITHUB_APP_ID"),
        privateKeyPath: requiredValue(env, "GITHUB_APP_PRIVATE_KEY_PATH"),
        webhookSecret: requiredValue(env, "GITHUB_WEBHOOK_SECRET")
      },
      orchestrator: {
        command: requiredValue(env, "CLAUDE_CODE_COMMAND"),
        authMode: requiredValue(env, "CLAUDE_CODE_AUTH_MODE")
      },
      modelEgressAllowlist,
      repoAllowlist,
      policy: {
        labels: {
          humanReview: requiredValue(env, "HUMAN_REVIEW_LABEL"),
          securitySensitive: requiredValue(env, "SECURITY_SENSITIVE_LABEL"),
          doNotMerge: requiredValue(env, "DO_NOT_MERGE_LABEL")
        },
        trustedReviewers: readCsv(env, "TRUSTED_REVIEWERS"),
        riskyPathPatterns: readCsv(env, "RISKY_PATH_PATTERNS")
      }
    }
  };
}

function readEnvValue(env: ConfigEnvSource, key: ConfigKey): string | undefined {
  const value = env[key]?.trim();
  return value === "" ? undefined : value;
}

function requiredValue(env: ConfigEnvSource, key: ConfigKey): string {
  const value = readEnvValue(env, key);

  if (value === undefined) {
    throw new Error(`Missing required runtime config key: ${key}`);
  }

  return value;
}

function readCsv(env: ConfigEnvSource, key: ConfigKey): readonly string[] {
  return requiredValue(env, key)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readOptionalAllowlist(
  env: ConfigEnvSource,
  key: OptionalConfigKey,
  invalidValues: InvalidConfigValue[]
): readonly string[] | undefined {
  const raw = env[key];

  // Unset or empty/whitespace-only: intentional repo-agnostic scope.
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }

  // Present and non-empty but no valid entries (e.g. ",," or " , "): the operator
  // tried to restrict scope — fail closed instead of silently allowing all repos.
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    invalidValues.push({ key, reason: "is set but lists no valid owner/repo entries" });
    return undefined;
  }

  return entries;
}

function readNonEmptyCsv(
  env: ConfigEnvSource,
  key: ConfigKey,
  invalidValues: InvalidConfigValue[],
  reason: string
): readonly string[] | undefined {
  const values = readCsv(env, key);

  if (values.length === 0) {
    invalidValues.push({ key, reason });
    return undefined;
  }

  return values;
}

function readPositiveInteger(
  env: ConfigEnvSource,
  key: ConfigKey,
  invalidValues: InvalidConfigValue[]
): number | undefined {
  const rawValue = requiredValue(env, key);
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed.toString() !== rawValue) {
    invalidValues.push({ key, reason: "must be a positive integer" });
    return undefined;
  }

  return parsed;
}
