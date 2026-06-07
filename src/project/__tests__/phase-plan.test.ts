import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

  it("marks phase 2 as the current implementation phase", () => {
    const currentPhase = implementationPhases.find((phase) => phase.id === "phase-2");

    assert.equal(currentPhase?.status, "implementing");
  });

  it("records merged phases as implemented without stale review blockers", () => {
    const phase0 = implementationPhases.find((phase) => phase.id === "phase-0");
    const phase1 = implementationPhases.find((phase) => phase.id === "phase-1");
    const firstBlockedPhase = getFirstBlockedPhase();

    assert.equal(phase0?.status, "implemented");
    assert.equal(phase1?.status, "implemented");
    assert.equal(firstBlockedPhase, undefined);
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

  it("pins the local checkout to the webhook head SHA before agent review", () => {
    const plan = buildReviewServerRunPlan(context);

    assert.deepEqual(
      plan.workspaceCommands.map((command) => command.args),
      [
        ["clone", "https://github.com/kei781/sql-agent.git", "/tmp/sql-agent-pr-42"],
        ["fetch", "--no-tags", "origin", "feature/sql-guard"],
        ["checkout", "--detach", "abc123"]
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

describe("setup bootstrap", () => {
  it("provides a POSIX shell bootstrap that installs Node locally before running setup", () => {
    const script = readFileSync("scripts/setup.sh", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8");
    const gitAttributes = readFileSync(".gitattributes", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    assert.match(script, /^#!\/bin\/sh/u);
    assert.match(script, /nodejs\.org\/dist\/v\$NODE_VERSION/u);
    assert.match(script, /\.tools\/node/u);
    assert.match(script, /scripts\/setup\.mjs/u);
    assert.doesNotMatch(script, /\bsudo\b/u);
    assert.match(gitignore, /^\.tools\/$/mu);
    assert.match(gitAttributes, /^scripts\/\*\.sh text eol=lf$/mu);
    assert.equal(packageJson.scripts?.["setup:sh"], "sh scripts/setup.sh");
  });
});

describe("P0 workflow boundary", () => {
  it("does not keep repository-hosted AI review workflow YAML files", () => {
    const workflowFiles = readdirSync(".github/workflows").filter((fileName) => /\.(ya?ml)$/u.test(fileName));

    assert.deepEqual(workflowFiles, []);
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

  it("keeps app use cases independent from orchestration module types", () => {
    const appSource = readFileSync("src/app/runEnsembleReview.ts", "utf8");

    assert.doesNotMatch(appSource, /\.\.\/orchestration\//u);
  });
});
