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
      "P0 remains review-only: no code edits, formal approval, thread resolve, or merge automation."
    ],
    ownsDirectories: ["docs/", "src/agents/", "src/orchestration/", "src/domain/review/", ".github/ai/"],
    status: "complete"
  },
  {
    id: "P1",
    title: "Frontier Pair Autofix Pilot",
    goal: "Add opt-in fixer analysis, policy gates, patch artifact handling, and convergence tracking.",
    entryCriteria: ["P0 review-server cross-validation is merged and validated."],
    exitCriteria: ["Autofix is label-gated, policy-checked, capped, audited, and never runs for fork or risky PRs."],
    ownsDirectories: ["src/domain/policy/", "src/adapters/fixer/", "src/orchestration/", ".github/ai/"],
    status: "planned"
  },
  {
    id: "P2-H",
    title: "Conservative Human-gated Merge Gate",
    goal: "Publish latest-SHA reviewer verdict checks and enable GitHub native auto-merge only after required human and CI gates pass.",
    entryCriteria: ["CI and branch protection exist.", "P1 convergence audit trail is reliable."],
    exitCriteria: ["Merge gate never bypasses required checks, human review, fork/risky-path blocks, or do-not-merge labels."],
    ownsDirectories: ["src/orchestration/", ".github/workflows/"],
    status: "planned"
  },
  {
    id: "P2-A",
    title: "Autonomous Low-risk Merge",
    goal: "Define and pilot narrowly scoped autonomous merge for low-risk PRs after a separate ADR amendment.",
    entryCriteria: ["Separate ADR amendment accepted.", "P2-H is stable in production."],
    exitCriteria: ["Low-risk allowlists, rollback, and manual intervention procedures are documented and enforced."],
    ownsDirectories: ["docs/", "src/domain/policy/", "src/orchestration/"],
    status: "planned"
  },
  {
    id: "P3",
    title: "Advanced Operations",
    goal: "Add operational observability, thread tracking where available, notifications, reporting, and recovery workflows.",
    entryCriteria: ["P2 operating mode is stable."],
    exitCriteria: ["Operational summaries, cost signals, and recovery paths reduce maintainer review overhead."],
    ownsDirectories: ["src/orchestration/", "src/adapters/", "docs/"],
    status: "planned"
  }
] as const satisfies readonly PhaseDefinition[];
