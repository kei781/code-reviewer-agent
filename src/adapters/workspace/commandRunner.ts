import { spawn } from "node:child_process";
import { getProcessEnvironment, type ConfigEnvSource } from "../../shared/config.js";
import { log } from "../../shared/log.js";

type CommandSpawnOptions = { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly windowsHide: true };

export interface SpawnedCommandProcess {
  readonly stdout: NodeJS.ReadableStream;
  readonly stderr: NodeJS.ReadableStream;
  kill(signal: NodeJS.Signals): boolean;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: (code: number | null) => void): this;
}

export type CommandProcessSpawner = (
  executable: string,
  args: readonly string[],
  options: CommandSpawnOptions
) => SpawnedCommandProcess;

export interface CommandInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly timeoutKillGraceMs?: number;
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
  readonly defaultTimeoutKillGraceMs?: number;
  readonly baseEnv?: ConfigEnvSource;
  readonly spawnProcess?: CommandProcessSpawner;
}

const defaultCommandTimeoutMs = 120_000;
const defaultTimeoutKillGraceMs = 5_000;

export function createNodeCommandRunner(options: NodeCommandRunnerOptions = {}): CommandRunner {
  const baseEnv = options.baseEnv ?? getProcessEnvironment();
  const spawnProcess = options.spawnProcess ?? spawnNodeCommand;

  return {
    run(command) {
      return runNodeCommand(
        command,
        options.defaultTimeoutMs ?? defaultCommandTimeoutMs,
        options.defaultTimeoutKillGraceMs ?? defaultTimeoutKillGraceMs,
        baseEnv,
        spawnProcess
      );
    }
  };
}

function runNodeCommand(
  command: CommandInvocation,
  defaultTimeoutMs: number,
  defaultKillGraceMs: number,
  baseEnv: ConfigEnvSource,
  spawnProcess: CommandProcessSpawner
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

    const child = spawnProcess(command.executable, command.args, buildSpawnOptions(command, baseEnv));
    const timeoutMs = command.timeoutMs ?? defaultTimeoutMs;
    const killGraceMs = command.timeoutKillGraceMs ?? defaultKillGraceMs;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutKill: ReturnType<typeof setTimeout> | undefined;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      timeoutKill = setTimeout(() => {
        child.kill("SIGKILL");
      }, killGraceMs);
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
      clearCommandTimers(timeout, timeoutKill);
      reject(error);
    });
    child.on("close", (code) => {
      clearCommandTimers(timeout, timeoutKill);
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

function spawnNodeCommand(
  executable: string,
  args: readonly string[],
  options: CommandSpawnOptions
): SpawnedCommandProcess {
  const child = spawn(executable, [...args], options);

  if (child.stdout === null || child.stderr === null) {
    throw new Error("Command runner requires piped stdout and stderr");
  }

  return child as SpawnedCommandProcess;
}

function clearCommandTimers(
  timeout: ReturnType<typeof setTimeout>,
  timeoutKill: ReturnType<typeof setTimeout> | undefined
): void {
  clearTimeout(timeout);
  if (timeoutKill !== undefined) {
    clearTimeout(timeoutKill);
  }
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
