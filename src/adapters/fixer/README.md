# Fixer Adapter Boundary

Fixer adapters are reserved for P1+.

Rules:

- Analyze jobs propose patch artifacts with read-only repository permissions.
- Apply jobs, not models, own write permissions.
- Do not add fixer code to P0 review-server execution or reviewer harnesses.
