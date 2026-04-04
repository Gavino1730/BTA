import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const targets = [
  {
    name: "operator-tablet",
    url: "http://localhost:5174",
    viewport: { width: 834, height: 1194 }
  },
  {
    name: "coach-desktop",
    url: "http://localhost:5173",
    viewport: { width: 1280, height: 720 }
  }
];

const stackChecks = [
  { name: "api", url: "http://localhost:4000/health" },
  ...targets.map((target) => ({ name: target.name, url: target.url })),
];

async function isUrlReady(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUrlReady(url)) {
      return true;
    }
    await delay(1_000);
  }
  return false;
}

function streamWithPrefix(stream, prefix) {
  stream?.on("data", (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      console.log(`${prefix}${line}`);
    }
  });
}

function stopProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }

    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore cleanup failures.
    }
  }
}

async function ensureStackReady() {
  const readyStates = await Promise.all(stackChecks.map((check) => isUrlReady(check.url)));
  const allReady = readyStates.every(Boolean);
  if (allReady) {
    return { started: false, child: null };
  }

  console.log("UI audit: local stack not detected. Starting `npm run dev:all`...");
  const child = process.platform === "win32"
    ? spawn("npm run dev:all", {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      })
    : spawn("npm", ["run", "dev:all"], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

  streamWithPrefix(child.stdout, "[stack] ");
  streamWithPrefix(child.stderr, "[stack] ");

  const waitResults = await Promise.all(stackChecks.map((check) => waitForUrl(check.url)));
  const failed = stackChecks.filter((_, index) => !waitResults[index]);
  if (failed.length > 0) {
    stopProcessTree(child);
    throw new Error(`UI audit could not start local stack in time: ${failed.map((entry) => entry.name).join(", ")}`);
  }

  return { started: true, child };
}

const artifacts = resolve(process.cwd(), "artifacts");
mkdirSync(artifacts, { recursive: true });
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");

let stack = { started: false, child: null };
let browser;

try {
  stack = await ensureStackReady();

  browser = await chromium.launch({ headless: true });
  const results = [];

  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    await page.goto(target.url, { waitUntil: "networkidle", timeout: 60_000 });

    const metrics = await page.evaluate(() => {
      const headingCount = document.querySelectorAll("h1, h2, h3").length;
      const buttonCount = document.querySelectorAll("button").length;
      const inputCount = document.querySelectorAll("input, select, textarea").length;
      const hasHorizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;

      const tapTargets = Array.from(document.querySelectorAll("button, input, select, textarea"));
      const smallTapTargets = tapTargets.filter((node) => {
        const element = node;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }
        return rect.width < 40 || rect.height < 40;
      }).length;

      return {
        title: document.title,
        headingCount,
        buttonCount,
        inputCount,
        hasHorizontalOverflow,
        smallTapTargets,
        bodyTextLength: document.body?.innerText?.length ?? 0
      };
    });

    const screenshotPath = resolve(artifacts, `${target.name}-${runStamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    results.push({
      target: target.name,
      url: target.url,
      viewport: target.viewport,
      screenshotPath,
      metrics
    });

    await context.close();
  }

  const reportPath = resolve(artifacts, `ui-audit-${runStamp}.json`);
  writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");

  console.log(`UI audit written to ${reportPath}`);
} finally {
  await browser?.close().catch(() => {});
  if (stack.started) {
    stopProcessTree(stack.child);
  }
}
