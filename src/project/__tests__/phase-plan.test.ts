import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReviewServerRunPlan,
  directoryRules,
  getFirstBlockedPhase,
  implementationPhases,
  log,
  resetLogSink,
  setLogSink
} from "../../index.js";

describe("implementation phase plan", () => {
  it("keeps phase identifiers unique and ordered", () => {
    const ids = implementationPhases.map((phase) => phase.id);

    assert.deepEqual(ids, ["phase-0", "phase-1", "phase-2", "phase-3", "phase-4", "phase-5", "phase-6"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("marks phase 0 as the current implementation phase", () => {
    const currentPhase = implementationPhases.find((phase) => phase.id === "phase-0");

    assert.equal(currentPhase?.status, "implementing");
  });

  it("blocks the first future phase until phase 0 PR comments are resolved", () => {
    const firstBlockedPhase = getFirstBlockedPhase();

    assert.equal(firstBlockedPhase?.id, "phase-1");
  });
});

describe("review server run plan", () => {
  const context = {
    repositoryUrl: "https://github.com/kei781/sql-agent.git",
    repositoryFullName: "kei781/sql-agent",
    pullRequestNumber: 42,
    baseBranch: "main",
    headBranch: "feature/sql-guard",
    headSha: "abc123",
    localWorkspacePath: "/tmp/sql-agent-pr-42"
  };

  it("plans local git clone, checkout, and pull before agent review", () => {
    const plan = buildReviewServerRunPlan(context);

    assert.deepEqual(
      plan.workspaceCommands.map((command) => command.args),
      [
        ["clone", "https://github.com/kei781/sql-agent.git", "/tmp/sql-agent-pr-42"],
        ["checkout", "feature/sql-guard"],
        ["pull", "origin", "feature/sql-guard"]
      ]
    );
  });

  it("keeps Claude Code and Codex reviewer harnesses independent", () => {
    const plan = buildReviewServerRunPlan(context);

    assert.match(plan.reviewerHarnesses.claudeCode, /Work independently from Codex/);
    assert.match(plan.reviewerHarnesses.codex, /Work independently from Claude Code/);
    assert.match(plan.orchestratorHarness, /cross-validate/);
  });
});

describe("logger", () => {
  it("routes logs through a replaceable sink", () => {
    const entries: unknown[] = [];
    setLogSink((entry) => {
      entries.push(entry);
    });

    try {
      log("setup started", { level: "info", metadata: { command: "setup" } });
    } finally {
      resetLogSink();
    }

    assert.deepEqual(entries, [
      {
        level: "info",
        message: "setup started",
        metadata: { command: "setup" }
      }
    ]);
  });
});

describe("directory rules", () => {
  it("documents the reusable module boundaries that future agents must preserve", () => {
    const domainRule = directoryRules.find((rule) => rule.path === "src/domain");
    const adapterRule = directoryRules.find((rule) => rule.path === "src/adapters");

    assert.ok(domainRule);
    assert.ok(domainRule.mustNotContain.includes("GitHub SDK calls"));
    assert.ok(adapterRule);
    assert.ok(adapterRule.mustNotContain.includes("R/F role conflation"));
  });
});
