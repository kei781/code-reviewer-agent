export type PhaseId =
  | "phase-0"
  | "phase-1"
  | "phase-2"
  | "phase-3a"
  | "phase-3b"
  | "phase-3c"
  | "phase-3d";

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
      "Respond to explicit reviewer mentions or commands while leaving any follow-up development decision to a human maintainer.",
    sourceRequirement: "ADR/PRD explicit reviewer follow-up requirement",
    status: "implemented",
    deliverables: ["Mention parser", "Follow-up response contract", "SHA-aware dedupe tests", "Human handoff boundary"],
  },
  {
    id: "phase-3a",
    title: "Bootable self-hosted webhook server runtime",
    description:
      "Add the pm2-runnable Node.js HTTP entrypoint, health route, signed GitHub webhook intake, and startup scripts without wiring concrete review adapters yet.",
    sourceRequirement: "Phase 3A in docs/superpowers/specs/2026-06-09-self-hosted-webhook-server-runtime-design.md",
    status: "implemented",
    deliverables: [
      "Node HTTP server entrypoint",
      "GET /healthz route",
      "POST /webhooks/github route with raw-body signature verification",
      "Phase 3A event recognition and safe 202 acknowledgement",
      "npm start, npm run serve, and pm2 ecosystem config",
    ],
  },
  {
    id: "phase-3b",
    title: "GitHub, workspace, and persistent state adapters",
    description:
      "Add concrete adapter modules for GitHub payload mapping, server-side GitHub App publication, git workspace preparation, and SQLite review state persistence.",
    sourceRequirement: "Phase 3B in docs/superpowers/specs/2026-06-09-self-hosted-webhook-server-runtime-design.md",
    status: "implemented",
    deliverables: [
      "GitHub webhook payload mapper for pull_request and issue_comment events",
      "GitHub App installation token provider with server-side JWT signing",
      "GitHub review publisher adapter that posts comments without approvals",
      "Git workspace adapter pinned to the webhook head SHA",
      "SQLite review and follow-up state store",
    ],
  },
  {
    id: "phase-3c",
    title: "Claude Code orchestrator runtime adapter",
    description:
      "Add the guarded Claude Code orchestration adapter that runs the local OAuth-authenticated Claude Code command, scrubs agent environment, enforces model egress setup, and returns structured review results.",
    sourceRequirement: "Phase 3C in docs/superpowers/specs/2026-06-09-self-hosted-webhook-server-runtime-design.md",
    status: "implemented",
    deliverables: [
      "Claude Code orchestrator adapter behind the existing app port",
      "Structured JSON output contract for server-side publication",
      "Model egress guard abstraction with fail-closed behavior",
      "Agent environment scrubber that excludes server-side GitHub secrets",
      "Command runner replace-env mode for local agent sessions",
      "PR-checkout cwd separation for agent launch",
      "Failure-path tests for independent review execution",
    ],
  },
  {
    id: "phase-3d",
    title: "Runtime webhook dispatch wiring",
    description:
      "Connect recognized GitHub webhook deliveries to the existing review and reviewer-mention app use cases through explicit dispatcher, metadata, and follow-up responder adapters.",
    sourceRequirement: "Final dispatch wiring in docs/superpowers/specs/2026-06-09-self-hosted-webhook-server-runtime-design.md",
    status: "implemented",
    deliverables: [
      "HTTP callback payload forwarding with immediate 202 acknowledgement",
      "Webhook dispatcher for pull_request and issue_comment use-case routing",
      "GitHub PR changed-path and metadata reads behind installation-token-backed adapters",
      "Claude Code follow-up responder adapter with analysis-only output validation",
      "Runtime server factory hook for dispatcher injection",
      "Phase 3D SDD plan and implementation notes",
    ],
  },
] as const satisfies readonly PhaseDefinition[];

export function getFirstBlockedPhase(): PhaseDefinition | undefined {
  return (implementationPhases as readonly PhaseDefinition[]).find(
    (phase) => phase.status === "blocked-until-pr-comments-resolved"
  );
}
