import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
      validateGitInputs(context);
      const checkoutPath = resolveGitWorkspacePath({
        workspaceRoot,
        repositoryFullName: context.repositoryFullName,
        pullRequestNumber: context.pullRequestNumber
      });
      const gitIsolation = await prepareGitIsolation(workspaceRoot);

      await mkdir(path.dirname(checkoutPath), { recursive: true });

      if (await isExistingGitCheckout(checkoutPath)) {
        await runGit(
          options.commandRunner,
          ["remote", "set-url", "origin", context.repositoryUrl],
          gitIsolation,
          checkoutPath
        );
      } else {
        await runGit(
          options.commandRunner,
          ["clone", "--no-checkout", context.repositoryUrl, checkoutPath],
          gitIsolation
        );
      }

      await runGit(
        options.commandRunner,
        ["fetch", "--no-tags", "origin", context.headBranch],
        gitIsolation,
        checkoutPath
      );
      await runGit(
        options.commandRunner,
        ["checkout", "--detach", context.headSha],
        gitIsolation,
        checkoutPath
      );

      return toReviewContext(context, checkoutPath);
    }
  };
}

interface GitIsolation {
  readonly disabledHooksPath: string;
  readonly globalConfigPath: string;
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

async function runGit(
  commandRunner: CommandRunner,
  args: readonly string[],
  isolation: GitIsolation,
  cwd?: string
): Promise<void> {
  const result = await commandRunner.run({
    executable: "git",
    args: buildIsolatedGitArgs(args, isolation),
    ...(cwd === undefined ? {} : { cwd }),
    env: {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: isolation.globalConfigPath,
      GIT_TERMINAL_PROMPT: "0"
    }
  });

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
    throw new Error(`git ${args[0] ?? "command"} failed: ${detail}`);
  }
}

async function prepareGitIsolation(workspaceRoot: string): Promise<GitIsolation> {
  const isolationRoot = path.resolve(workspaceRoot, ".git-isolation");
  const globalConfigPath = path.resolve(isolationRoot, "global.gitconfig");

  if (!isPathInside(workspaceRoot, isolationRoot) || !isPathInside(workspaceRoot, globalConfigPath)) {
    throw new Error("Unsafe git isolation path outside configured workspace root");
  }

  await mkdir(isolationRoot, { recursive: true });
  const disabledHooksPath = await mkdtemp(path.join(isolationRoot, "hooks-"));

  if (!isPathInside(workspaceRoot, disabledHooksPath)) {
    throw new Error("Unsafe git hooks path outside configured workspace root");
  }

  await writeFile(globalConfigPath, "", { encoding: "utf8" });

  return { disabledHooksPath, globalConfigPath };
}

function buildIsolatedGitArgs(args: readonly string[], isolation: GitIsolation): readonly string[] {
  return ["-c", `core.hooksPath=${toGitConfigPath(isolation.disabledHooksPath)}`, "-c", "core.fsmonitor=false", ...args];
}

function validateGitInputs(context: WorkspacePreparationRequest): void {
  if (context.repositoryUrl.trim().length === 0) {
    throw new Error("Repository URL must be non-empty");
  }

  if (context.repositoryUrl.startsWith("-")) {
    throw new Error("Repository URL must not start with a hyphen");
  }

  if (context.headBranch.trim().length === 0) {
    throw new Error("Head branch must be non-empty");
  }

  if (context.headBranch.startsWith("-")) {
    throw new Error("Head branch must not start with a hyphen");
  }

  if (!/^[0-9a-f]{40}$/iu.test(context.headSha)) {
    throw new Error("Head SHA must be a 40-character hexadecimal Git object id");
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

function toGitConfigPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
