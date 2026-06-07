import type { PhaseDefinition } from "../../shared/phase.js";

export const implementationPhases = [
  {
    id: "P0",
    title: "Review-server Cross-validation MVP",
    goal:
      "Run a webhook-driven local review-server flow where Claude Code orchestrates independent Claude Code and Codex reviews and publishes only codebase-validated findings.",
    entryCriteria: [
      "Root ADR.md and PRD.md v5 have been reviewed.",
      "Codex is installed, Claude Code is installed, and Claude Code can invoke Codex through plugin/tooling."
    ],
    exitCriteria: [
      "Directory boundaries are documented.",
      "GitHub PR events are delivered to the review server by webhook.",
      "The review server prepares the local codebase with git clone, fetch, and checkout pinned to the webhook head SHA.",
      "Agent topology is explicit: orchestrator = Claude Code, reviewer 1 = Claude Code, reviewer 2 = Codex.",
      "Each agent module has a same-level harness file.",
      "Cross-validation requires inspecting the local checkout before publishing findings.",
      "P0 remains review-only: no code edits, formal approval, thread resolve, or merge automation.",
      "After comments are posted, a human maintainer decides whether to resolve or request additional development."
    ],
    ownsDirectories: ["docs/", "src/agents/", "src/orchestration/", "src/domain/review/", ".github/ai/"],
    status: "complete"
  }
] as const satisfies readonly PhaseDefinition[];
