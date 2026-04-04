#!/usr/bin/env node
// CI gate: build all workspaces then run all tests. Exits non-zero on any failure.
import { execSync } from "node:child_process";

const run = (cmd) => {
  console.log(`[ci-gate] Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
};

try {
  run("npm run build");
} catch {
  console.error("[ci-gate] Build failed.");
  process.exit(1);
}

try {
  run("npm run test");
} catch {
  console.error("[ci-gate] Tests failed.");
  process.exit(1);
}

console.log("[ci-gate] All checks passed.");
