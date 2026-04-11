import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = "http://localhost:4000";
const COACH_BASE = "http://localhost:5173";
const OPERATOR_BASE = "http://localhost:5174";
const AUTH_SESSION_KEY = "bta.coach.authSession";
const ROSTER_STORAGE_KEY = "shared-app-data-v3";

type SeedResult = {
  schoolId: string;
  token: string;
  coachEmail: string;
  team: {
    id: string;
    name: string;
    abbreviation: string;
    teamColor: string;
    players: Array<{ id: string; name: string; number: string; position: string; grade: string }>;
  };
};

type GameEventRow = {
  id: string;
  sequence: number;
};

function uniqueSeed(): string {
  return Date.now().toString(36);
}

async function seedCoachAccountAndRoster(api: APIRequestContext): Promise<SeedResult> {
  const seed = uniqueSeed();
  const schoolId = `restart-burst-${seed}`;
  const coachEmail = `restart.${seed}@bta.local`;
  const password = "Secret123!";

  const registerRes = await api.post(`${API_BASE}/api/auth/register`, {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    data: {
      fullName: "API Restart Coach",
      email: coachEmail,
      password,
      schoolName: "E2E High School",
      teamName: "E2E Eagles",
    },
  });
  expect(registerRes.ok()).toBeTruthy();
  const registerBody = (await registerRes.json()) as { token: string };

  const players = [
    { id: "p-1", name: "Ava Lane", number: "1", position: "G", grade: "11" },
    { id: "p-2", name: "Nora Cruz", number: "2", position: "G", grade: "11" },
    { id: "p-3", name: "Maya Cole", number: "3", position: "W", grade: "12" },
    { id: "p-4", name: "Jade King", number: "4", position: "W", grade: "10" },
    { id: "p-5", name: "Lina Park", number: "5", position: "C", grade: "12" },
  ];

  const rosterRes = await api.put(`${API_BASE}/config/roster-teams`, {
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      teams: [
        {
          id: "e2e-team",
          name: "E2E Eagles",
          abbreviation: "E2E",
          teamColor: "#1d4ed8",
          players,
        },
      ],
    },
  });
  expect(rosterRes.ok()).toBeTruthy();

  const onboardingRes = await api.post(`${API_BASE}/api/onboarding/complete`, {
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      organizationName: "E2E High School Athletics",
      schoolName: "E2E High School",
      coachName: "API Restart Coach",
      coachEmail,
      teamName: "E2E Eagles",
      abbreviation: "E2E",
      season: "2026",
      teamColor: "#1d4ed8",
      roster: players,
    },
  });
  expect(onboardingRes.ok()).toBeTruthy();

  const loginRes = await api.post(`${API_BASE}/api/auth/login`, {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    data: { email: coachEmail, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginBody = (await loginRes.json()) as { token: string };

  return {
    schoolId,
    token: loginBody.token,
    coachEmail,
    team: {
      id: "e2e-team",
      name: "E2E Eagles",
      abbreviation: "E2E",
      teamColor: "#1d4ed8",
      players,
    },
  };
}

async function resetSchoolData(api: APIRequestContext, token: string, schoolId: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, "x-school-id": schoolId };
  await api.delete(`${API_BASE}/admin/reset`, { headers }).catch(() => undefined);
  await api.post(`${API_BASE}/api/reset`, { headers }).catch(() => undefined);
}

async function recordMadeTwoPoint(page: Page): Promise<void> {
  const twoPointButton = page.locator(".classic-score-grid button", { hasText: "2pt" }).first();
  await twoPointButton.click();
  const madeButton = page.getByRole("button", { name: "Made" }).first();
  if (await madeButton.isVisible().catch(() => false)) {
    await madeButton.click();
  }
  const firstPlayer = page.locator(".player-list .player-row").first();
  await firstPlayer.click();
}

async function fetchGameEvents(
  request: APIRequestContext,
  gameId: string,
  token: string,
  schoolId: string
): Promise<GameEventRow[]> {
  const eventsRes = await request.get(`${API_BASE}/api/games/${encodeURIComponent(gameId)}/events`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-school-id": schoolId,
    },
  });

  if (!eventsRes.ok()) {
    return [];
  }

  const payload = (await eventsRes.json()) as unknown;
  const events = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown[] }).events)
      ? (payload as { events: unknown[] }).events
      : []);

  return events
    .filter((event): event is { id: string; sequence: number } => {
      return Boolean(
        event
        && typeof event === "object"
        && typeof (event as { id?: unknown }).id === "string"
        && Number.isInteger((event as { sequence?: unknown }).sequence)
      );
    })
    .map((event) => ({ id: event.id, sequence: event.sequence }))
    .sort((left, right) => left.sequence - right.sequence);
}

test("high-frequency ingest survives API restart-style outage and replays queued events", async ({ browser, request }) => {
  const seed = await seedCoachAccountAndRoster(request);
  let coachContext = null;
  let operatorContext = null;

  try {
    coachContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: COACH_BASE,
            localStorage: [
              { name: "coach:tutorial-complete", value: "1" },
              {
                name: AUTH_SESSION_KEY,
                value: JSON.stringify({
                  token: seed.token,
                  email: seed.coachEmail,
                  fullName: "API Restart Coach",
                  role: "owner",
                  schoolId: seed.schoolId,
                  lastLoginAtIso: null,
                }),
              },
              {
                name: ROSTER_STORAGE_KEY,
                value: JSON.stringify({ teams: [seed.team] }),
              },
            ],
          },
        ],
      },
    });

    const coachPage = await coachContext.newPage();
    await coachPage.route("**/api/auth/session**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          token: seed.token,
          user: {
            accountId: `acct-${seed.schoolId}`,
            email: seed.coachEmail,
            fullName: "API Restart Coach",
            role: "owner",
            schoolId: seed.schoolId,
          },
          onboarding: { completed: true },
        }),
      });
    });

    await coachPage.route("**/api/onboarding/state**", async (route) => {
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

    await coachPage.goto(`${COACH_BASE}/live?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });
    await expect(coachPage.getByRole("heading", { name: "Start New Game" })).toBeVisible({ timeout: 15_000 });

    await coachPage.getByRole("button", { name: seed.team.name, exact: true }).click();
    await coachPage.getByPlaceholder("e.g. Opponent").fill("Restart Burst Opponent");
    for (const player of seed.team.players.slice(0, 5)) {
      await coachPage.getByRole("button", { name: new RegExp(player.name) }).click();
    }

    await coachPage.getByRole("button", { name: "Launch Game" }).click();
    await expect(coachPage.getByRole("heading", { name: "Live Game Controls" })).toBeVisible({ timeout: 15_000 });

    const connectionCode = (await coachPage.locator(".settings-pairing-code").first().innerText()).trim();
    const gameIdText = await coachPage.locator(".settings-section-desc", { hasText: "Game ID:" }).first().innerText();
    const gameId = gameIdText.replace("Game ID:", "").trim();
    expect(connectionCode).toMatch(/^\d{6}$/);
    expect(gameId.length).toBeGreaterThan(0);

    operatorContext = await browser.newContext({
      viewport: { width: 834, height: 1194 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: OPERATOR_BASE,
            localStorage: [
              { name: "ipo:tutorial-complete", value: "1" },
              {
                name: ROSTER_STORAGE_KEY,
                value: JSON.stringify({
                  teams: [
                    {
                      id: seed.team.id,
                      name: seed.team.name,
                      abbreviation: "E2E",
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
                    apiUrl: API_BASE,
                    schoolId: seed.schoolId,
                    opponent: "Restart Burst Opponent",
                    vcSide: "home",
                    dashboardUrl: `${COACH_BASE}/live?schoolId=${seed.schoolId}`,
                    clockVisible: true,
                    clockEnabled: true,
                    trackClock: true,
                    trackPossession: true,
                    trackTimeouts: true,
                    opponentTrackStats: ["points", "free_throws", "def_reb", "off_reb", "turnover", "steal", "assist", "block", "foul"],
                    homeTeamColor: "#1d4ed8",
                    awayTeamColor: "#f87171",
                    startingLineup: ["p-1", "p-2", "p-3", "p-4", "p-5"],
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
    await operatorPage.goto(`${OPERATOR_BASE}/?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });
    await operatorPage.getByLabel("Connection code").fill(connectionCode);
    await operatorPage.getByRole("button", { name: "Sync Now" }).click();
    await expect(operatorPage.getByRole("button", { name: "Start Game" })).toBeEnabled({ timeout: 10_000 });
    await operatorPage.getByRole("button", { name: "Start Game" }).click();
    await expect(operatorPage.locator(".classic-score-grid")).toBeVisible({ timeout: 10_000 });

    const beforeOutageEvents = await fetchGameEvents(request, gameId, seed.token, seed.schoolId);

    let failIngestPosts = true;
    await operatorPage.route("**/api/games/**/events", async (route) => {
      if (route.request().method() === "POST" && failIngestPosts) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "simulated_api_restart" }),
        });
        return;
      }
      await route.continue();
    });

    const burstSize = 8;
    for (let index = 0; index < burstSize; index += 1) {
      await recordMadeTwoPoint(operatorPage);
    }

    await expect.poll(async () => {
      const events = await fetchGameEvents(request, gameId, seed.token, seed.schoolId);
      return events.length;
    }, { timeout: 8_000 }).toBe(beforeOutageEvents.length);

    failIngestPosts = false;

    const retryButton = operatorPage.getByRole("button", { name: /pending upload - Tap to resubmit/i });
    await expect(retryButton).toBeVisible({ timeout: 10_000 });
    await retryButton.click();

    await expect.poll(async () => {
      const events = await fetchGameEvents(request, gameId, seed.token, seed.schoolId);
      return events.length;
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(beforeOutageEvents.length + burstSize);

    const finalEvents = await fetchGameEvents(request, gameId, seed.token, seed.schoolId);
    const sequences = finalEvents.map((event) => event.sequence);
    const uniqueSequences = new Set(sequences);

    expect(uniqueSequences.size).toBe(sequences.length);
    for (let index = 1; index < sequences.length; index += 1) {
      expect(sequences[index]).toBeGreaterThan(sequences[index - 1]);
    }
  } finally {
    await operatorContext?.close().catch(() => undefined);
    await coachContext?.close().catch(() => undefined);
    await resetSchoolData(request, seed.token, seed.schoolId).catch(() => undefined);
  }
});
