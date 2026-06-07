export type PhaseId = "phase-0" | "phase-1" | "phase-2" | "phase-3" | "phase-4" | "phase-5" | "phase-6";

export type PhaseStatus = "implemented" | "implementing" | "blocked-until-pr-comments-resolved" | "planned";

export interface PhaseDefinition {
  readonly id: PhaseId;
  readonly title: string;
  readonly description: string;
  readonly sourceRequirement: string;
  readonly status: PhaseStatus;
  readonly deliverables: readonly string[];
}

export const implementationPhases = [
  {
    id: "phase-0",
    title: "Repository structure and agent guardrails",
    description:
      "Create a clear TypeScript project structure, setup automation, logging, and durable agent rules before implementing runtime automation.",
    sourceRequirement: "User-requested phase0 plus ADR/PRD P0 readiness guidance",
    status: "implemented",
    deliverables: [
      "Strict TypeScript baseline",
      "Human-readable source directory boundaries",
      "Setup command for required local project infrastructure",
      "Central log() helper for replaceable logging",
      "Future-agent guardrails in AGENTS.md",
      "Phase plan documenting PR-by-PR progression",
    ],
  },
  {
    id: "phase-1",
    title: "P0 Review-server Cross-validation MVP",
    description:
      "Receive PR webhooks on the review server, prepare a local checkout, run independent Claude Code/Codex reviews, and publish only codebase-validated findings.",
    sourceRequirement: "ADR/PRD P0 Review-server Cross-validation MVP",
    status: "implemented",
    deliverables: [
      "Webhook intake port",
      "Local git workspace adapter",
      "Independent reviewer pass adapters",
      "Codebase-backed cross-validation and PR comment posting",
    ],
  },
  {
    id: "phase-2",
    title: "P0 follow-up reviewer interactions",
    description:
      "Respond to explicit reviewer mentions or commands while keeping review signals separate from approval.",
    sourceRequirement: "ADR/PRD explicit reviewer follow-up requirement",
    status: "implemented",
    deliverables: ["Mention parser", "Follow-up response contract", "SHA-aware dedupe tests"],
  },
  {
    id: "phase-3",
    title: "P1 Frontier Pair Autofix Pilot",
    description:
      "Allow opt-in fixer analysis for actionable blockers while keeping model patch generation separate from write-token apply jobs.",
    sourceRequirement: "ADR/PRD P1 optional fixer autofix",
    status: "implemented",
    deliverables: ["Actionable marker schema", "Model-pair independence gate", "Autofix eligibility policy"],
  },
  {
    id: "phase-4",
    title: "P1 delta verification and convergence state",
    description:
      "Re-review fixer deltas and declare convergence only when unresolved blockers are zero on the latest head SHA.",
    sourceRequirement: "ADR/PRD blocker-fixpoint convergence",
    status: "implemented",
    deliverables: ["State machine", "Hidden marker parser", "Round cap and oscillation handling"],
  },
  {
    id: "phase-5",
    title: "P2-H Conservative Merge Gate",
    description:
      "Publish branch-protection-compatible verdict checks while preserving human final review.",
    sourceRequirement: "ADR/PRD P2-H conservative gate",
    status: "implemented",
    deliverables: ["ai-review/verdict abstraction", "Required check outcomes", "Native auto-merge policy"],
  },
  {
    id: "phase-6",
    title: "P2-A approval and P3 operations guardrails",
    description:
      "Model low-risk autonomous readiness and operational follow-up without enabling side effects before explicit policy approval.",
    sourceRequirement: "ADR/PRD P2-A/P3 future scope",
    status: "implementing",
    deliverables: ["P2-A approval gate", "Low-risk path policy", "Operational alert plan", "Recovery runbook selection"],
  },
] as const satisfies readonly PhaseDefinition[];

export function getFirstBlockedPhase(): PhaseDefinition | undefined {
  return (implementationPhases as readonly PhaseDefinition[]).find(
    (phase) => phase.status === "blocked-until-pr-comments-resolved"
  );
}
