import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { type CommandInvocation, type CommandResult } from "../commandRunner.js";
import { createGitWorkspaceAdapter } from "../gitWorkspaceAdapter.js";

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
        headSha: "abc123"
      });

      assert.equal(prepared.localWorkspacePath.startsWith(path.resolve(workspaceRoot)), true);
      assert.match(prepared.localWorkspacePath, /kei781[\\/]sql-agent[\\/]pr-42$/u);
      assert.deepEqual(commands.map((command) => [command.executable, ...command.args]), [
        ["git", "clone", "--no-checkout", "https://github.com/kei781/sql-agent.git", prepared.localWorkspacePath],
        ["git", "fetch", "--no-tags", "origin", "feature/sql-guard"],
        ["git", "checkout", "--detach", "abc123"]
      ]);
      assert.equal(commands[1]?.cwd, prepared.localWorkspacePath);
      assert.equal(commands[2]?.cwd, prepared.localWorkspacePath);
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
        headSha: "abc123"
      });

      assert.deepEqual(commands.map((command) => [command.executable, ...command.args]), [
        ["git", "remote", "set-url", "origin", "https://github.com/kei781/sql-agent.git"],
        ["git", "fetch", "--no-tags", "origin", "feature/sql-guard"],
        ["git", "checkout", "--detach", "abc123"]
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
            return command.args[0] === "fetch"
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
            headSha: "abc123"
          }),
        /git fetch failed: fatal: could not fetch/u
      );

      const checkoutPath = commands[0]?.args[3];
      assert.equal(typeof checkoutPath, "string");
      assert.equal(path.resolve(String(checkoutPath)).startsWith(path.resolve(workspaceRoot)), true);
      assert.doesNotMatch(String(checkoutPath), /\.\./u);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
