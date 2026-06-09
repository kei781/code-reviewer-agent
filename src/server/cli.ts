import { log } from "../shared/log.js";
import { main } from "./main.js";

void main().catch((error: unknown) => {
  log("review server startup failed", {
    level: "error",
    metadata: { message: error instanceof Error ? error.message : "unknown error" }
  });
  process.exitCode = 1;
});
