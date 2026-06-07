# Shared

Project-agnostic helpers live here.

Allowed:

- logging primitives,
- small formatting helpers,
- generic value helpers,
- generic TypeScript types.

Not allowed:

- PR review policy,
- model role policy,
- GitHub event policy,
- adapter calls,
- shell execution.

All application logging should go through `log()` from `src/shared/log.ts`. The default sink writes to standard output, but callers should not write to the console directly.
