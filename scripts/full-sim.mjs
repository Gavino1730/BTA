#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const API_URL = "http://localhost:4000/health";
const COACH_URL = "http://localhost:5173";
const OPERATOR_URL = "http://localhost:5174";
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1500;
const DEFAULT_WAIT_TIMEOUT_MS = 180_000;

function printUsage() {
  console.log("Usage: npm run test:full-sim -- [full-sim options] [stress-test options]");
  console.log("");
  console.log("Full-sim options:");
  console.log("  --attempts <n>           Retry attempts for e2e and stress phases (default: 2)");
  console.log("  --retry-delay-ms <ms>    Delay between retries in milliseconds (default: 1500)");
  console.log("  --wait-timeout-ms <ms>   Service readiness timeout in milliseconds (default: 180000)");
  console.log("  --report-json <path>     Write run report as JSON (optional)");
  console.log("  --help                   Show this help and exit");
  console.log("");
  console.log("Forwarded to stress-test (examples):");
  console.log("  --games <n> --events <n> --concurrency <n>");
}

function parseNumberArg(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseArgs(argv) {
  const stressArgs = [];
  const fullSim = {
    attempts: DEFAULT_ATTEMPTS,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    waitTimeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
    reportJsonPath: "",
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }

    const next = argv[i + 1];
    const hasValue = Boolean(next) && !next.startsWith("--");

    if (arg === "--help" || arg === "-h") {
      fullSim.help = true;
      continue;
    }

    if (arg === "--attempts") {
      fullSim.attempts = parseNumberArg(hasValue ? next : undefined, DEFAULT_ATTEMPTS);
      if (hasValue) i += 1;
      continue;
    }

    if (arg === "--retry-delay-ms") {
      fullSim.retryDelayMs = parseNumberArg(hasValue ? next : undefined, DEFAULT_RETRY_DELAY_MS);
      if (hasValue) i += 1;
      continue;
    }

    if (arg === "--wait-timeout-ms") {
      fullSim.waitTimeoutMs = parseNumberArg(hasValue ? next : undefined, DEFAULT_WAIT_TIMEOUT_MS);
      if (hasValue) i += 1;
      continue;
    }

    if (arg === "--report-json") {
      fullSim.reportJsonPath = hasValue ? String(next) : "";
      if (hasValue) i += 1;
      continue;
    }

    stressArgs.push(arg);
    if (hasValue) {
      stressArgs.push(next);
      i += 1;
    }
  }

  return { fullSim, stressArgs };
}

async function writeRunReport(reportPath, report) {
  if (!reportPath) {
    return;
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote full-sim report: ${reportPath}`);
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const commandLine = [command, ...args].join(" ");
    const child = spawn(commandLine, [], { shell: true, stdio: "inherit" });
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

async function runCommandWithRetry(command, args, label, maxAttempts = DEFAULT_ATTEMPTS, retryDelayMs = DEFAULT_RETRY_DELAY_MS) {
  let attempt = 1;
  let lastError;

  while (attempt <= maxAttempts) {
    try {
      if (attempt > 1) {
        console.log(`Retrying ${label} (attempt ${attempt}/${maxAttempts})...`);
      }
      await runCommand(command, args, label);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    attempt += 1;
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
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

async function isUrlReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function isStackReady() {
  const [apiReady, coachReady, operatorReady] = await Promise.all([
    isUrlReady(API_URL),
    isUrlReady(COACH_URL),
    isUrlReady(OPERATOR_URL),
  ]);
  return apiReady && coachReady && operatorReady;
}

async function main() {
  const { fullSim, stressArgs } = parseArgs(process.argv);

  if (fullSim.help) {
    printUsage();
    return;
  }

  let devProcess;
  let startedStack = false;
  const startedAt = new Date().toISOString();
  const runStarted = Date.now();
  const phaseDurationsMs = {
    readiness: 0,
    e2e: 0,
    stress: 0,
  };
  let failureError = null;
  let status = "success";

  try {
    console.log(`Full-sim config: attempts=${fullSim.attempts}, retryDelayMs=${fullSim.retryDelayMs}, waitTimeoutMs=${fullSim.waitTimeoutMs}`);

    if (await isStackReady()) {
      console.log("Detected running stack; reusing existing api + operator + coach services.");
    } else {
      console.log("Starting full stack (api + operator + coach)...");
      const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
      devProcess = spawn(npmCommand, ["run", "dev:all"], { shell: false, stdio: "inherit" });
      startedStack = true;
    }

    console.log("Waiting for services to become ready...");
    const readinessStart = Date.now();
    await waitForUrl(API_URL, fullSim.waitTimeoutMs);
    await waitForUrl(COACH_URL, fullSim.waitTimeoutMs);
    await waitForUrl(OPERATOR_URL, fullSim.waitTimeoutMs);
    phaseDurationsMs.readiness = Date.now() - readinessStart;

    console.log("Running E2E fake game flow...");
    const e2eStart = Date.now();
    await runCommandWithRetry("npm", ["run", "test:e2e"], "test:e2e", fullSim.attempts, fullSim.retryDelayMs);
    phaseDurationsMs.e2e = Date.now() - e2eStart;

    console.log("Running API stress simulation...");
    const stressStart = Date.now();
    await runCommandWithRetry("node", ["scripts/stress-test.mjs", ...stressArgs], "stress-test", fullSim.attempts, fullSim.retryDelayMs);
    phaseDurationsMs.stress = Date.now() - stressStart;

    console.log("Full simulation completed successfully.");
  } catch (error) {
    status = "failed";
    failureError = error;
    throw error;
  } finally {
    if (startedStack && devProcess && !devProcess.killed) {
      devProcess.kill("SIGTERM");
    }

    const endedAt = new Date().toISOString();
    const report = {
      status,
      startedAt,
      endedAt,
      totalDurationMs: Date.now() - runStarted,
      startedStack,
      config: {
        attempts: fullSim.attempts,
        retryDelayMs: fullSim.retryDelayMs,
        waitTimeoutMs: fullSim.waitTimeoutMs,
        stressArgs,
      },
      phaseDurationsMs,
      error: failureError instanceof Error ? failureError.message : null,
    };

    await writeRunReport(fullSim.reportJsonPath, report);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
