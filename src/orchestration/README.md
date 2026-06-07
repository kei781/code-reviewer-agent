# Orchestration

P0 orchestration code builds side-effect-free review-server run plans.

Allowed:

- assemble clone, fetch, and head-SHA checkout command plans,
- assemble orchestrator and reviewer harness text,
- combine domain/project/agent metadata into typed plans.

Not allowed:

- execute shell commands directly,
- read secrets,
- call GitHub SDKs,
- call model SDKs,
- post PR comments.

Concrete execution belongs behind app ports and adapter implementations in later phases.
