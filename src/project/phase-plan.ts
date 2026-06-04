export type PhaseId = "phase-0" | "phase-1" | "phase-2" | "phase-3" | "phase-4" | "phase-5" | "phase-6";

export type PhaseStatus = "implementing" | "blocked-until-pr-comments-resolved" | "planned";

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
      "Create a clear TypeScript project structure and durable agent rules before implementing runtime automation.",
    sourceRequirement: "User-requested phase0 plus ADR/PRD P0 readiness guidance",
    status: "implementing",
    deliverables: [
      "Strict TypeScript baseline",
      "Human-readable source directory boundaries",
      "Future-agent guardrails in AGENTS.md",
      "Phase plan documenting PR-by-PR progression",
    ],
  },
  {
    id: "phase-1",
    title: "P0 Reviewer Signal MVP",
    description:
      "Review same-repo PRs and publish structured review comments without formal approval, autofix, or merge automation.",
    sourceRequirement: "ADR/PRD P0 Reviewer Signal MVP",
    status: "blocked-until-pr-comments-resolved",
    deliverables: [
      "Same-repo PR guard",
      "Structured review signal schema",
      "Reviewer prompt contract",
      "Review comment renderer and tests",
    ],
  },
  {
    id: "phase-2",
    title: "P0 follow-up reviewer interactions",
    description:
      "Respond to explicit reviewer mentions or commands while keeping review signals separate from approval.",
    sourceRequirement: "ADR/PRD explicit reviewer follow-up requirement",
    status: "planned",
    deliverables: ["Mention parser", "Follow-up response contract", "SHA-aware dedupe tests"],
  },
  {
    id: "phase-3",
    title: "P1 Frontier Pair Autofix Pilot",
    description:
      "Allow opt-in fixer analysis for actionable blockers while keeping model patch generation separate from write-token apply jobs.",
    sourceRequirement: "ADR/PRD P1 optional fixer autofix",
    status: "planned",
    deliverables: ["Actionable marker schema", "Patch artifact contract", "Apply policy gates"],
  },
  {
    id: "phase-4",
    title: "P1 delta verification and convergence state",
    description:
      "Re-review fixer deltas and declare convergence only when unresolved blockers are zero on the latest head SHA.",
    sourceRequirement: "ADR/PRD blocker-fixpoint convergence",
    status: "planned",
    deliverables: ["State machine", "Hidden marker parser", "Round cap and oscillation handling"],
  },
  {
    id: "phase-5",
    title: "P2-H Conservative Merge Gate",
    description:
      "Publish branch-protection-compatible verdict checks while preserving human final review.",
    sourceRequirement: "ADR/PRD P2-H conservative gate",
    status: "planned",
    deliverables: ["ai-review/verdict abstraction", "Required check outcomes", "Native auto-merge policy"],
  },
  {
    id: "phase-6",
    title: "P2-A and P3 advanced operations",
    description:
      "Add low-risk autonomous mode and operations features only after explicit policy approval.",
    sourceRequirement: "ADR/PRD P2-A/P3 future scope",
    status: "planned",
    deliverables: ["Low-risk policy", "Reporting and alert hooks", "Recovery runbooks"],
  },
] as const satisfies readonly PhaseDefinition[];

export function getFirstBlockedPhase(): PhaseDefinition | undefined {
  return implementationPhases.find((phase) => phase.status === "blocked-until-pr-comments-resolved");
}
