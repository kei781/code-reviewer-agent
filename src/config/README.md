# Config Boundary

Runtime configuration belongs here only when it is independent of a specific workflow runner.

Do not hard-code model vendors or secrets in reusable domain modules.

`config.ts` is the only source module that may read `process.env`. All runtime code should import the compiled `config.js` module instead of reading environment variables directly.
