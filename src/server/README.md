# src/server

Process startup and thin HTTP route layer for the self-hosted review server runtime.

This layer may:

- Open the Node.js HTTP server through `cli.ts`.
- Handle health and webhook routes.
- Read typed config objects from `src/shared/config.ts` callers.
- Delegate GitHub-specific parsing and verification to adapters.

This layer must not:

- Define reusable review policy.
- Call GitHub SDKs directly.
- Execute git or model commands directly.
- Approve, merge, resolve threads, or modify PR code.
