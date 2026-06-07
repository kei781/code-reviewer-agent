# Fixer Adapters

Fixer adapters are future P1+ scope.

Do not add write-token fixer behavior in Phase 0. When P1 begins, fixer adapters must:

- require explicit `ai-autofix` opt-in,
- process only actionable reviewer markers,
- produce patch artifacts before any apply job,
- avoid risky paths and fork PR secret/write access.
