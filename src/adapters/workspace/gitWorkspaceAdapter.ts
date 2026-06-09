import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ReviewWorkspacePort, WorkspacePreparationRequest } from "../../app/runEnsembleReview.js";
import type { PullRequestReviewContext } from "../../domain/review/pullRequestReviewContext.js";
import type { CommandRunner } from "./commandRunner.js";

export interface GitWorkspaceAdapterOptions {
  readonly workspaceRoot: string;
  readonly commandRunner: CommandRunner;
}

export function createGitWorkspaceAdapter(options: GitWorkspaceAdapterOptions): ReviewWorkspacePort {
  const workspaceRoot = path.resolve(options.workspaceRoot);

  return {
    async prepareWorkspace(context) {
      const checkoutPath = resolveGitWorkspacePath({
        workspaceRoot,
        repositoryFullName: context.repositoryFullName,
        pullRequestNumber: context.pullRequestNumber
      });

      await mkdir(path.dirname(checkoutPath), { recursive: true });

      if (await isExistingGitCheckout(checkoutPath)) {
        await runGit(options.commandRunner, ["remote", "set-url", "origin", context.repositoryUrl], checkoutPath);
      } else {
        await runGit(options.commandRunner, ["clone", "--no-checkout", context.repositoryUrl, checkoutPath]);
      }

      await runGit(options.commandRunner, ["fetch", "--no-tags", "origin", context.headBranch], checkoutPath);
      await runGit(options.commandRunner, ["checkout", "--detach", context.headSha], checkoutPath);

      return toReviewContext(context, checkoutPath);
    }
  };
}

export function resolveGitWorkspacePath(input: {
  readonly workspaceRoot: string;
  readonly repositoryFullName: string;
  readonly pullRequestNumber: number;
}): string {
  if (!Number.isSafeInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) {
    throw new Error("Pull request number must be a positive integer");
  }

  const workspaceRoot = path.resolve(input.workspaceRoot);
  const repositorySegments = input.repositoryFullName
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const humanSegments =
    repositorySegments.length >= 2 ? repositorySegments.slice(-2) : [input.repositoryFullName.trim() || "repository"];
  const checkoutPath = path.resolve(
    workspaceRoot,
    ...humanSegments.map(sanitizeWorkspaceSegment),
    `pr-${input.pullRequestNumber}`
  );

  if (!isPathInside(workspaceRoot, checkoutPath)) {
    throw new Error(`Unsafe workspace path outside configured root: ${checkoutPath}`);
  }

  return checkoutPath;
}

async function runGit(commandRunner: CommandRunner, args: readonly string[], cwd?: string): Promise<void> {
  const result = await commandRunner.run({
    executable: "git",
    args,
    ...(cwd === undefined ? {} : { cwd })
  });

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
    throw new Error(`git ${args[0] ?? "command"} failed: ${detail}`);
  }
}

async function isExistingGitCheckout(checkoutPath: string): Promise<boolean> {
  try {
    await access(path.join(checkoutPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

function toReviewContext(context: WorkspacePreparationRequest, localWorkspacePath: string): PullRequestReviewContext {
  return {
    repositoryUrl: context.repositoryUrl,
    repositoryFullName: context.repositoryFullName,
    pullRequestNumber: context.pullRequestNumber,
    baseBranch: context.baseBranch,
    headBranch: context.headBranch,
    headSha: context.headSha,
    localWorkspacePath
  };
}

function sanitizeWorkspaceSegment(segment: string): string {
  const sanitized = segment.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^\.+|\.+$/gu, "");

  return sanitized.length > 0 ? sanitized : "repository";
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
