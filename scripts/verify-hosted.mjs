#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const AUTH_SESSION_KEY = "bta.coach.authSession";
const ROSTER_STORAGE_KEY = "shared-app-data-v3";
const DEFAULT_ENVIRONMENT = "staging";
const DEFAULT_HEALTH_TIMEOUT_MS = 60_000;
const DEFAULT_RECOVERY_TIMEOUT_MS = 30_000;

function parseArgs(argv) {
  const parsed = {
    environment: process.env.BTA_HOSTED_ENVIRONMENT || DEFAULT_ENVIRONMENT,
    reportJson: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const next = argv[index + 1];
    const hasValue = Boolean(next) && !next.startsWith("--");

    if (arg === "--environment" && hasValue) {
      parsed.environment = next;
      index += 1;
      continue;
    }

    if (arg === "--report-json" && hasValue) {
      parsed.reportJson = next;
      index += 1;
    }
  }

  return parsed;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function uniqueSeed() {
  return Date.now().toString(36);
}

function headersFor(token, schoolId) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-school-id": schoolId,
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

function hashState(state) {
  return createHash("sha256").update(stableStringify(state)).digest("hex");
}

function buildEvent(gameId, schoolId, sequence, teamId) {
  return {
    id: `${gameId}-verify-${sequence}`,
    schoolId,
    gameId,
    sequence,
    timestampIso: new Date().toISOString(),
    period: "Q1",
    clockSecondsRemaining: Math.max(0, 480 - sequence * 4),
    teamId,
    operatorId: "hosted-verifier",
    type: "shot_attempt",
    playerId: `p-${((sequence - 1) % 5) + 1}`,
    made: true,
    points: 2,
    zone: "paint",
  };
}

async function requestJson(baseUrl, method, route, { headers, body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  return { response, payload };
}

async function seedCoachAccountAndRoster(apiUrl) {
  const seed = uniqueSeed();
  const schoolId = `hosted-verify-${seed}`;
  const coachEmail = `hosted.${seed}@bta.local`;
  const password = "Secret123!";
  const players = [
    { id: "p-1", name: "Ava Lane", number: "1", position: "G", grade: "11" },
    { id: "p-2", name: "Nora Cruz", number: "2", position: "G", grade: "11" },
    { id: "p-3", name: "Maya Cole", number: "3", position: "W", grade: "12" },
    { id: "p-4", name: "Jade King", number: "4", position: "W", grade: "10" },
    { id: "p-5", name: "Lina Park", number: "5", position: "C", grade: "12" },
  ];

  const register = await requestJson(apiUrl, "POST", "/api/auth/register", {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    body: {
      fullName: "Hosted Verification Coach",
      email: coachEmail,
      password,
      schoolName: "Hosted Verification High",
      teamName: "Verification Team",
    },
  });
  if (!register.response.ok) {
    throw new Error(`Hosted register failed (${register.response.status})`);
  }

  const registerToken = register.payload?.token;
  if (!registerToken) {
    throw new Error("Hosted register response did not include a token");
  }

  const roster = await requestJson(apiUrl, "PUT", "/config/roster-teams", {
    headers: headersFor(registerToken, schoolId),
    body: {
      teams: [
        {
          id: "verify-team",
          name: "Verification Team",
          abbreviation: "VRF",
          teamColor: "#1d4ed8",
          players,
        },
      ],
    },
  });
  if (!roster.response.ok) {
    throw new Error(`Hosted roster seed failed (${roster.response.status})`);
  }

  const onboarding = await requestJson(apiUrl, "POST", "/api/onboarding/complete", {
    headers: headersFor(registerToken, schoolId),
    body: {
      organizationName: "Hosted Verification Athletics",
      schoolName: "Hosted Verification High",
      coachName: "Hosted Verification Coach",
      coachEmail,
      teamName: "Verification Team",
      abbreviation: "VRF",
      season: "2026",
      teamColor: "#1d4ed8",
      roster: players,
    },
  });
  if (!onboarding.response.ok) {
    throw new Error(`Hosted onboarding seed failed (${onboarding.response.status})`);
  }

  const login = await requestJson(apiUrl, "POST", "/api/auth/login", {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    body: { email: coachEmail, password },
  });
  if (!login.response.ok) {
    throw new Error(`Hosted login failed (${login.response.status})`);
  }

  return {
    schoolId,
    coachEmail,
    token: login.payload?.token,
    team: {
      id: "verify-team",
      name: "Verification Team",
      players,
    },
  };
}

async function resetSchoolData(apiUrl, token, schoolId) {
  await requestJson(apiUrl, "DELETE", "/admin/reset", {
    headers: { Authorization: `Bearer ${token}`, "x-school-id": schoolId },
  }).catch(() => undefined);
  await requestJson(apiUrl, "POST", "/api/reset", {
    headers: { Authorization: `Bearer ${token}`, "x-school-id": schoolId },
  }).catch(() => undefined);
}

async function installCoachAuthMocks(page, seed) {
  await page.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        token: seed.token,
        user: {
          accountId: `acct-${seed.schoolId}`,
          email: seed.coachEmail,
          fullName: "Hosted Verification Coach",
          role: "owner",
          schoolId: seed.schoolId,
        },
        onboarding: { completed: true },
      }),
    });
  });

  await page.route("**/api/onboarding/state**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        completed: true,
        hasAccount: true,
        hasProfile: true,
        hasTeam: true,
        teamCount: 1,
      }),
    });
  });
}

async function recordMadeTwoPoint(page) {
  const twoPointButton = page.locator(".classic-score-grid button", { hasText: "2pt" }).first();
  await twoPointButton.click();
  const madeButton = page.getByRole("button", { name: "Made" }).first();
  if (await madeButton.isVisible().catch(() => false)) {
    await madeButton.click();
  }
  await page.locator(".player-list .player-row").first().click();
}

async function fetchHealth(apiUrl) {
  const { response, payload } = await requestJson(apiUrl, "GET", "/health");
  return { ok: response.ok, status: response.status, payload };
}

async function waitForHealthy(apiUrl, timeoutMs, healthSamples) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const sample = {
      atIso: new Date().toISOString(),
      ...(await fetchHealth(apiUrl)),
    };
    healthSamples.push(sample);

    if (
      sample.ok
      && sample.payload?.persistence?.backend === "postgres"
      && sample.payload?.persistence?.durable === true
      && sample.payload?.persistence?.connected === true
    ) {
      return sample;
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Health did not recover within ${timeoutMs}ms`);
}

async function fetchGameEvents(apiUrl, seed, gameId) {
  const { response, payload } = await requestJson(apiUrl, "GET", `/api/games/${encodeURIComponent(gameId)}/events`, {
    headers: headersFor(seed.token, seed.schoolId),
  });
  if (!response.ok) {
    throw new Error(`Fetching game events failed (${response.status})`);
  }

  const events = Array.isArray(payload)
    ? payload
    : (payload?.events ?? []);

  return events
    .filter((event) => event && typeof event.id === "string" && Number.isInteger(event.sequence))
    .sort((left, right) => left.sequence - right.sequence);
}

async function fetchGameState(apiUrl, seed, gameId) {
  const { response, payload } = await requestJson(apiUrl, "GET", `/api/games/${encodeURIComponent(gameId)}/state`, {
    headers: headersFor(seed.token, seed.schoolId),
  });
  if (!response.ok) {
    throw new Error(`Fetching game state failed (${response.status})`);
  }
  return payload;
}

async function postEvents(apiUrl, seed, gameId, teamId, startSequence, count) {
  for (let index = 0; index < count; index += 1) {
    const event = buildEvent(gameId, seed.schoolId, startSequence + index, teamId);
    const result = await requestJson(apiUrl, "POST", `/api/games/${encodeURIComponent(gameId)}/events`, {
      headers: headersFor(seed.token, seed.schoolId),
      body: event,
    });
    if (!result.response.ok) {
      throw new Error(`Posting hosted verification event failed (${result.response.status})`);
    }
  }
}

function analyzeEvents(events) {
  const seenIds = new Set();
  const duplicateEventIds = [];
  const missingSequences = [];

  for (const event of events) {
    if (seenIds.has(event.id)) {
      duplicateEventIds.push(event.id);
    }
    seenIds.add(event.id);
  }

  for (let index = 0; index < events.length; index += 1) {
    const expectedSequence = index + 1;
    if (events[index].sequence !== expectedSequence) {
      missingSequences.push(expectedSequence);
    }
  }

  return { duplicateEventIds, missingSequences };
}

async function runRestartCommand(command, restartLogPath) {
  const lines = [];
  const startedAt = Date.now();
  await new Promise((resolve, reject) => {
    const child = spawn(command, [], { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => lines.push(String(chunk)));
    child.stderr.on("data", (chunk) => lines.push(String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Restart command failed with exit code ${code ?? "unknown"}`));
    });
  });
  await writeFile(restartLogPath, lines.join(""), "utf8");
  return { startedAt, finishedAt: Date.now() };
}

async function waitForCoachScore(page, expectedScore, timeoutMs) {
  const scoreLocator = page.locator(".score-item-home .score").first();
  await scoreLocator.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction((score) => {
    const element = document.querySelector(".score-item-home .score");
    return Number(element?.textContent ?? 0) >= score;
  }, expectedScore, { timeout: timeoutMs });
}

async function readPendingQueueCount(page, gameId) {
  return page.evaluate((gid) => {
    const raw = window.localStorage.getItem(`operator-console:${gid}:pending`);
    if (!raw) {
      return 0;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.length;
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.events)) {
      return parsed.events.length;
    }
    return 0;
  }, gameId);
}

async function main() {
  const args = parseArgs(process.argv);
  const environment = args.environment === "production" ? "production" : "staging";
  const apiUrl = requireEnv("BTA_HOSTED_API_URL").replace(/\/+$/, "");
  const coachUrl = requireEnv("BTA_HOSTED_COACH_URL").replace(/\/+$/, "");
  const operatorUrl = requireEnv("BTA_HOSTED_OPERATOR_URL").replace(/\/+$/, "");
  const restartCommand = process.env.BTA_HOSTED_RESTART_COMMAND?.trim() || "";
  const healthTimeoutMs = Number(process.env.BTA_HOSTED_HEALTH_TIMEOUT_MS ?? DEFAULT_HEALTH_TIMEOUT_MS);
  const recoveryTimeoutMs = Number(process.env.BTA_HOSTED_RECOVERY_TIMEOUT_MS ?? DEFAULT_RECOVERY_TIMEOUT_MS);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactDir = path.resolve("artifacts", "hosted-verification", timestamp);
  const restartLogPath = path.join(artifactDir, "restart-command.log");
  const healthLogPath = path.join(artifactDir, "health-samples.json");
  const defaultReportPath = path.join(artifactDir, "report.json");
  const reportPath = args.reportJson ? path.resolve(args.reportJson) : defaultReportPath;
  const report = {
    environment,
    commitSha: "unknown",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    apiUrl,
    coachUrl,
    operatorUrl,
    checkpointBeforeRestart: {
      schoolId: "",
      gameId: "",
      eventCount: 0,
      stateHash: "",
    },
    restart: {
      triggered: false,
      outageSeconds: 0,
      recovered: false,
    },
    postRecovery: {
      eventCount: 0,
      stateHash: "",
      missingSequences: [],
      duplicateEventIds: [],
    },
    clientRecovery: {
      coachReconnected: false,
      operatorQueueFlushed: environment === "production",
      reconnectSeconds: 0,
    },
    passed: false,
    failures: [],
  };

  let browser;
  let coachContext;
  let operatorContext;
  let seed;
  const healthSamples = [];

  try {
    await mkdir(artifactDir, { recursive: true });

    const initialHealth = await waitForHealthy(apiUrl, healthTimeoutMs, healthSamples);
    report.commitSha = initialHealth.payload?.build?.commitSha ?? "unknown";

    seed = await seedCoachAccountAndRoster(apiUrl);
    report.checkpointBeforeRestart.schoolId = seed.schoolId;

    browser = await chromium.launch({ headless: true });

    coachContext = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: coachUrl,
            localStorage: [
              { name: "coach:tutorial-complete", value: "1" },
              {
                name: AUTH_SESSION_KEY,
                value: JSON.stringify({
                  token: seed.token,
                  email: seed.coachEmail,
                  fullName: "Hosted Verification Coach",
                  role: "owner",
                  schoolId: seed.schoolId,
                  lastLoginAtIso: null,
                }),
              },
              { name: ROSTER_STORAGE_KEY, value: JSON.stringify({ teams: [seed.team] }) },
            ],
          },
        ],
      },
    });

    const coachPage = await coachContext.newPage();
    await installCoachAuthMocks(coachPage, seed);
    await coachPage.goto(`${coachUrl}/live?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });
    await coachPage.getByRole("heading", { name: "Start New Game" }).waitFor({ timeout: 20_000 });
    await coachPage.getByRole("button", { name: seed.team.name, exact: true }).click();
    await coachPage.getByPlaceholder("e.g. Opponent").fill("Hosted Verification Opponent");
    for (const player of seed.team.players.slice(0, 5)) {
      await coachPage.getByRole("button", { name: new RegExp(player.name) }).click();
    }
    await coachPage.getByRole("button", { name: "Launch Game" }).click();
    await coachPage.getByRole("heading", { name: "Live Game Controls" }).waitFor({ timeout: 20_000 });

    const connectionCode = (await coachPage.locator(".settings-pairing-code").first().innerText()).trim();
    const gameIdText = await coachPage.locator(".settings-section-desc", { hasText: "Game ID:" }).first().innerText();
    const gameId = gameIdText.replace("Game ID:", "").trim();
    report.checkpointBeforeRestart.gameId = gameId;

    operatorContext = await browser.newContext({
      viewport: { width: 834, height: 1194 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: operatorUrl,
            localStorage: [
              { name: "ipo:tutorial-complete", value: "1" },
              {
                name: ROSTER_STORAGE_KEY,
                value: JSON.stringify({
                  teams: [
                    {
                      id: seed.team.id,
                      name: seed.team.name,
                      abbreviation: "VRF",
                      players: seed.team.players.map((player) => ({
                        id: player.id,
                        number: player.number,
                        name: player.name,
                        position: player.position,
                      })),
                    },
                  ],
                  gameSetup: {
                    gameId,
                    connectionId: connectionCode,
                    syncedConnectionId: connectionCode,
                    myTeamId: seed.team.id,
                    apiUrl,
                    schoolId: seed.schoolId,
                    opponent: "Hosted Verification Opponent",
                    vcSide: "home",
                    dashboardUrl: `${coachUrl}/live?schoolId=${seed.schoolId}`,
                    clockVisible: true,
                    clockEnabled: true,
                    trackClock: true,
                    trackPossession: true,
                    trackTimeouts: true,
                    opponentTrackStats: ["points", "free_throws", "def_reb", "off_reb", "turnover", "steal", "assist", "block", "foul"],
                    homeTeamColor: "#1d4ed8",
                    awayTeamColor: "#f87171",
                    startingLineup: seed.team.players.slice(0, 5).map((player) => player.id),
                    apiKey: seed.token,
                  },
                }),
              },
            ],
          },
        ],
      },
    });

    const operatorPage = await operatorContext.newPage();
    await operatorPage.goto(`${operatorUrl}/?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });
    await operatorPage.getByLabel("Connection code").fill(connectionCode);
    await operatorPage.getByRole("button", { name: "Sync Now" }).click();
    await operatorPage.getByRole("button", { name: "Start Game" }).waitFor({ state: "visible", timeout: 20_000 });
    await operatorPage.getByRole("button", { name: "Start Game" }).click();
    await operatorPage.locator(".classic-score-grid").waitFor({ timeout: 20_000 });

    await postEvents(apiUrl, seed, gameId, seed.team.id, 1, environment === "production" ? 3 : 20);
    const baselineEvents = await fetchGameEvents(apiUrl, seed, gameId);
    const baselineState = await fetchGameState(apiUrl, seed, gameId);
    const baselineStateHash = hashState(baselineState);
    report.checkpointBeforeRestart.eventCount = baselineEvents.length;
    report.checkpointBeforeRestart.stateHash = baselineStateHash;

    if (environment === "staging") {
      if (!restartCommand) {
        throw new Error("BTA_HOSTED_RESTART_COMMAND is required for staging hosted verification");
      }

      const expectedBaselineScore = baselineEvents.length * 2;
      await waitForCoachScore(coachPage, expectedBaselineScore, recoveryTimeoutMs);

      await operatorContext.setOffline(true);
      await recordMadeTwoPoint(operatorPage);
      await recordMadeTwoPoint(operatorPage);
      const queuedBeforeRecovery = await readPendingQueueCount(operatorPage, gameId);
      if (queuedBeforeRecovery < 2) {
        throw new Error("Operator offline queue did not capture the simulated outage events");
      }

      report.restart.triggered = true;
      const restartTiming = await runRestartCommand(restartCommand, restartLogPath);
      const recoveredHealth = await waitForHealthy(apiUrl, healthTimeoutMs, healthSamples);
      report.restart.recovered = true;
      report.restart.outageSeconds = Number(((Date.now() - restartTiming.startedAt) / 1000).toFixed(1));
      report.commitSha = recoveredHealth.payload?.build?.commitSha ?? report.commitSha;

      const preservedEvents = await fetchGameEvents(apiUrl, seed, gameId);
      const preservedState = await fetchGameState(apiUrl, seed, gameId);
      if (preservedEvents.length !== baselineEvents.length) {
        throw new Error(`Pre-restart event count changed after recovery (${baselineEvents.length} -> ${preservedEvents.length})`);
      }
      if (hashState(preservedState) !== baselineStateHash) {
        throw new Error("Pre-restart state hash changed after recovery");
      }

      const reconnectStartedAt = Date.now();
      await operatorContext.setOffline(false);
      while (Date.now() - reconnectStartedAt < recoveryTimeoutMs) {
        const events = await fetchGameEvents(apiUrl, seed, gameId);
        const pendingCount = await readPendingQueueCount(operatorPage, gameId);
        if (events.length >= baselineEvents.length + 2 && pendingCount === 0) {
          report.clientRecovery.operatorQueueFlushed = true;
          report.clientRecovery.reconnectSeconds = Number(((Date.now() - reconnectStartedAt) / 1000).toFixed(1));
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!report.clientRecovery.operatorQueueFlushed) {
        throw new Error("Operator queued events did not flush after hosted recovery");
      }

      const currentEvents = await fetchGameEvents(apiUrl, seed, gameId);
      const nextSequence = (currentEvents.at(-1)?.sequence ?? 0) + 1;
      await postEvents(apiUrl, seed, gameId, seed.team.id, nextSequence, 10);
      await waitForCoachScore(coachPage, (baselineEvents.length + 12) * 2, recoveryTimeoutMs);
      report.clientRecovery.coachReconnected = true;
    } else {
      const nextSequence = (baselineEvents.at(-1)?.sequence ?? 0) + 1;
      await postEvents(apiUrl, seed, gameId, seed.team.id, nextSequence, 1);
      await waitForCoachScore(coachPage, (baselineEvents.length + 1) * 2, recoveryTimeoutMs);
      report.clientRecovery.coachReconnected = true;
      report.restart.recovered = true;
    }

    const finalEvents = await fetchGameEvents(apiUrl, seed, gameId);
    const finalState = await fetchGameState(apiUrl, seed, gameId);
    const finalAnalysis = analyzeEvents(finalEvents);
    report.postRecovery.eventCount = finalEvents.length;
    report.postRecovery.stateHash = hashState(finalState);
    report.postRecovery.missingSequences = finalAnalysis.missingSequences;
    report.postRecovery.duplicateEventIds = finalAnalysis.duplicateEventIds;

    await coachPage.screenshot({ path: path.join(artifactDir, "coach.png"), fullPage: true });
    await operatorPage.screenshot({ path: path.join(artifactDir, "operator.png"), fullPage: true });

    report.passed = finalAnalysis.missingSequences.length === 0
      && finalAnalysis.duplicateEventIds.length === 0
      && report.clientRecovery.coachReconnected
      && report.clientRecovery.operatorQueueFlushed
      && report.restart.recovered;
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(healthLogPath, JSON.stringify(healthSamples, null, 2), "utf8").catch(() => undefined);
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8").catch(() => undefined);
    if (reportPath !== defaultReportPath) {
      await writeFile(defaultReportPath, JSON.stringify(report, null, 2), "utf8").catch(() => undefined);
    }
    await operatorContext?.close().catch(() => undefined);
    await coachContext?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (seed?.token && seed?.schoolId) {
      await resetSchoolData(apiUrl, seed.token, seed.schoolId).catch(() => undefined);
    }
  }

  if (!report.passed) {
    console.error(`Hosted verification failed. Report: ${reportPath}`);
    process.exit(1);
  }

  console.log(`Hosted verification passed. Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
