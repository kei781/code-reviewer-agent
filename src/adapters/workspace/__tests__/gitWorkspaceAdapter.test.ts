import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { type CommandInvocation, type CommandResult } from "../commandRunner.js";
import { createGitWorkspaceAdapter } from "../gitWorkspaceAdapter.js";

const headSha = "0123456789abcdef0123456789abcdef01234567";

function successfulRunner(commands: CommandInvocation[]) {
  return {
    async run(command: CommandInvocation): Promise<CommandResult> {
      commands.push(command);
      return { exitCode: 0, stdout: "", stderr: "" };
    }
  };
}

describe("createGitWorkspaceAdapter", () => {
  it("clones, fetches, and checks out the webhook head SHA under a human-readable workspace path", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "review-workspace-"));
    const commands: CommandInvocation[] = [];

    try {
      const adapter = createGitWorkspaceAdapter({
        workspaceRoot,
        commandRunner: successfulRunner(commands)
      });

      const prepared = await adapter.prepareWorkspace({
        repositoryUrl: "https://github.com/kei781/sql-agent.git",
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42,
        baseBranch: "main",
        headBranch: "feature/sql-guard",
        headSha
      });

      assert.equal(prepared.localWorkspacePath.startsWith(path.resolve(workspaceRoot)), true);
      assert.match(prepared.localWorkspacePath, /kei781[\\/]sql-agent[\\/]pr-42$/u);
      assert.deepEqual(commands.map(toGitCommand), [
        ["clone", "--no-checkout", "https://github.com/kei781/sql-agent.git", prepared.localWorkspacePath],
        ["fetch", "--no-tags", "origin", "feature/sql-guard"],
        ["checkout", "--detach", headSha]
      ]);
      assert.equal(commands[1]?.cwd, prepared.localWorkspacePath);
      assert.equal(commands[2]?.cwd, prepared.localWorkspacePath);
      assertGitIsolation(commands, workspaceRoot);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("updates an existing checkout without recloning", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "review-workspace-"));
    const commands: CommandInvocation[] = [];

    try {
      await mkdir(path.join(workspaceRoot, "kei781", "sql-agent", "pr-42", ".git"), { recursive: true });

      const adapter = createGitWorkspaceAdapter({
        workspaceRoot,
        commandRunner: successfulRunner(commands)
      });

      await adapter.prepareWorkspace({
        repositoryUrl: "https://github.com/kei781/sql-agent.git",
        repositoryFullName: "kei781/sql-agent",
        pullRequestNumber: 42,
        baseBranch: "main",
        headBranch: "feature/sql-guard",
        headSha
      });

      assert.deepEqual(commands.map(toGitCommand), [
        ["remote", "set-url", "origin", "https://github.com/kei781/sql-agent.git"],
        ["fetch", "--no-tags", "origin", "feature/sql-guard"],
        ["checkout", "--detach", headSha]
      ]);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("sanitizes untrusted repository names and rejects failed git commands", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "review-workspace-"));
    const commands: CommandInvocation[] = [];

    try {
      const adapter = createGitWorkspaceAdapter({
        workspaceRoot,
        commandRunner: {
          async run(command) {
            commands.push(command);
            return toGitCommand(command)[0] === "fetch"
              ? { exitCode: 128, stdout: "", stderr: "fatal: could not fetch" }
              : { exitCode: 0, stdout: "", stderr: "" };
          }
        }
      });

      await assert.rejects(
        () =>
          adapter.prepareWorkspace({
            repositoryUrl: "https://github.com/kei781/sql-agent.git",
            repositoryFullName: "../kei781/sql-agent",
            pullRequestNumber: 42,
            baseBranch: "main",
            headBranch: "feature/sql-guard",
            headSha
          }),
        /git fetch failed: fatal: could not fetch/u
      );

      const checkoutPath = toGitCommand(commands[0] ?? { executable: "", args: [] })[3];
      assert.equal(typeof checkoutPath, "string");
      assert.equal(path.resolve(String(checkoutPath)).startsWith(path.resolve(workspaceRoot)), true);
      assert.doesNotMatch(String(checkoutPath), /\.\./u);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("rejects git arguments that could be parsed as options before running git", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "review-workspace-"));
    const commands: CommandInvocation[] = [];
    const adapter = createGitWorkspaceAdapter({
      workspaceRoot,
      commandRunner: successfulRunner(commands)
    });

    try {
      await assert.rejects(
        () =>
          adapter.prepareWorkspace({
            repositoryUrl: "--upload-pack=malicious",
            repositoryFullName: "kei781/sql-agent",
            pullRequestNumber: 42,
            baseBranch: "main",
            headBranch: "feature/sql-guard",
            headSha
          }),
        /Repository URL must not start with a hyphen/u
      );
      await assert.rejects(
        () =>
          adapter.prepareWorkspace({
            repositoryUrl: "https://github.com/kei781/sql-agent.git",
            repositoryFullName: "kei781/sql-agent",
            pullRequestNumber: 42,
            baseBranch: "main",
            headBranch: "--upload-pack=malicious",
            headSha
          }),
        /Head branch must not start with a hyphen/u
      );
      await assert.rejects(
        () =>
          adapter.prepareWorkspace({
            repositoryUrl: "https://github.com/kei781/sql-agent.git",
            repositoryFullName: "kei781/sql-agent",
            pullRequestNumber: 42,
            baseBranch: "main",
            headBranch: "feature/sql-guard",
            headSha: "--detach"
          }),
        /Head SHA must be a 40-character hexadecimal Git object id/u
      );
      assert.deepEqual(commands, []);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

function toGitCommand(command: CommandInvocation): readonly string[] {
  assert.equal(command.executable, "git");

  const commandIndex = command.args.findIndex((arg) =>
    ["clone", "remote", "fetch", "checkout"].some((gitCommand) => arg === gitCommand)
  );

  assert.notEqual(commandIndex, -1);
  return command.args.slice(commandIndex);
}

function assertGitIsolation(commands: readonly CommandInvocation[], workspaceRoot: string): void {
  for (const command of commands) {
    assert.equal(command.args[0], "-c");
    assert.equal(command.args[1]?.startsWith("core.hooksPath="), true);
    assert.equal(command.args[2], "-c");
    assert.equal(command.args[3], "core.fsmonitor=false");
    assert.equal(command.env?.["GIT_CONFIG_NOSYSTEM"], "1");
    assert.equal(command.env?.["GIT_TERMINAL_PROMPT"], "0");
    assert.equal(typeof command.env?.["GIT_CONFIG_GLOBAL"], "string");
    assert.equal(path.resolve(String(command.env?.["GIT_CONFIG_GLOBAL"])).startsWith(path.resolve(workspaceRoot)), true);
    assert.equal(path.resolve(String(command.args[1]).slice("core.hooksPath=".length)).startsWith(path.resolve(workspaceRoot)), true);
  }
}
