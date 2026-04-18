import { expect, test, type APIRequestContext } from "@playwright/test";

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

function uniqueSeed(): string {
  return Date.now().toString(36);
}

async function seedCoachAccountAndRoster(api: APIRequestContext): Promise<SeedResult> {
  const seed = uniqueSeed();
  const schoolId = `offline-sync-${seed}`;
  const coachEmail = `offline.${seed}@bta.local`;
  const password = "Secret123!";

  const registerRes = await api.post(`${API_BASE}/api/auth/register`, {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    data: {
      fullName: "Offline Sync Coach",
      email: coachEmail,
      password,
      schoolName: "E2E High School",
      teamName: "Test Team",
    },
  });
  expect(registerRes.ok()).toBeTruthy();
  const registerBody = (await registerRes.json()) as { token: string };

  const bootstrapRes = await api.post(`${API_BASE}/api/schools/bootstrap`, {
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      schoolId,
      schoolName: "E2E High School",
    },
  });
  expect(bootstrapRes.ok()).toBeTruthy();

  const players = [
    { id: "p-1", name: "Ava Lane", number: "1", position: "G", grade: "11" },
    { id: "p-2", name: "Nora Cruz", number: "2", position: "G", grade: "11" },
    { id: "p-3", name: "Maya Cole", number: "3", position: "W", grade: "12" },
    { id: "p-4", name: "Jade King", number: "4", position: "W", grade: "10" },
    { id: "p-5", name: "Lina Park", number: "5", position: "C", grade: "12" },
  ];

  await api.put(`${API_BASE}/config/roster-teams`, {
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      teams: [
        {
          id: "e2e-team",
          name: "Test Team",
          abbreviation: "E2E",
          teamColor: "#1d4ed8",
          players,
        },
      ],
    },
  });

  await api.post(`${API_BASE}/api/onboarding/complete`, {
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      organizationName: "E2E High School Athletics",
      schoolName: "E2E High School",
      coachName: "Offline Sync Coach",
      coachEmail,
      teamName: "Test Team",
      abbreviation: "E2E",
      season: "2026",
      teamColor: "#1d4ed8",
      roster: players,
    },
  });

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
      name: "Test Team",
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

async function recordMadeTwoPoint(page: import("@playwright/test").Page): Promise<void> {
  const twoPointButton = page.locator(".classic-score-grid button", { hasText: "2pt" }).first();
  await twoPointButton.click();
  const madeButton = page.getByRole("button", { name: "Made" }).first();
  if (await madeButton.isVisible().catch(() => false)) {
    await madeButton.click();
  }
  const firstPlayer = page.locator(".player-list .player-row").first();
  await firstPlayer.click();
}

async function fetchEventCount(
  request: APIRequestContext,
  gameId: string,
  token: string,
  schoolId: string
): Promise<number> {
  const eventsRes = await request.get(`${API_BASE}/api/games/${encodeURIComponent(gameId)}/events`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-school-id": schoolId,
    },
  });
  if (!eventsRes.ok()) {
    return 0;
  }

  const payload = (await eventsRes.json()) as unknown;
  const events = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown[] }).events)
      ? (payload as { events: unknown[] }).events
      : []);
  return events.length;
}

async function fetchGameEvents(
  request: APIRequestContext,
  gameId: string,
  token: string,
  schoolId: string
): Promise<Array<{ id: string; sequence: number }>> {
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

function expectEventLogIntegrity(events: Array<{ id: string; sequence: number }>): void {
  const uniqueIds = new Set(events.map((event) => event.id));
  expect(uniqueIds.size).toBe(events.length);

  for (let index = 0; index < events.length; index += 1) {
    expect(events[index]?.sequence).toBe(index + 1);
  }
}

test("offline operator events flush on reconnect and persist", async ({ browser, request }) => {
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
                  fullName: "Offline Sync Coach",
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
            fullName: "Offline Sync Coach",
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

    await coachPage.route("**/api/me/context**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            userId: `acct-${seed.schoolId}`,
            email: seed.coachEmail,
            fullName: "Offline Sync Coach",
          },
          profile: {
            lastSchoolId: seed.schoolId,
            lastTeamId: seed.team.id,
            lastContextType: "team",
          },
          schools: [
            {
              schoolId: seed.schoolId,
              name: "E2E High School",
              slug: "e2e-high-school",
              sport: "basketball",
              status: "active",
            },
          ],
          schoolMemberships: [
            {
              membershipId: `school-membership-${seed.schoolId}`,
              schoolId: seed.schoolId,
              userId: `acct-${seed.schoolId}`,
              email: seed.coachEmail,
              fullName: "Offline Sync Coach",
              role: "owner",
              status: "active",
            },
          ],
          teamMemberships: [],
          teams: [
            {
              ...seed.team,
              schoolId: seed.schoolId,
              sport: "basketball",
              gender: "girls",
              level: "varsity",
              status: "active",
            },
          ],
          defaultContext: {
            type: "team",
            schoolId: seed.schoolId,
            teamId: seed.team.id,
          },
        }),
      });
    });

    await coachPage.goto(`${COACH_BASE}/live?schoolId=${seed.schoolId}&teamId=${seed.team.id}`, { waitUntil: "domcontentloaded" });
    await expect(coachPage.getByRole("heading", { name: "Start New Game" })).toBeVisible({ timeout: 15_000 });

    await coachPage.getByRole("button", { name: seed.team.name, exact: true }).click();
    await coachPage.getByPlaceholder("e.g. Opponent").fill("Offline Opponent");
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
                    opponent: "Offline Opponent",
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

    const beforeOfflineCount = await fetchEventCount(request, gameId, seed.token, seed.schoolId);

    await operatorContext.setOffline(true);
    await recordMadeTwoPoint(operatorPage);
    await recordMadeTwoPoint(operatorPage);

    await expect.poll(async () => {
      return fetchEventCount(request, gameId, seed.token, seed.schoolId);
    }, { timeout: 10_000 }).toBe(beforeOfflineCount);

    await operatorContext.setOffline(false);

    await expect.poll(async () => {
      return fetchEventCount(request, gameId, seed.token, seed.schoolId);
    }, { timeout: 30_000 }).toBeGreaterThan(beforeOfflineCount);
  } finally {
    await operatorContext?.close().catch(() => undefined);
    await coachContext?.close().catch(() => undefined);
    await resetSchoolData(request, seed.token, seed.schoolId).catch(() => undefined);
  }
});

test("reconnect reconciliation drops already-synced queued duplicate without double-ingest", async ({ browser, request }) => {
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
                  fullName: "Offline Sync Coach",
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
            fullName: "Offline Sync Coach",
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

    await coachPage.route("**/api/me/context**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            userId: `acct-${seed.schoolId}`,
            email: seed.coachEmail,
            fullName: "Offline Sync Coach",
          },
          profile: {
            lastSchoolId: seed.schoolId,
            lastTeamId: seed.team.id,
            lastContextType: "team",
          },
          schools: [
            {
              schoolId: seed.schoolId,
              name: "E2E High School",
              slug: "e2e-high-school",
              sport: "basketball",
              status: "active",
            },
          ],
          schoolMemberships: [
            {
              membershipId: `school-membership-${seed.schoolId}`,
              schoolId: seed.schoolId,
              userId: `acct-${seed.schoolId}`,
              email: seed.coachEmail,
              fullName: "Offline Sync Coach",
              role: "owner",
              status: "active",
            },
          ],
          teamMemberships: [],
          teams: [
            {
              ...seed.team,
              schoolId: seed.schoolId,
              sport: "basketball",
              gender: "girls",
              level: "varsity",
              status: "active",
            },
          ],
          defaultContext: {
            type: "team",
            schoolId: seed.schoolId,
            teamId: seed.team.id,
          },
        }),
      });
    });

    await coachPage.goto(`${COACH_BASE}/live?schoolId=${seed.schoolId}&teamId=${seed.team.id}`, { waitUntil: "domcontentloaded" });
    await expect(coachPage.getByRole("heading", { name: "Start New Game" })).toBeVisible({ timeout: 15_000 });

    await coachPage.getByRole("button", { name: seed.team.name, exact: true }).click();
    await coachPage.getByPlaceholder("e.g. Opponent").fill("Offline Opponent");
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
                    opponent: "Offline Opponent",
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

    const beforeEvents = await fetchGameEvents(request, gameId, seed.token, seed.schoolId);

    await operatorContext.setOffline(true);

    await recordMadeTwoPoint(operatorPage);

    const capturedQueuedPayload = await operatorPage.evaluate((gid) => {
      const raw = window.localStorage.getItem(`operator-console:${gid}:pending`);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return (parsed[0] ?? null) as Record<string, unknown> | null;
      }
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      const envelope = parsed as { events?: unknown[] };
      if (!Array.isArray(envelope.events) || envelope.events.length === 0) {
        return null;
      }
      return envelope.events[0] as Record<string, unknown>;
    }, gameId);

    expect(capturedQueuedPayload).not.toBeNull();

    const seedDuplicateRes = await request.post(`${API_BASE}/api/games/${encodeURIComponent(gameId)}/events`, {
      headers: {
        Authorization: `Bearer ${seed.token}`,
        "Content-Type": "application/json",
        "x-school-id": seed.schoolId,
      },
      data: capturedQueuedPayload ?? {},
    });
    expect(seedDuplicateRes.ok()).toBeTruthy();

    await expect.poll(async () => {
      return fetchEventCount(request, gameId, seed.token, seed.schoolId);
    }, { timeout: 15_000 }).toBe(beforeEvents.length + 1);

    await operatorContext.setOffline(false);

    await expect.poll(async () => {
      return fetchEventCount(request, gameId, seed.token, seed.schoolId);
    }, { timeout: 20_000 }).toBe(beforeEvents.length + 1);

    const pendingUploadButton = operatorPage.getByRole("button", { name: /pending upload - Tap to resubmit/i });
    await expect(pendingUploadButton).toBeVisible({ timeout: 10_000 });
    await pendingUploadButton.click();

    await expect.poll(async () => {
      return fetchEventCount(request, gameId, seed.token, seed.schoolId);
    }, { timeout: 15_000 }).toBe(beforeEvents.length + 1);

    const finalEvents = await fetchGameEvents(request, gameId, seed.token, seed.schoolId);
    expectEventLogIntegrity(finalEvents);
  } finally {
    await operatorContext?.close().catch(() => undefined);
    await coachContext?.close().catch(() => undefined);
    await resetSchoolData(request, seed.token, seed.schoolId).catch(() => undefined);
  }
});
