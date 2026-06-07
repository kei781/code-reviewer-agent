#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function log(message, metadata = undefined) {
  const suffix = metadata === undefined ? "" : ` ${JSON.stringify(metadata)}`;
  process.stdout.write(`[setup] ${message}${suffix}\n`);
}

function run(command, args) {
  log(`Running ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.status !== 0) {
    const errorMessage = result.error === undefined ? "" : `: ${result.error.message}`;
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}${errorMessage}`);
  }
}

function runNpm(args) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, ...args]);
    return;
  }

  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "npm", ...args]);
    return;
  }

  run("npm", args);
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
  log("Ensured directory", { path });
}

function ensureFile(path, content) {
  if (existsSync(path)) {
    log("Kept existing file", { path });
    return;
  }

  writeFileSync(path, content);
  log("Created file", { path });
}

function cleanDirectory(path) {
  if (!existsSync(path)) {
    log("Skipped missing directory", { path });
    return;
  }

  rmSync(path, { recursive: true, force: true });
  log("Cleaned directory", { path });
}

function readPackageJson() {
  return JSON.parse(readFileSync("package.json", "utf8"));
}

function logVoltaPins(packageJson) {
  const volta = packageJson.volta;
  if (volta === undefined) {
    return;
  }

  log("Using package Volta pins", {
    node: volta.node,
    npm: volta.npm
  });
}

const majorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (majorVersion < 24) {
  throw new Error(`Node.js >=24 is required for this setup script. Current version is ${process.versions.node}.`);
}

logVoltaPins(readPackageJson());

const requiredDirectories = [
  ".github/ai/prompts",
  "docs/architecture",
  "docs/superpowers/plans",
  "src/adapters",
  "src/agents",
  "src/app",
  "src/domain",
  "src/orchestration",
  "src/project",
  "src/shared"
];

for (const directory of requiredDirectories) {
  ensureDirectory(directory);
}

ensureFile(
  join(".github", "ai", "prompts", "README.md"),
  [
    "# Prompt Directory",
    "",
    "P0 prompt files describe review-server roles. Provider-specific wiring belongs in adapters or external review-server configuration.",
    ""
  ].join("\n")
);

ensureFile(".env", readFileSync(".env.example", "utf8"));

runNpm(["install"]);
cleanDirectory("dist");
run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
run(process.execPath, ["--test", "dist/**/*.test.js"]);

log("Setup finished");
