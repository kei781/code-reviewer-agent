export const requiredReviewServerEnvKeys = [
  "REVIEW_SERVER_HOST",
  "REVIEW_SERVER_PORT",
  "REVIEW_SERVER_DATABASE_PATH",
  "REVIEW_SERVER_WORKSPACE_ROOT",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY_PATH",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "REVIEWER_PROVIDER",
  "REVIEWER_MODEL",
  "REVIEWER_MODEL_FAMILY",
  "REVIEWER_ADAPTER",
  "REVIEWER_API_KEY",
  "FIXER_PROVIDER",
  "FIXER_MODEL",
  "FIXER_MODEL_FAMILY",
  "FIXER_ADAPTER",
  "FIXER_API_KEY",
  "MODEL_EGRESS_ALLOWLIST",
  "MAX_FIX_ATTEMPTS",
  "AUTOFIX_LABEL",
  "AUTOMERGE_LABEL",
  "HUMAN_REVIEW_LABEL",
  "SECURITY_SENSITIVE_LABEL",
  "DO_NOT_MERGE_LABEL",
  "TRUSTED_REVIEWERS",
  "TRUSTED_FIXERS",
  "TRUSTED_AUTHORS",
  "LOW_RISK_PATH_ALLOWLIST",
  "RISKY_PATH_PATTERNS"
] as const;

export type ReviewServerEnvKey = (typeof requiredReviewServerEnvKeys)[number];

export type ReviewServerEnvSource = {
  readonly [key: string]: string | undefined;
};

export interface RuntimeModelConfig {
  readonly provider: string;
  readonly model: string;
  readonly modelFamily: string;
  readonly adapter: string;
  readonly apiKey: string;
}

export interface ReviewServerRuntimeConfig {
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
    readonly owner: string;
    readonly repo: string;
  };
  readonly reviewer: RuntimeModelConfig;
  readonly fixer: RuntimeModelConfig;
  readonly modelEgressAllowlist: readonly string[];
  readonly policy: {
    readonly maxFixAttempts: number;
    readonly labels: {
      readonly autofix: string;
      readonly automerge: string;
      readonly humanReview: string;
      readonly securitySensitive: string;
      readonly doNotMerge: string;
    };
    readonly trustedReviewers: readonly string[];
    readonly trustedFixers: readonly string[];
    readonly trustedAuthors: readonly string[];
    readonly lowRiskPathAllowlist: readonly string[];
    readonly riskyPathPatterns: readonly string[];
  };
}

export interface InvalidReviewServerEnvValue {
  readonly key: ReviewServerEnvKey;
  readonly reason: string;
}

export type ReviewServerRuntimeConfigLoadResult =
  | {
      readonly ok: true;
      readonly config: ReviewServerRuntimeConfig;
    }
  | {
      readonly ok: false;
      readonly missingKeys: readonly ReviewServerEnvKey[];
      readonly invalidValues: readonly InvalidReviewServerEnvValue[];
    };

export function loadReviewServerRuntimeConfig(env: ReviewServerEnvSource): ReviewServerRuntimeConfigLoadResult {
  const missingKeys = requiredReviewServerEnvKeys.filter((key) => readEnvValue(env, key) === undefined);

  if (missingKeys.length > 0) {
    return { ok: false, missingKeys, invalidValues: [] };
  }

  const invalidValues: InvalidReviewServerEnvValue[] = [];
  const port = readPositiveInteger(env, "REVIEW_SERVER_PORT", invalidValues);
  const maxFixAttempts = readPositiveInteger(env, "MAX_FIX_ATTEMPTS", invalidValues);

  if (invalidValues.length > 0 || port === undefined || maxFixAttempts === undefined) {
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
        webhookSecret: requiredValue(env, "GITHUB_WEBHOOK_SECRET"),
        owner: requiredValue(env, "GITHUB_OWNER"),
        repo: requiredValue(env, "GITHUB_REPO")
      },
      reviewer: {
        provider: requiredValue(env, "REVIEWER_PROVIDER"),
        model: requiredValue(env, "REVIEWER_MODEL"),
        modelFamily: requiredValue(env, "REVIEWER_MODEL_FAMILY"),
        adapter: requiredValue(env, "REVIEWER_ADAPTER"),
        apiKey: requiredValue(env, "REVIEWER_API_KEY")
      },
      fixer: {
        provider: requiredValue(env, "FIXER_PROVIDER"),
        model: requiredValue(env, "FIXER_MODEL"),
        modelFamily: requiredValue(env, "FIXER_MODEL_FAMILY"),
        adapter: requiredValue(env, "FIXER_ADAPTER"),
        apiKey: requiredValue(env, "FIXER_API_KEY")
      },
      modelEgressAllowlist: readCsv(env, "MODEL_EGRESS_ALLOWLIST"),
      policy: {
        maxFixAttempts,
        labels: {
          autofix: requiredValue(env, "AUTOFIX_LABEL"),
          automerge: requiredValue(env, "AUTOMERGE_LABEL"),
          humanReview: requiredValue(env, "HUMAN_REVIEW_LABEL"),
          securitySensitive: requiredValue(env, "SECURITY_SENSITIVE_LABEL"),
          doNotMerge: requiredValue(env, "DO_NOT_MERGE_LABEL")
        },
        trustedReviewers: readCsv(env, "TRUSTED_REVIEWERS"),
        trustedFixers: readCsv(env, "TRUSTED_FIXERS"),
        trustedAuthors: readCsv(env, "TRUSTED_AUTHORS"),
        lowRiskPathAllowlist: readCsv(env, "LOW_RISK_PATH_ALLOWLIST"),
        riskyPathPatterns: readCsv(env, "RISKY_PATH_PATTERNS")
      }
    }
  };
}

function readEnvValue(env: ReviewServerEnvSource, key: ReviewServerEnvKey): string | undefined {
  const value = env[key]?.trim();
  return value === "" ? undefined : value;
}

function requiredValue(env: ReviewServerEnvSource, key: ReviewServerEnvKey): string {
  const value = readEnvValue(env, key);

  if (value === undefined) {
    throw new Error(`Missing required runtime config key: ${key}`);
  }

  return value;
}

function readCsv(env: ReviewServerEnvSource, key: ReviewServerEnvKey): readonly string[] {
  return requiredValue(env, key)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readPositiveInteger(
  env: ReviewServerEnvSource,
  key: ReviewServerEnvKey,
  invalidValues: InvalidReviewServerEnvValue[]
): number | undefined {
  const rawValue = requiredValue(env, key);
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed.toString() !== rawValue) {
    invalidValues.push({ key, reason: "must be a positive integer" });
    return undefined;
  }

  return parsed;
}
