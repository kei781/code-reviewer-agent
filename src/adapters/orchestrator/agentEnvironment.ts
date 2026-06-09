export type AgentEnvironmentSource = Readonly<Record<string, string | undefined>>;

const localToolEnvironmentKeys = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "LOCALAPPDATA",
  "PATH",
  "Path",
  "ProgramData",
  "SHELL",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME"
]);

const secretEnvironmentPattern = /(^|_)(KEY|PASSWORD|SECRET|TOKEN)($|_)/u;
const serverConfigurationPattern = /^(CLAUDE_CODE_|GITHUB_|MODEL_EGRESS_|REVIEW_SERVER_)/u;

export function isSecretEnvironmentKey(key: string): boolean {
  return secretEnvironmentPattern.test(key) || key.includes("PRIVATE_KEY");
}

export function buildAgentEnvironment(
  baseEnv: AgentEnvironmentSource,
  extraEnv: AgentEnvironmentSource = {}
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) {
      continue;
    }

    if (!localToolEnvironmentKeys.has(key)) {
      continue;
    }

    if (isSecretEnvironmentKey(key) || serverConfigurationPattern.test(key)) {
      continue;
    }

    env[key] = value;
  }

  for (const [key, value] of Object.entries(extraEnv)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}
