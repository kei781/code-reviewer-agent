# Config Boundary

Runtime configuration belongs here only when it is independent of a specific workflow runner.

Do not hard-code model vendors or secrets in reusable domain modules.

`reviewServerRuntimeConfig.ts` defines the required self-hosted review-server environment contract. It is a pure parser: concrete server/adapters pass an environment source into it, and this module does not read `process.env` directly.
