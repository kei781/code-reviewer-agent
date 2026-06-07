# src/app

Application use cases and ports live here.

Current Phase 1 surface:

- `runEnsembleReview.ts`: coordinates P0 webhook review decisions, workspace preparation, independent reviewer orchestration, cross-validation, and publication through injected ports.

Current Phase 2 surface:

- `respondToReviewerMention.ts`: coordinates explicit `issue_comment` reviewer triggers, open same-repo PR guards, atomic comment/head-SHA claims, analysis-only response generation, and publication through injected ports.

Rules:

- App code may depend on `src/domain`, `src/shared`, and `src/project`.
- Concrete GitHub, git, model, filesystem, queue, and database behavior must stay behind ports implemented by `src/adapters`.
- App code must not grant merge authority, hold write-token fixer behavior, or publish formal approvals.
- Review state ports must claim a delivery/head SHA before side effects, expose posted finding fingerprints for dedup, and record structured failures.
- Human-review routing, such as required risky paths or dropped blocker candidates, is represented in the publication summary for adapters to label/comment.
- Follow-up response ports must not expose code mutation, approval, merge, branch-protection, or write-token capabilities. Even fix/merge requests remain analysis-only in P0.
