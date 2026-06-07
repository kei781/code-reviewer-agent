import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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

    assert.deepEqual(ids, ["phase-0", "phase-1", "phase-2"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("marks every planned implementation phase as implemented", () => {
    assert.deepEqual(
      implementationPhases.map((phase) => [phase.id, phase.status]),
      [
        ["phase-0", "implemented"],
        ["phase-1", "implemented"],
        ["phase-2", "implemented"]
      ]
    );
  });

  it("records no active implementation phase or stale review blocker", () => {
    const activePhases = implementationPhases.filter((phase) => phase.status !== "implemented");
    const firstBlockedPhase = getFirstBlockedPhase();

    assert.deepEqual(activePhases, []);
    assert.equal(firstBlockedPhase, undefined);
  });

  it("keeps the active implementation scope review-only with human handoff", () => {
    const activePhaseText = JSON.stringify(implementationPhases);
    const staleRuntimeFiles = listSourceFiles("src").filter((path) =>
      /[\\/]fixer[\\/]|autofixPolicy|modelPairPolicy|[\\/]convergence[\\/]|[\\/]merge[\\/]|[\\/]operations[\\/]/u.test(path)
    );
    const indexSource = readFileSync("src/index.ts", "utf8");

    assert.deepEqual(staleRuntimeFiles, []);
    assert.doesNotMatch(activePhaseText, /fixer|autofix|auto-merge|automerge|convergence/iu);
    assert.doesNotMatch(indexSource, /Autofix|ActionableMarker|ModelPair|Convergence|MergeGate|Autonomous|Operational/u);
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

    assert.deepEqual(plan.setupRequirements, [
      "codex-cli-installed",
      "claude-code-installed",
      "claude-code-codex-plugin-connected"
    ]);
    assert.match(plan.reviewerHarnesses.claudeCode, /Work independently from Codex/);
    assert.match(plan.reviewerHarnesses.codex, /Work independently from Claude Code/);
    assert.match(plan.orchestratorHarness, /cross-validate/);
  });
});

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return listSourceFiles(path);
    }

    return path.endsWith(".ts") ? [path] : [];
  });
}

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
  it("provides Volta pins and a POSIX bootstrap that installs pinned Node before running setup", () => {
    const script = readFileSync("scripts/setup.sh", "utf8");
    const nodeSetupScript = readFileSync("scripts/setup.mjs", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8");
    const gitAttributes = readFileSync(".gitattributes", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      engines?: Record<string, string>;
      scripts?: Record<string, string>;
      volta?: Record<string, string>;
    };

    assert.equal(packageJson.engines?.node, ">=24.0.0");
    assert.equal(packageJson.volta?.node, "24.14.0");
    assert.equal(packageJson.volta?.npm, "10.9.0");
    assert.match(script, /^#!\/bin\/sh/u);
    assert.match(script, /NPM_VERSION="\$\{NPM_VERSION:-10\.9\.0\}"/u);
    assert.match(script, /volta install "node@\$NODE_VERSION" "npm@\$NPM_VERSION"/u);
    assert.match(script, /nodejs\.org\/dist\/v\$NODE_VERSION/u);
    assert.match(script, /\.tools\/node/u);
    assert.match(script, /scripts\/setup\.mjs/u);
    assert.match(nodeSetupScript, /readFileSync\("\.env\.example"/u);
    assert.match(nodeSetupScript, /ensureFile\("\.env"/u);
    assert.match(nodeSetupScript, /cleanDirectory\("dist"\)/u);
    assert.doesNotMatch(script, /\bsudo\b/u);
    assert.match(gitignore, /^\.tools\/$/mu);
    assert.match(gitignore, /^\.env$/mu);
    assert.match(gitignore, /^!.env\.example$/mu);
    assert.match(gitAttributes, /^scripts\/\*\.sh text eol=lf$/mu);
    assert.equal(packageJson.scripts?.clean, "node scripts/clean-dist.mjs");
    assert.match(packageJson.scripts?.build ?? "", /^npm run clean && /u);
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
    assert.ok(adapterRule.mustNotContain.includes("hidden reviewer context sharing"));
  });

  it("keeps app use cases independent from orchestration module types", () => {
    const appSource = readFileSync("src/app/runEnsembleReview.ts", "utf8");

    assert.doesNotMatch(appSource, /\.\.\/orchestration\//u);
  });
});
