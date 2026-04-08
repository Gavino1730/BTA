import { test, expect, type APIRequestContext } from "@playwright/test";

const API_BASE = "http://localhost:4000";
const COACH_BASE = "http://localhost:5173";
const OPERATOR_BASE = "http://localhost:5174";

type AuthUser = {
  email?: string;
  fullName?: string;
  role?: string;
  schoolId?: string;
  lastLoginAtIso?: string | null;
};

type RegisterPayload = {
  token: string;
  user: AuthUser;
};

type LoginPayload = {
  token: string;
  user?: AuthUser;
  onboarding?: { completed?: boolean };
};

type RosterPlayer = {
  id?: string;
  name: string;
  number: string;
  position?: string;
  grade?: string;
};

type RosterTeam = {
  id: string;
  name: string;
  players: RosterPlayer[];
};

function uniqueSeed(): string {
  return Date.now().toString(36);
}

async function seedCoachAccountAndRoster(api: APIRequestContext) {
  const seed = uniqueSeed();
  const schoolId = `e2e-${seed}`;
  const email = `coach.${seed}@bta.local`;
  const password = "Secret123!";
  const coachName = "E2E Coach";

  const registerRes = await api.post(`${API_BASE}/api/auth/register`, {
    headers: {
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      fullName: coachName,
      email,
      password,
      schoolName: "E2E High School",
      teamName: "E2E Eagles",
    },
  });
  expect(registerRes.ok()).toBeTruthy();
  const registerBody = (await registerRes.json()) as RegisterPayload;

  const roster = [
    { name: "Ava Lane", number: "1", position: "G", grade: "11" },
    { name: "Nora Cruz", number: "2", position: "G", grade: "11" },
    { name: "Maya Cole", number: "3", position: "W", grade: "12" },
    { name: "Jade King", number: "4", position: "W", grade: "10" },
    { name: "Lina Park", number: "5", position: "C", grade: "12" },
    { name: "Zoe Hart", number: "6", position: "G", grade: "10" },
  ];

  const onboardingRes = await api.post(`${API_BASE}/api/onboarding/complete`, {
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      organizationName: "E2E High School Athletics",
      schoolName: "E2E High School",
      coachName,
      coachEmail: email,
      teamName: "E2E Eagles",
      abbreviation: "E2E",
      season: "2026",
      teamColor: "#1d4ed8",
      roster,
    },
  });
  expect(onboardingRes.ok()).toBeTruthy();

  const teamsRes = await api.get(`${API_BASE}/config/roster-teams`, {
    headers: {
      Authorization: `Bearer ${registerBody.token}`,
      "x-school-id": schoolId,
    },
  });
  expect(teamsRes.ok()).toBeTruthy();
  const teamsBody = (await teamsRes.json()) as { teams?: RosterTeam[] };
  const team = (teamsBody.teams ?? []).find((entry) => entry.name === "E2E Eagles") ?? teamsBody.teams?.[0];
  expect(team).toBeTruthy();

  const loginRes = await api.post(`${API_BASE}/api/auth/login`, {
    headers: {
      "Content-Type": "application/json",
      "x-school-id": schoolId,
    },
    data: {
      email,
      password,
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginBody = (await loginRes.json()) as LoginPayload;
  expect(loginBody.token).toBeTruthy();

  return {
    schoolId,
    token: loginBody.token,
    coachEmail: email,
    coachPassword: password,
    teamName: team!.name,
    starterNames: (team!.players ?? []).slice(0, 5).map((player) => player.name),
  };
}

test("runs one fake game through real coach and operator clicks", async ({ browser, request }) => {
  const seed = await seedCoachAccountAndRoster(request);

  const coachContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const coachPage = await coachContext.newPage();
  await coachPage.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        token: seed.token,
        user: {
          accountId: `e2e-${seed.schoolId}`,
          email: seed.coachEmail,
          fullName: "E2E Coach",
          role: "owner",
          schoolId: seed.schoolId,
        },
        onboarding: {
          completed: true,
        },
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

  const setupHeading = coachPage.getByRole("heading", { name: "School Setup" });
  if (await setupHeading.isVisible()) {
    const schoolInput = coachPage.getByLabel("School Name *").first();
    const teamInput = coachPage.getByLabel("Team Name *").first();
    const rosterNameInput = coachPage.getByPlaceholder("Player name").first();
    const rosterNumberInput = coachPage.getByPlaceholder("0").first();

    if ((await schoolInput.inputValue()).trim().length === 0) {
      await schoolInput.fill("E2E High School");
    }
    if ((await teamInput.inputValue()).trim().length === 0) {
      await teamInput.fill(seed.teamName);
    }
    if ((await rosterNameInput.inputValue()).trim().length === 0) {
      await rosterNameInput.fill(seed.starterNames[0] ?? "Ava Lane");
    }
    if ((await rosterNumberInput.inputValue()).trim().length === 0) {
      await rosterNumberInput.fill("1");
    }

    await coachPage.getByRole("button", { name: "Complete Setup" }).click();
  }

  await expect(coachPage.getByRole("heading", { name: "Start New Game" })).toBeVisible();
  await coachPage.getByRole("button", { name: seed.teamName, exact: true }).click();
  await coachPage.getByPlaceholder("e.g. Opponent").fill("E2E Rivals");

  for (const starterName of seed.starterNames) {
    await coachPage.getByRole("button", { name: new RegExp(starterName) }).click();
  }

  await coachPage.getByRole("button", { name: "Launch Game" }).click();
  await expect(coachPage.getByRole("heading", { name: "Live Game Controls" })).toBeVisible();

  const connectionCode = (await coachPage.locator(".settings-pairing-code").first().innerText()).trim();
  expect(connectionCode).toMatch(/^\d{6}$/);

  const operatorContext = await browser.newContext({ viewport: { width: 834, height: 1194 } });
  const operatorPage = await operatorContext.newPage();
  await operatorPage.goto(`${OPERATOR_BASE}/?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });

  await operatorPage.getByLabel("Connection code").fill(connectionCode);
  await operatorPage.getByRole("button", { name: "Sync Now" }).click();
  await expect(operatorPage.getByRole("button", { name: "Start Game" })).toBeEnabled();

  await operatorPage.getByRole("button", { name: "Start Game" }).click();
  await expect(operatorPage.locator(".classic-score-grid")).toBeVisible();

  await operatorPage.locator(".classic-score-grid button", { hasText: "2pt" }).first().click();
  await operatorPage.locator(".player-list .player-row").first().click();

  const chainPromptSkip = operatorPage.getByRole("button", { name: "Skip" });
  if (await chainPromptSkip.isVisible()) {
    await chainPromptSkip.click();
  }

  await operatorPage.getByRole("button", { name: "foul" }).click();
  await operatorPage.locator(".player-list .player-row").first().click();

  await expect.poll(async () => {
    const scoreTexts = await coachPage.locator(".score-item .score").allTextContents();
    return scoreTexts.map((value) => value.trim());
  }, {
    timeout: 30_000,
    message: "Coach scoreboard did not reflect operator scoring update.",
  }).toContain("2");

  const gameIdText = await coachPage.locator(".settings-section-desc", { hasText: "Game ID:" }).first().innerText();
  const gameId = gameIdText.replace("Game ID:", "").trim();
  expect(gameId.length).toBeGreaterThan(0);

  const gameStateRes = await request.get(`${API_BASE}/api/games/${encodeURIComponent(gameId)}/state`, {
    headers: {
      Authorization: `Bearer ${seed.token}`,
      "x-school-id": seed.schoolId,
    },
  });
  expect(gameStateRes.ok()).toBeTruthy();
  const gameState = (await gameStateRes.json()) as {
    state?: {
      scoreByTeam?: Record<string, number>;
      events?: Array<unknown>;
    };
  };

  const totalPoints = Object.values(gameState.state?.scoreByTeam ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
  expect(totalPoints).toBeGreaterThanOrEqual(2);
  expect((gameState.state?.events ?? []).length).toBeGreaterThanOrEqual(2);

  await operatorContext.close();
  await coachContext.close();
});
