# Phase 3B GitHub Workspace State Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 3B concrete GitHub, git workspace, and persistent state adapters behind the existing app ports without adding the Phase 3C Claude Code runtime.

**Architecture:** Keep webhook mapping, GitHub API effects, git command execution, and SQLite persistence in separate adapter modules. App use cases remain unchanged and receive typed events plus injected ports. GitHub credentials stay server-side inside GitHub adapters and are never passed to workspace or agent-facing contexts.

**Tech Stack:** TypeScript, Node 24 `node:test`, Node 24 `node:sqlite`, Node `crypto`, injected fake GitHub clients, injected fake command runners, existing `npm run check`.

---

## File Structure

- Create `src/adapters/github/webhookEventMapper.ts`
  - Maps raw GitHub payloads into `PullRequestWebhookEvent`.
  - Maps issue comments into `ReviewerMentionCommentEvent` using an injected PR metadata loader.
  - Reads repository identity from payload data, never static owner/repo config.
- Create `src/adapters/github/githubAppInstallationToken.ts`
  - Builds a GitHub App JWT from server-side app credentials.
  - Exchanges the JWT for an installation token through an injected GitHub API client.
- Create `src/adapters/github/githubReviewPublisher.ts`
  - Implements app publication ports through an injected GitHub API client and installation token provider.
  - Renders review, skip, failure, and follow-up comments in small helpers.
- Create `src/adapters/workspace/commandRunner.ts`
  - Defines the command runner interface used by workspace adapters.
  - Provides a Node child-process implementation that logs through `log()`.
- Create `src/adapters/workspace/gitWorkspaceAdapter.ts`
  - Implements `ReviewWorkspacePort`.
  - Clones or updates a local checkout and detaches at webhook `headSha`.
  - Rejects workspace paths outside configured workspace root.
- Create `src/adapters/state/sqliteReviewStateStore.ts`
  - Implements `ReviewStateStorePort` and `FollowUpStateStorePort`.
  - Uses SQLite tables for review attempts, finding fingerprints, and follow-up comments.
- Add tests under matching `__tests__` directories.
- Modify `src/index.ts` to export new adapter factories and types.
- Modify `docs/architecture/directory-structure.md`, `docs/IMPLEMENTATION_PHASES.md`, `docs/phase-plan.md`, and `docs/구현내용.md` to mark Phase 3B progress.

## Task 1: GitHub Webhook Event Mapper

**Files:**
- Create: `src/adapters/github/webhookEventMapper.ts`
- Test: `src/adapters/github/__tests__/webhookEventMapper.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing mapper tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPullRequestWebhookPayload, mapReviewerMentionWebhookPayload } from "../webhookEventMapper.js";

describe("mapPullRequestWebhookPayload", () => {
  it("maps repository and PR identity from the payload", () => {
    const result = mapPullRequestWebhookPayload({
      deliveryId: "delivery-1",
      payload: {
        action: "synchronize",
        repository: { full_name: "kei781/sql-agent", clone_url: "https://github.com/kei781/sql-agent.git" },
        pull_request: {
          number: 42,
          draft: false,
          state: "open",
          base: { ref: "main" },
          head: {
            ref: "feature/sql-guard",
            sha: "abc123",
            repo: { full_name: "kei781/sql-agent", fork: false }
          },
          changed_files: 1
        }
      },
      changedPaths: ["src/query.ts"]
    });

    assert.deepEqual(result.ok && result.event.repositoryFullName, "kei781/sql-agent");
  });
});
```

- [ ] **Step 2: Run the mapper test and confirm it fails**

Run: `npm run build && node --test "dist/adapters/github/__tests__/webhookEventMapper.test.js"`

Expected: FAIL because `webhookEventMapper.js` does not exist.

- [ ] **Step 3: Implement the mapper**

```ts
export type GitHubWebhookMappingResult<T> =
  | { readonly ok: true; readonly event: T }
  | { readonly ok: false; readonly reason: "invalid-payload" | "unsupported-action" };

export function mapPullRequestWebhookPayload(input: PullRequestMappingInput): GitHubWebhookMappingResult<PullRequestWebhookEvent> {
  const payload = asRecord(input.payload);
  const pullRequest = asRecord(payload.pull_request);
  const repository = asRecord(payload.repository);
  const action = readString(payload.action);
  const repositoryFullName = readString(repository.full_name);
  const repositoryUrl = readString(repository.clone_url);
  const head = asRecord(pullRequest.head);
  const base = asRecord(pullRequest.base);
  const headRepo = asRecord(head.repo);

  if (!isSupportedPullRequestAction(action)) {
    return { ok: false, reason: "unsupported-action" };
  }

  if (repositoryFullName === undefined || repositoryUrl === undefined || head.sha === undefined) {
    return { ok: false, reason: "invalid-payload" };
  }

  return {
    ok: true,
    event: {
      deliveryId: input.deliveryId,
      action,
      repositoryUrl,
      repositoryFullName,
      pullRequestNumber: Number(pullRequest.number),
      baseBranch: String(base.ref),
      headBranch: String(head.ref),
      headSha: String(head.sha),
      isDraft: Boolean(pullRequest.draft),
      isClosed: pullRequest.state === "closed",
      isFork: readString(headRepo.full_name) !== repositoryFullName || headRepo.fork === true,
      changedPaths: input.changedPaths
    }
  };
}
```

- [ ] **Step 4: Run mapper tests and full check**

Run: `npm run check`

Expected: PASS.

## Task 2: Git Workspace Adapter

**Files:**
- Create: `src/adapters/workspace/commandRunner.ts`
- Create: `src/adapters/workspace/gitWorkspaceAdapter.ts`
- Test: `src/adapters/workspace/__tests__/gitWorkspaceAdapter.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing workspace tests**

```ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createGitWorkspaceAdapter } from "../gitWorkspaceAdapter.js";

describe("createGitWorkspaceAdapter", () => {
  it("clones and checks out the webhook head SHA under the workspace root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "review-workspace-"));
    const commands: string[][] = [];
    const adapter = createGitWorkspaceAdapter({
      workspaceRoot: root,
      commandRunner: {
        async run(command) {
          commands.push([command.executable, ...command.args]);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      }
    });

    const prepared = await adapter.prepareWorkspace({
      repositoryUrl: "https://github.com/kei781/sql-agent.git",
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      baseBranch: "main",
      headBranch: "feature/sql-guard",
      headSha: "abc123"
    });

    assert.equal(prepared.localWorkspacePath.startsWith(root), true);
    assert.deepEqual(commands.at(-1), ["git", "checkout", "--detach", "abc123"]);
    await rm(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run workspace test and confirm it fails**

Run: `npm run build && node --test "dist/adapters/workspace/__tests__/gitWorkspaceAdapter.test.js"`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement command runner and git adapter**

```ts
export interface CommandRunner {
  run(command: CommandInvocation): Promise<CommandResult>;
}

export function createGitWorkspaceAdapter(options: GitWorkspaceAdapterOptions): ReviewWorkspacePort {
  return {
    async prepareWorkspace(context) {
      const checkoutPath = resolveWorkspacePath(options.workspaceRoot, context.repositoryFullName, context.pullRequestNumber);
      await options.commandRunner.run({ executable: "git", args: ["clone", "--no-checkout", context.repositoryUrl, checkoutPath] });
      await options.commandRunner.run({ executable: "git", args: ["fetch", "--no-tags", "origin", context.headBranch], cwd: checkoutPath });
      await options.commandRunner.run({ executable: "git", args: ["checkout", "--detach", context.headSha], cwd: checkoutPath });
      return { ...context, localWorkspacePath: checkoutPath };
    }
  };
}
```

- [ ] **Step 4: Run workspace tests and full check**

Run: `npm run check`

Expected: PASS.

## Task 3: SQLite Review State Store

**Files:**
- Create: `src/adapters/state/sqliteReviewStateStore.ts`
- Test: `src/adapters/state/__tests__/sqliteReviewStateStore.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing state-store tests**

```ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createSqliteReviewStateStore } from "../sqliteReviewStateStore.js";

describe("createSqliteReviewStateStore", () => {
  it("claims a delivery once and remembers published finding fingerprints", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "review-state-"));
    const store = createSqliteReviewStateStore({ databasePath: path.join(dir, "state.sqlite") });

    const key = { repositoryFullName: "kei781/sql-agent", pullRequestNumber: 42, headSha: "abc123" };
    assert.deepEqual(await store.claimReview({ ...key, deliveryId: "delivery-1" }), { status: "claimed" });
    assert.deepEqual(await store.claimReview({ ...key, deliveryId: "delivery-1" }), { status: "duplicate-delivery" });
    await store.markReviewPublished({ ...key, deliveryId: "delivery-1", publishedFindingFingerprints: ["fp-1"] });
    assert.deepEqual(await store.listPostedFindingFingerprints(key), ["fp-1"]);
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run state-store test and confirm it fails**

Run: `npm run build && node --test "dist/adapters/state/__tests__/sqliteReviewStateStore.test.js"`

Expected: FAIL because the state store does not exist.

- [ ] **Step 3: Implement SQLite store**

```ts
export function createSqliteReviewStateStore(options: SqliteReviewStateStoreOptions): SqliteReviewStateStore {
  const database = new DatabaseSync(options.databasePath);
  database.exec(schemaSql);
  return {
    async claimReview(input) {
      const duplicate = selectReviewDelivery.get(input.deliveryId);
      if (duplicate !== undefined) {
        return { status: "duplicate-delivery" };
      }
      const reviewed = selectPublishedSha.get(input.repositoryFullName, input.pullRequestNumber, input.headSha);
      if (reviewed !== undefined) {
        return { status: "already-reviewed-sha" };
      }
      insertReviewClaim.run(input.deliveryId, input.repositoryFullName, input.pullRequestNumber, input.headSha);
      return { status: "claimed" };
    },
    async listPostedFindingFingerprints(input) {
      return selectFingerprints.all(input.repositoryFullName, input.pullRequestNumber, input.headSha).map((row) => row.fingerprint);
    },
    async markReviewPublished(input) {
      insertPublishedReview.run(input.deliveryId, input.repositoryFullName, input.pullRequestNumber, input.headSha);
      for (const fingerprint of input.publishedFindingFingerprints) {
        insertFingerprint.run(input.repositoryFullName, input.pullRequestNumber, input.headSha, fingerprint);
      }
    },
    async markReviewFailed(input) {
      insertReviewFailure.run(input.deliveryId, input.repositoryFullName, input.pullRequestNumber, input.headSha, input.stage, input.message);
    },
    close() {
      database.close();
    }
  };
}
```

- [ ] **Step 4: Run state-store tests and full check**

Run: `npm run check`

Expected: PASS.

## Task 4: GitHub App Token and Publisher Adapters

**Files:**
- Create: `src/adapters/github/githubAppInstallationToken.ts`
- Create: `src/adapters/github/githubReviewPublisher.ts`
- Test: `src/adapters/github/__tests__/githubAppInstallationToken.test.ts`
- Test: `src/adapters/github/__tests__/githubReviewPublisher.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing GitHub adapter tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGitHubReviewPublisher } from "../githubReviewPublisher.js";

describe("createGitHubReviewPublisher", () => {
  it("publishes validated review findings through a server-side installation token", async () => {
    const comments: unknown[] = [];
    const publisher = createGitHubReviewPublisher({
      tokenProvider: { async getInstallationToken() { return "installation-token"; } },
      client: {
        async createPullRequestReview(input) {
          comments.push(input);
        },
        async createIssueComment(input) {
          comments.push(input);
        }
      }
    });

    await publisher.publishSkip({
      repositoryFullName: "kei781/sql-agent",
      pullRequestNumber: 42,
      headSha: "abc123",
      reason: "draft"
    });

    assert.equal((comments[0] as { token?: string }).token, "installation-token");
  });
});
```

- [ ] **Step 2: Run GitHub adapter tests and confirm they fail**

Run: `npm run build && node --test "dist/adapters/github/__tests__/githubReviewPublisher.test.js"`

Expected: FAIL because the publisher does not exist.

- [ ] **Step 3: Implement token provider and publisher**

```ts
export interface GitHubInstallationTokenProvider {
  getInstallationToken(repositoryFullName: string): Promise<string>;
}

export function createGitHubReviewPublisher(options: GitHubReviewPublisherOptions): ReviewPublisherPort & FollowUpPublisherPort {
  return {
    async publishReview(result) {
      const token = await options.tokenProvider.getInstallationToken(result.repositoryFullName);
      await options.client.createPullRequestReview({
        token,
        repositoryFullName: result.repositoryFullName,
        pullRequestNumber: result.pullRequestNumber,
        body: renderReviewBody(result),
        comments: result.findings.flatMap(renderFindingComments)
      });
    },
    async publishFailure(failure) {
      const token = await options.tokenProvider.getInstallationToken(failure.repositoryFullName);
      await options.client.createIssueComment({ token, repositoryFullName: failure.repositoryFullName, issueNumber: failure.pullRequestNumber, body: renderFailureBody(failure) });
    },
    async publishSkip(skip) {
      const token = await options.tokenProvider.getInstallationToken(skip.repositoryFullName);
      await options.client.createIssueComment({ token, repositoryFullName: skip.repositoryFullName, issueNumber: skip.pullRequestNumber, body: renderSkipBody(skip) });
    }
  };
}
```

- [ ] **Step 4: Run GitHub adapter tests and full check**

Run: `npm run check`

Expected: PASS.

## Task 5: Documentation and Phase Metadata

**Files:**
- Modify: `docs/architecture/directory-structure.md`
- Modify: `docs/IMPLEMENTATION_PHASES.md`
- Modify: `docs/phase-plan.md`
- Modify: `docs/구현내용.md`
- Modify: `src/project/phase-plan.ts`

- [ ] **Step 1: Update phase wording**

Use these exact status facts:

```text
Phase 3A implemented: bootable HTTP/pm2 runtime.
Phase 3B implemented in this PR: GitHub payload mapping, GitHub server-side publication, git workspace preparation, and SQLite state store adapters.
Phase 3C still planned: Claude Code orchestrator adapter, egress guard, agent environment scrubber, timeout handling.
```

- [ ] **Step 2: Run documentation and phase tests**

Run: `npm run check`

Expected: PASS, including phase-plan expectations.

## Task 6: Final Verification and PR

**Files:**
- All changed files.

- [ ] **Step 1: Scan for forbidden direct env/log usage**

Run:

```powershell
rg -n "process\.env|console\.log" src scripts --glob "!src/shared/config.ts"
```

Expected: no direct `process.env` reads outside `src/shared/config.ts` and no direct `console.log()` calls.

- [ ] **Step 2: Run complete check**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 3: Commit, push, and open PR**

```powershell
git status --short
git add .
git commit -m "feat: add phase 3b runtime adapters"
git push -u origin codex/phase3b-github-workspace-state-adapters
gh pr create --title "Phase 3B GitHub workspace state adapters" --body "Implements Phase 3B adapter layer for GitHub payload mapping, server-side publication, git workspace preparation, and SQLite state persistence."
```

Expected: PR URL is printed and the branch contains only Phase 3B changes.

## Self-Review

- Spec coverage: The plan covers Phase 3B mapper, token provider, publisher, git workspace adapter, SQLite state store, fake-client tests, fake-command tests, temporary DB tests, docs, and final verification. Phase 3C orchestrator and egress guard are intentionally excluded.
- Placeholder scan: No implementation step relies on an unnamed future component. All module paths and expected commands are explicit.
- Type consistency: Adapter factories consume app port types already exported from `src/app`, and new GitHub client/token/command runner interfaces are owned by adapter modules.
