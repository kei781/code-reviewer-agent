#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";

const distPath = "dist";

if (existsSync(distPath)) {
  rmSync(distPath, { recursive: true, force: true });
}
