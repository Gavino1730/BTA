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

function uniqueSeed(): string {
  return Date.now().toString(36);
}

async function seedCoachAccountAndRoster(api: APIRequestContext): Promise<SeedResult> {
  const seed = uniqueSeed();
  const schoolId = `e2e-${seed}`;
  const coachEmail = `coach.${seed}@bta.local`;
  const password = "Secret123!";

  const registerRes = await api.post(`${API_BASE}/api/auth/register`, {
    headers: {
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      fullName: "E2E Coach",
      email: coachEmail,
      password,
      schoolName: "E2E High School",
      teamName: "Test Team",
    },
  });
  expect(registerRes.ok()).toBeTruthy();
  const registerBody = await registerRes.json() as { token: string };

  const players = [
    { id: "p-1", name: "Ava Lane", number: "1", position: "G", grade: "11" },
    { id: "p-2", name: "Nora Cruz", number: "2", position: "G", grade: "11" },
    { id: "p-3", name: "Maya Cole", number: "3", position: "W", grade: "12" },
    { id: "p-4", name: "Jade King", number: "4", position: "W", grade: "10" },
    { id: "p-5", name: "Lina Park", number: "5", position: "C", grade: "12" },
    { id: "p-6", name: "Zoe Hart", number: "6", position: "G", grade: "10" },
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
          name: "Test Team",
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
      coachName: "E2E Coach",
      coachEmail,
      teamName: "Test Team",
      abbreviation: "E2E",
      season: "2026",
      teamColor: "#1d4ed8",
      roster: players,
    },
  });
  expect(onboardingRes.ok()).toBeTruthy();

  const loginRes = await api.post(`${API_BASE}/api/auth/login`, {
    headers: {
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      email: coachEmail,
      password,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginBody = await loginRes.json() as { token: string };

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

async function recordMadeTwoPointWithOnCourtPlayer(page: Page): Promise<void> {
  const twoPointButtons = page.locator(".classic-score-grid button", { hasText: "2pt" });
  const modalOverlay = page.locator(".modal-overlay");

  async function dismissOpenModal(): Promise<void> {
    if (!await modalOverlay.isVisible().catch(() => false)) {
      return;
    }

    const skipButton = page.getByRole("button", { name: /^Skip$/i }).first();
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click();
      await expect(modalOverlay).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
      return;
    }

    const closeButton = page.getByRole("button", { name: /^X$/i }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      await page.keyboard.press("Escape");
    }

    await expect(modalOverlay).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }

  const total = await twoPointButtons.count();
  expect(total).toBeGreaterThan(0);

  for (let i = 0; i < total; i += 1) {
    await dismissOpenModal();
    await twoPointButtons.nth(i).click();

    const noPlayersMessage = page.getByText("No players on court yet");
    if (await noPlayersMessage.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await dismissOpenModal();
      continue;
    }

    const madeButton = page.getByRole("button", { name: "Made" }).first();
    if (await madeButton.isVisible().catch(() => false)) {
      await madeButton.click();
    }

    const playerRows = page.locator(".player-list .player-row");
    if (await playerRows.count() > 0) {
      await playerRows.first().click();
      await dismissOpenModal();
      return;
    }

    await page.keyboard.press("Escape");
    await dismissOpenModal();
  }

  throw new Error("Could not find a 2pt flow with on-court players.");
}

test("runs one fake game through real coach and operator clicks", async ({ browser, request }) => {
  const seed = await seedCoachAccountAndRoster(request);

  const coachContext = await browser.newContext({
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
                fullName: "E2E Coach",
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
          fullName: "E2E Coach",
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

  const teamButton = coachPage.getByRole("button", { name: seed.team.name, exact: true });
  await expect(coachPage.getByRole("heading", { name: "Start New Game" })).toBeVisible();
  await expect(teamButton).toBeVisible({ timeout: 15_000 });
  await teamButton.click();
  await coachPage.getByPlaceholder("e.g. Opponent").fill("E2E Rivals");

  for (const player of seed.team.players.slice(0, 5)) {
    await coachPage.getByRole("button", { name: new RegExp(player.name) }).click();
  }

  await coachPage.getByRole("button", { name: "Launch Game" }).click();
  await expect(coachPage.getByRole("heading", { name: "Live Game Controls" })).toBeVisible();

  const connectionCode = (await coachPage.locator(".settings-pairing-code").first().innerText()).trim();
  expect(connectionCode).toMatch(/^\d{6}$/);

  const operatorContext = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: OPERATOR_BASE,
          localStorage: [
            { name: "ipo:tutorial-complete", value: "1" },
            {
              name: "shared-app-data-v3",
              value: JSON.stringify({
                teams: [
                  {
                    id: seed.team.id,
                    name: seed.team.name,
                    abbreviation: "E2E",
                    players: [
                      { id: "p-1", number: "1", name: "Ava Lane", position: "G" },
                      { id: "p-2", number: "2", name: "Nora Cruz", position: "G" },
                      { id: "p-3", number: "3", name: "Maya Cole", position: "W" },
                      { id: "p-4", number: "4", name: "Jade King", position: "W" },
                      { id: "p-5", number: "5", name: "Lina Park", position: "C" },
                    ],
                  },
                ],
                gameSetup: {
                  gameId: "game-1",
                  connectionId: connectionCode,
                  syncedConnectionId: connectionCode,
                  myTeamId: seed.team.id,
                  apiUrl: API_BASE,
                  schoolId: seed.schoolId,
                  opponent: "E2E Rivals",
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
  await expect(operatorPage.getByRole("button", { name: "Start Game" })).toBeEnabled();
  await operatorPage.getByRole("button", { name: "Start Game" }).click();
  await expect(operatorPage.locator(".classic-score-grid")).toBeVisible();

  await recordMadeTwoPointWithOnCourtPlayer(operatorPage);
  await recordMadeTwoPointWithOnCourtPlayer(operatorPage);

  const gameIdText = await coachPage.locator(".settings-section-desc", { hasText: "Game ID:" }).first().innerText();
  const gameId = gameIdText.replace("Game ID:", "").trim();
  expect(gameId.length).toBeGreaterThan(0);

  await expect.poll(async () => {
    const scoreTexts = await coachPage.locator(".score-item .score").allTextContents();
    return scoreTexts.map((value) => value.trim());
  }, {
    timeout: 30_000,
    message: "Coach scoreboard did not reflect operator scoring update.",
  }).toContain("4");

  await operatorContext.close();
  await coachContext.close();
});


