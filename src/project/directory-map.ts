export interface DirectoryRule {
  readonly path: string;
  readonly purpose: string;
  readonly mayDependOn: readonly string[];
  readonly mustNotContain: readonly string[];
}

export const directoryRules = [
  {
    path: "src/domain",
    purpose: "Pure reusable policies, typed contracts, state machines, and convergence rules.",
    mayDependOn: ["src/shared", "src/project"],
    mustNotContain: ["GitHub SDK calls", "model SDK calls", "process.env reads", "filesystem writes", "shell execution"]
  },
  {
    path: "src/app",
    purpose: "Use cases that orchestrate domain rules through injected ports.",
    mayDependOn: ["src/domain", "src/shared", "src/project"],
    mustNotContain: ["hard-coded model vendors", "hard-coded GitHub clients", "merge bypass logic"]
  },
  {
    path: "src/adapters",
    purpose: "Concrete implementations for GitHub, model providers, artifacts, commands, and CI runtimes.",
    mayDependOn: ["src/app", "src/domain", "src/shared", "src/project"],
    mustNotContain: ["new domain policy definitions", "R/F role conflation", "unaudited write-token model loops"]
  },
  {
    path: "src/agents",
    purpose: "P0 agent role specs and same-level harness contracts for Claude Code orchestration and Claude/Codex reviewer passes.",
    mayDependOn: ["src/domain", "src/project"],
    mustNotContain: ["GitHub tokens", "model API keys", "shell execution", "network calls"]
  },
  {
    path: "src/orchestration",
    purpose: "Side-effect-free P0 review-server run-plan scaffold that assembles git sync commands and agent harnesses.",
    mayDependOn: ["src/agents", "src/domain", "src/project", "src/shared"],
    mustNotContain: ["direct shell execution", "GitHub SDK calls", "model SDK calls", "secret reads"]
  },
  {
    path: "src/shared",
    purpose: "Project-agnostic utility helpers such as logging.",
    mayDependOn: [],
    mustNotContain: ["PR review policy", "model role policy", "GitHub event policy"]
  },
  {
    path: "src/project",
    purpose: "Repository-local constants and implementation metadata derived from ADR.md and PRD.md.",
    mayDependOn: [],
    mustNotContain: ["runtime adapter side effects", "network calls", "write-token logic"]
  }
] as const satisfies readonly DirectoryRule[];
