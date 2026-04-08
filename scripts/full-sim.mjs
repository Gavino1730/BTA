#!/usr/bin/env node

import { spawn } from "node:child_process";

const API_URL = "http://localhost:4000/health";
const COACH_URL = "http://localhost:5173";
const OPERATOR_URL = "http://localhost:5174";

function parseArgs(argv) {
  const args = [];
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      args.push(arg);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.push(next);
        i += 1;
      }
    }
  }
  return args;
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

async function waitForUrl(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const stressArgs = parseArgs(process.argv);
  let devProcess;

  try {
    console.log("Starting full stack (api + operator + coach)...");
    devProcess = spawn("npm", ["run", "dev:all"], { shell: true, stdio: "inherit" });

    console.log("Waiting for services to become ready...");
    await waitForUrl(API_URL, 180_000);
    await waitForUrl(COACH_URL, 180_000);
    await waitForUrl(OPERATOR_URL, 180_000);

    console.log("Running E2E fake game flow...");
    await runCommand("npm", ["run", "test:e2e"], "test:e2e");

    console.log("Running API stress simulation...");
    await runCommand("node", ["scripts/stress-test.mjs", ...stressArgs], "stress-test");

    console.log("Full simulation completed successfully.");
  } finally {
    if (devProcess && !devProcess.killed) {
      devProcess.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
