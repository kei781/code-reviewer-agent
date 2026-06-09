import { spawn } from "node:child_process";
import { log } from "../../shared/log.js";

export interface CommandInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
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
}

const defaultCommandTimeoutMs = 120_000;

export function createNodeCommandRunner(options: NodeCommandRunnerOptions = {}): CommandRunner {
  return {
    run(command) {
      return runNodeCommand(command, options.defaultTimeoutMs ?? defaultCommandTimeoutMs);
    }
  };
}

function runNodeCommand(command: CommandInvocation, defaultTimeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    log("Running command", {
      level: "debug",
      metadata: {
        executable: command.executable,
        args: command.args,
        cwd: command.cwd
      }
    });

    const child = spawn(command.executable, [...command.args], buildSpawnOptions(command));
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

function buildSpawnOptions(command: CommandInvocation): { readonly cwd?: string; readonly windowsHide: true } {
  if (command.cwd === undefined) {
    return { windowsHide: true };
  }

  return { cwd: command.cwd, windowsHide: true };
}
