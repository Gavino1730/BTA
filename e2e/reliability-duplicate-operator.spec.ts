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
  const schoolId = `dupe-op-${seed}`;
  const coachEmail = `dupe.${seed}@bta.local`;
  const password = "Secret123!";

  const registerRes = await api.post(`${API_BASE}/api/auth/register`, {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    data: {
      fullName: "Duplicate Operator Coach",
      email: coachEmail,
      password,
      schoolName: "E2E High School",
      teamName: "E2E Team",
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
          name: "E2E Team",
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
      coachName: "Duplicate Operator Coach",
      coachEmail,
      teamName: "E2E Team",
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
      name: "E2E Team",
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

test("duplicate operator link to same live game is rejected or locked", async ({ browser, request }) => {
  const seed = await seedCoachAccountAndRoster(request);
  let coachContext = null;
  let operatorOneContext = null;
  let operatorTwoContext = null;

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
                  fullName: "Duplicate Operator Coach",
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
            fullName: "Duplicate Operator Coach",
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
    await coachPage.getByPlaceholder("e.g. Opponent").fill("Conflict Opponent");
    for (const player of seed.team.players.slice(0, 5)) {
      await coachPage.getByRole("button", { name: new RegExp(player.name) }).click();
    }

    await coachPage.getByRole("button", { name: "Launch Game" }).click();
    await expect(coachPage.getByRole("heading", { name: "Live Game Controls" })).toBeVisible({ timeout: 15_000 });

    const connectionCode = (await coachPage.locator(".settings-pairing-code").first().innerText()).trim();
    expect(connectionCode).toMatch(/^\d{6}$/);

    const operatorStorage = {
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
                  gameId: "game-dupe-op",
                  connectionId: connectionCode,
                  syncedConnectionId: connectionCode,
                  myTeamId: seed.team.id,
                  apiUrl: API_BASE,
                  schoolId: seed.schoolId,
                  opponent: "Conflict Opponent",
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
    };

    operatorOneContext = await browser.newContext({ viewport: { width: 834, height: 1194 }, storageState: operatorStorage });
    const operatorOnePage = await operatorOneContext.newPage();
    await operatorOnePage.goto(`${OPERATOR_BASE}/?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });
    await operatorOnePage.getByLabel("Connection code").fill(connectionCode);
    await operatorOnePage.getByRole("button", { name: "Sync Now" }).click();
    await expect(operatorOnePage.getByRole("button", { name: "Start Game" })).toBeEnabled({ timeout: 10_000 });
    await operatorOnePage.getByRole("button", { name: "Start Game" }).click();
    await expect(operatorOnePage.locator(".classic-score-grid")).toBeVisible({ timeout: 10_000 });

    operatorTwoContext = await browser.newContext({ viewport: { width: 834, height: 1194 }, storageState: operatorStorage });
    const operatorTwoPage = await operatorTwoContext.newPage();
    await operatorTwoPage.goto(`${OPERATOR_BASE}/?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });

    const codeInput = operatorTwoPage.getByLabel("Connection code");
    if (await codeInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await codeInput.fill(connectionCode);
    }

    const syncButton = operatorTwoPage.getByRole("button", { name: "Sync Now" });
    if (await syncButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await syncButton.click();
    }

    const secondStartButton = operatorTwoPage.getByRole("button", { name: "Start Game" });
    await expect(secondStartButton).toBeVisible({ timeout: 15_000 });

    const lockHint = operatorTwoPage.getByText("Lineup is locked because this game is already live on another device.");
    const lockHintVisible = await lockHint.isVisible({ timeout: 3_000 }).catch(() => false);

    if (lockHintVisible) {
      await expect(secondStartButton).toBeDisabled();
    } else {
      await secondStartButton.click();
      await expect(operatorTwoPage.locator(".classic-score-grid")).not.toBeVisible({ timeout: 5_000 });
    }
  } finally {
    await operatorTwoContext?.close().catch(() => undefined);
    await operatorOneContext?.close().catch(() => undefined);
    await coachContext?.close().catch(() => undefined);
    await resetSchoolData(request, seed.token, seed.schoolId).catch(() => undefined);
  }
});
