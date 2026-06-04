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
    mustNotContain: ["GitHub SDK calls", "model SDK calls", "process.env reads", "filesystem writes", "shell execution"],
  },
  {
    path: "src/app",
    purpose: "Use cases that orchestrate domain rules through injected ports.",
    mayDependOn: ["src/domain", "src/shared", "src/project"],
    mustNotContain: ["hard-coded model vendors", "hard-coded GitHub clients", "merge bypass logic"],
  },
  {
    path: "src/adapters",
    purpose: "Concrete implementations for GitHub, model providers, artifacts, commands, and CI runtimes.",
    mayDependOn: ["src/app", "src/domain", "src/shared", "src/project"],
    mustNotContain: ["new domain policy definitions", "R/F role conflation", "unaudited write-token model loops"],
  },
  {
    path: "src/shared",
    purpose: "Project-agnostic utility helpers.",
    mayDependOn: [],
    mustNotContain: ["PR review policy", "model role policy", "GitHub event policy"],
  },
  {
    path: "src/project",
    purpose: "Repository-local constants and implementation metadata derived from ADR.md and PRD.md.",
    mayDependOn: [],
    mustNotContain: ["runtime adapter side effects", "network calls", "write-token logic"],
  },
] as const satisfies readonly DirectoryRule[];
