import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const API_BASE = "http://localhost:4000";
const COACH_BASE = "http://localhost:5173";
const OPERATOR_BASE = "http://localhost:5174";
const AUTH_SESSION_KEY = "bta.coach.authSession";

const coachRoutes = [
  "/",
  "/features",
  "/about",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/help",
  "/docs",
  "/terms",
  "/privacy",
  "/data-deletion",
  "/support",
  "/contact",
  "/billing",
  "/settings",
  "/admin",
  "/setup",
  "/account",
  "/live",
  "/stats",
  "/stats/games",
  "/stats/players",
  "/stats/trends",
  "/stats/insights",
  "/stats/notifications",
  "/stats/settings",
  "/org/settings",
  "/404",
  "/403",
  "/500",
  "/offline",
  "/session-expired",
  "/this-route-does-not-exist",
];

const operatorRoutes = ["/"];

const stackChecks = [
  { name: "api", url: `${API_BASE}/health` },
  { name: "coach", url: COACH_BASE },
  { name: "operator", url: OPERATOR_BASE },
];

function uniqueSeed() {
  return Date.now().toString(36);
}

function slug(value) {
  return value
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/\//g, "__")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "root";
}

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
    await delay(1000);
  }
  return false;
}

function streamWithPrefix(stream, prefix) {
  stream?.on("data", (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line) {
        continue;
      }
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

  console.log("Site capture: local stack not detected. Starting `npm run dev:all`...");
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

  const waitResults = await Promise.all(stackChecks.map((check) => waitForUrl(check.url, 180_000)));
  const failed = stackChecks.filter((_, index) => !waitResults[index]);
  if (failed.length > 0) {
    stopProcessTree(child);
    throw new Error(`Site capture could not start local stack in time: ${failed.map((entry) => entry.name).join(", ")}`);
  }

  return { started: true, child };
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Request failed (${response.status}) ${url}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function seedCoachSession() {
  const seed = uniqueSeed();
  const schoolId = `capture-${seed}`;
  const coachEmail = `capture.${seed}@bta.local`;
  const password = "Secret123!";

  const registerBody = await jsonRequest(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    body: JSON.stringify({
      fullName: "Capture Coach",
      email: coachEmail,
      password,
      schoolName: "Capture High",
      teamName: "Capture Crew",
    }),
  });

  await jsonRequest(`${API_BASE}/api/onboarding/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    body: JSON.stringify({
      organizationName: "Capture High Athletics",
      schoolName: "Capture High",
      coachName: "Capture Coach",
      coachEmail,
      teamName: "Capture Crew",
      abbreviation: "CAP",
      season: "2026",
      teamColor: "#1d4ed8",
      roster: [
        { id: "p-1", name: "Ava Lane", number: "1", position: "G", grade: "11" },
        { id: "p-2", name: "Nora Cruz", number: "2", position: "G", grade: "11" },
        { id: "p-3", name: "Maya Cole", number: "3", position: "W", grade: "12" },
        { id: "p-4", name: "Jade King", number: "4", position: "W", grade: "10" },
        { id: "p-5", name: "Lina Park", number: "5", position: "C", grade: "12" },
      ],
    }),
  });

  const loginBody = await jsonRequest(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    body: JSON.stringify({
      email: coachEmail,
      password,
    }),
  });

  return {
    schoolId,
    coachEmail,
    token: loginBody.token,
  };
}

async function captureRoutes({ browser, baseUrl, appName, routes, viewport, localStorage = [] }, runDir) {
  const screenshotsDir = resolve(runDir, "screenshots", appName);
  const videosDir = resolve(runDir, "videos", appName);
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(videosDir, { recursive: true });

  const context = await browser.newContext({
    viewport,
    recordVideo: {
      dir: videosDir,
      size: viewport,
    },
  });

  if (localStorage.length > 0) {
    await context.addInitScript((entries) => {
      for (const { key, value } of entries) {
        localStorage.setItem(key, value);
      }
    }, localStorage);
  }

  const page = await context.newPage();
  const video = page.video();
  const pages = [];

  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    const targetUrl = `${baseUrl}${route}`;
    const routeSlug = slug(route);
    const screenshotPath = resolve(screenshotsDir, `${String(index + 1).padStart(2, "0")}-${routeSlug}.png`);

    try {
      const response = await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      pages.push({
        route,
        url: targetUrl,
        screenshotPath,
        ok: true,
        status: response?.status() ?? null,
      });

      console.log(`[capture:${appName}] ${route} -> ${response?.status() ?? "n/a"}`);
    } catch (error) {
      pages.push({
        route,
        url: targetUrl,
        screenshotPath: null,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });

      console.warn(`[capture:${appName}] FAILED ${route}`);
    }
  }

  await page.close();
  await context.close();

  return {
    appName,
    viewport,
    pageCount: routes.length,
    pages,
    videoPath: video ? await video.path() : null,
  };
}

const artifactsRoot = resolve(process.cwd(), "artifacts");
mkdirSync(artifactsRoot, { recursive: true });
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = resolve(artifactsRoot, `site-capture-${runStamp}`);
mkdirSync(runDir, { recursive: true });

let stack = { started: false, child: null };
let browser;

try {
  stack = await ensureStackReady();

  const seed = await seedCoachSession();
  const authSession = JSON.stringify({
    token: seed.token,
    email: seed.coachEmail,
    fullName: "Capture Coach",
    schoolId: seed.schoolId,
    role: "coach",
  });

  browser = await chromium.launch({ headless: true });

  const coachResult = await captureRoutes({
    browser,
    baseUrl: COACH_BASE,
    appName: "coach-dashboard",
    routes: coachRoutes,
    viewport: { width: 1440, height: 900 },
    localStorage: [
      { key: AUTH_SESSION_KEY, value: authSession },
      { key: "coach:tutorial-complete", value: "1" },
    ],
  }, runDir);

  const operatorResult = await captureRoutes({
    browser,
    baseUrl: OPERATOR_BASE,
    appName: "ipad-operator",
    routes: operatorRoutes,
    viewport: { width: 834, height: 1194 },
  }, runDir);

  const report = {
    createdAt: new Date().toISOString(),
    runDir,
    apps: [coachResult, operatorResult],
  };

  const reportPath = resolve(runDir, "capture-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Site capture complete. Report: ${reportPath}`);
  console.log(`Screenshots folder: ${resolve(runDir, "screenshots")}`);
  console.log(`Videos folder: ${resolve(runDir, "videos")}`);
} finally {
  await browser?.close().catch(() => {});
  if (stack.started) {
    stopProcessTree(stack.child);
  }
}
