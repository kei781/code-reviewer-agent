import type { Server } from "node:http";
import { loadConfig, type Config, type ConfigLoadResult, type ConfigKey, type OptionalConfigKey } from "../shared/config.js";
import { log } from "../shared/log.js";
import { createReviewHttpServer } from "./httpServer.js";

export interface ConfigFailureSummary {
  readonly missingKeys: readonly ConfigKey[];
  readonly invalidKeys: readonly (ConfigKey | OptionalConfigKey)[];
}

export function createRuntimeServer(config: Config): Server {
  return createReviewHttpServer({
    webhookSecret: config.github.webhookSecret,
    repoAllowlist: config.repoAllowlist
  });
}

export function summarizeConfigFailure(result: Extract<ConfigLoadResult, { readonly ok: false }>): ConfigFailureSummary {
  return {
    missingKeys: result.missingKeys,
    invalidKeys: result.invalidValues.map((invalidValue) => invalidValue.key)
  };
}

export function closeReviewServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function main(): Promise<void> {
  const loadedConfig = loadConfig();

  if (!loadedConfig.ok) {
    const summary = summarizeConfigFailure(loadedConfig);
    log("review server config failed", {
      level: "error",
      metadata: {
        missingKeys: summary.missingKeys,
        invalidKeys: summary.invalidKeys
      }
    });
    process.exitCode = 1;
    return;
  }

  const server = createRuntimeServer(loadedConfig.config);
  installShutdownHandlers(server);
  await listen(server, loadedConfig.config.server.host, loadedConfig.config.server.port);
  log("review server started", {
    level: "info",
    metadata: {
      host: loadedConfig.config.server.host,
      port: loadedConfig.config.server.port
    }
  });
}

function installShutdownHandlers(server: Server): void {
  const shutdown = (signal: NodeJS.Signals): void => {
    void closeReviewServer(server).then(
      () => {
        log("review server stopped", { level: "info", metadata: { signal } });
      },
      (error: unknown) => {
        log("review server shutdown failed", {
          level: "error",
          metadata: { signal, message: error instanceof Error ? error.message : "unknown error" }
        });
        process.exitCode = 1;
      }
    );
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
