# Shared

Project-agnostic helpers live here.

Allowed:

- logging primitives,
- small formatting helpers,
- generic value helpers,
- generic TypeScript types,
- runtime configuration parsing that is independent of any specific adapter or workflow runner.

Not allowed:

- PR review policy,
- model role policy,
- GitHub event policy,
- adapter calls,
- shell execution.

All application logging should go through `log()` from `src/shared/log.ts`. The default sink writes to standard output, but callers should not write to the console directly.

`config.ts` is the only source module that may read `process.env`. Runtime code should import the compiled `shared/config.js` module instead of reading environment variables directly, so configuration changes stay localized.
