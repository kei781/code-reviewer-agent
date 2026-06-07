# Reviewer Adapter Boundary

Reviewer adapters translate the role-level reviewer contract into a concrete model/action/tool invocation.

Rules:

- Keep vendor-specific configuration in adapter files or review-server inputs only.
- Do not let adapter details leak into `src/domain/**`.
- Reviewer adapters are read-only for P0 and must not submit formal approval as a required merge signal.
