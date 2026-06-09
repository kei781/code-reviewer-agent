import { spawn } from "node:child_process";
import { getProcessEnvironment, type ConfigEnvSource } from "../../shared/config.js";
import { log } from "../../shared/log.js";

export interface CommandInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly envMode?: "merge" | "replace";
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandRunner {
  run(command: CommandInvocation): Promise<CommandResult>;
}

export interface NodeCommandRunnerOptions {
  readonly defaultTimeoutMs?: number;
  readonly baseEnv?: ConfigEnvSource;
}

const defaultCommandTimeoutMs = 120_000;

export function createNodeCommandRunner(options: NodeCommandRunnerOptions = {}): CommandRunner {
  const baseEnv = options.baseEnv ?? getProcessEnvironment();

  return {
    run(command) {
      return runNodeCommand(command, options.defaultTimeoutMs ?? defaultCommandTimeoutMs, baseEnv);
    }
  };
}

function runNodeCommand(
  command: CommandInvocation,
  defaultTimeoutMs: number,
  baseEnv: ConfigEnvSource
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    log("Running command", {
      level: "debug",
      metadata: {
        executable: command.executable,
        args: command.args,
        cwd: command.cwd
      }
    });

    const child = spawn(command.executable, [...command.args], buildSpawnOptions(command, baseEnv));
    const timeoutMs = command.timeoutMs ?? defaultTimeoutMs;
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: timedOut ? 124 : code ?? 1,
        stdout,
        stderr: timedOut ? `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim() : stderr
      });
    });
  });
}

function buildSpawnOptions(
  command: CommandInvocation,
  baseEnv: ConfigEnvSource
): { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly windowsHide: true } {
  const env = buildCommandEnvironment(command, baseEnv);

  return {
    windowsHide: true,
    ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
    ...(env === undefined ? {} : { env })
  };
}

function buildCommandEnvironment(
  command: CommandInvocation,
  baseEnv: ConfigEnvSource
): NodeJS.ProcessEnv | undefined {
  if (command.env === undefined) {
    return undefined;
  }

  if (command.envMode === "replace") {
    return { ...command.env };
  }

  return { ...baseEnv, ...command.env };
}
