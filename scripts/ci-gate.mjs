#!/usr/bin/env node
// CI gate: build all workspaces then run all tests. Exits non-zero on any failure.
import { execSync } from "node:child_process";

const run = (cmd) => {
  console.log(`[ci-gate] Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
};

function shouldRunE2EGate() {
  const explicit = process.env.BTA_RUN_E2E_GATE;
  if (explicit === "1") return true;
  if (explicit === "0") return false;
  return process.env.CI === "true";
}

try {
  run("npm run validate:env -w @bta/realtime-api");
} catch {
  console.error("[ci-gate] Environment validation failed.");
  process.exit(1);
}

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

try {
  run("npm run check:silent-errors");
} catch {
  console.error("[ci-gate] Silent error check failed.");
  process.exit(1);
}

if (shouldRunE2EGate()) {
  try {
    run("npm run smoke-test");
  } catch {
    console.error("[ci-gate] Smoke test failed.");
    process.exit(1);
  }

  try {
    run("npm run audit:ui");
  } catch {
    console.error("[ci-gate] UI audit failed.");
    process.exit(1);
  }
} else {
  console.log("[ci-gate] Skipping smoke-test and audit:ui (set BTA_RUN_E2E_GATE=1 to enable).");
}

console.log("[ci-gate] All checks passed.");
