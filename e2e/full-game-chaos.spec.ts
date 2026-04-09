/**
 * Full-game chaos E2E test.
 * Exercises every operator button and flow in random order each run.
 * Covers: all shot types, all stat types (with every sub-type), substitutions,
 * timeouts, assists (multi-step), chain-assist, period advancement, possession
 * toggle, event editing & deletion, undo, game-summary modal, roster quick-
 * actions panel, and end-game / post-game screen.
 *
 * Prints the RNG seed so any failing run can be reproduced:
 *   PW_RNG_SEED=<seed> npx playwright test e2e/full-game-chaos.spec.ts
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = "http://localhost:4000";
const COACH_BASE = "http://localhost:5173";
const OPERATOR_BASE = "http://localhost:5174";
const AUTH_SESSION_KEY = "bta.coach.authSession";
const ROSTER_STORAGE_KEY = "shared-app-data-v3";

// ── Seeded LCG RNG ────────────────────────────────────────────────────────────
class Rng {
  readonly seed: number;
  private s: number;
  constructor(seed = process.env.PW_RNG_SEED ? Number(process.env.PW_RNG_SEED) : (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) {
    this.seed = seed;
    this.s = seed;
  }
  next(): number {
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0;
    return this.s / 0x100000000;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(p = 0.5): boolean { return this.next() < p; }
  weighted<T>(opts: ReadonlyArray<{ v: T; w: number }>): T {
    const total = opts.reduce((s, o) => s + o.w, 0);
    let r = this.next() * total;
    for (const o of opts) { r -= o.w; if (r <= 0) return o.v; }
    return opts[opts.length - 1].v;
  }
}

// ── Label constants (must match ModalRouter render output) ───────────────────
const FOUL_TYPE_LABELS = ["Personal", "Shooting", "Offensive", "Technical", "Flagrant"] as const;
const TURNOVER_TYPE_LABELS = ["Bad Pass", "Travel", "Double Dribble", "Out of Bounds", "Offensive Foul", "Steal", "Other"] as const;

// ── Seed / auth helpers ───────────────────────────────────────────────────────
type SeedResult = {
  schoolId: string; token: string; coachEmail: string;
  team: { id: string; name: string; abbreviation: string; teamColor: string; players: Array<{ id: string; name: string; number: string; position: string; grade: string }> };
};

function uniqueSeed(): string { return Date.now().toString(36); }

async function seedCoachAccountAndRoster(api: APIRequestContext): Promise<SeedResult> {
  const seed = uniqueSeed();
  const schoolId = `chaos-${seed}`;
  const coachEmail = `chaos.${seed}@bta.local`;
  const password = "Secret123!";

  const registerRes = await api.post(`${API_BASE}/api/auth/register`, {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    data: { fullName: "Chaos Coach", email: coachEmail, password, schoolName: "Chaos High", teamName: "Chaos Crew" },
  });
  expect(registerRes.ok()).toBeTruthy();
  const { token: regToken } = await registerRes.json() as { token: string };

  const players = [
    { id: "p-1", name: "Ava Lane",   number: "1", position: "G", grade: "11" },
    { id: "p-2", name: "Nora Cruz",  number: "2", position: "G", grade: "11" },
    { id: "p-3", name: "Maya Cole",  number: "3", position: "W", grade: "12" },
    { id: "p-4", name: "Jade King",  number: "4", position: "W", grade: "10" },
    { id: "p-5", name: "Lina Park",  number: "5", position: "C", grade: "12" },
    { id: "p-6", name: "Zoe Hart",   number: "6", position: "G", grade: "10" },
    { id: "p-7", name: "Kim Reed",   number: "7", position: "W", grade: "11" },
    { id: "p-8", name: "Sam Fox",    number: "8", position: "C", grade: "12" },
  ];

  await api.put(`${API_BASE}/config/roster-teams`, {
    headers: { Authorization: `Bearer ${regToken}`, "Content-Type": "application/json", "x-school-id": schoolId },
    data: { teams: [{ id: "chaos-team", name: "Chaos Crew", abbreviation: "CCH", teamColor: "#7c3aed", players }] },
  });

  await api.post(`${API_BASE}/api/onboarding/complete`, {
    headers: { Authorization: `Bearer ${regToken}`, "Content-Type": "application/json", "x-school-id": schoolId },
    data: { organizationName: "Chaos High Athletics", schoolName: "Chaos High", coachName: "Chaos Coach", coachEmail, teamName: "Chaos Crew", abbreviation: "CCH", season: "2026", teamColor: "#7c3aed", roster: players },
  });

  const loginRes = await api.post(`${API_BASE}/api/auth/login`, {
    headers: { "Content-Type": "application/json", "x-school-id": schoolId },
    data: { email: coachEmail, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const { token } = await loginRes.json() as { token: string };

  return { schoolId, token, coachEmail, team: { id: "chaos-team", name: "Chaos Crew", abbreviation: "CCH", teamColor: "#7c3aed", players } };
}

// ── Modal / overlay helpers ───────────────────────────────────────────────────
async function clearModals(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const overlay = page.locator(".modal-overlay");
    const confirmOverlay = page.locator(".confirm-dialog-overlay");
    const hasModal = await overlay.first().isVisible({ timeout: 200 }).catch(() => false);
    const hasConfirm = await confirmOverlay.first().isVisible({ timeout: 200 }).catch(() => false);
    if (!hasModal && !hasConfirm) break;

    if (hasConfirm) {
      const cancelBtn = page.locator(".confirm-btn-cancel").first();
      if (await cancelBtn.isVisible({ timeout: 200 }).catch(() => false)) {
        await cancelBtn.click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(100);
        continue;
      }
    }

    if (hasModal) {
      // Try 1: JS-click the modal-close button (bypasses interceptor checks)
      const dismissed = await page.evaluate(() => {
        const btn = document.querySelector<HTMLElement>(".modal-close");
        if (btn) { btn.click(); return true; }
        return false;
      }).catch(() => false);
      if (!dismissed) {
        // Try 2: JS-click the modal overlay backdrop directly
        await page.evaluate(() => {
          const ov = document.querySelector<HTMLElement>(".modal-overlay");
          if (ov) ov.click();
        }).catch(() => undefined);
      }
      await page.waitForTimeout(200);
    }
  }
}

async function dismissAnyChainPrompt(page: Page): Promise<void> {
  // ChainPromptBar sits inside .chain-prompt-bar — dismiss if visible
  const bar = page.locator(".chain-prompt-bar");
  if (await bar.isVisible({ timeout: 300 }).catch(() => false)) {
    const dismissBtn = bar.getByRole("button").last();
    if (await dismissBtn.isVisible({ timeout: 200 }).catch(() => false)) {
      await dismissBtn.click({ timeout: 2000 }).catch(() => undefined);
    }
  }
}

async function pickFirstPlayerInModal(page: Page): Promise<boolean> {
  const rows = page.locator(".player-list .player-row");
  const n = await rows.count();
  if (n === 0) return false;
  for (let i = 0; i < n; i++) {
    const txt = await rows.nth(i).innerText().catch(() => "");
    if (!txt.toLowerCase().includes("no players") && !txt.toLowerCase().includes("no other")) {
      await rows.nth(i).click({ timeout: 5000 }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function handleChainAssist(page: Page, rng: Rng): Promise<void> {
  const title = page.getByText(/Assist\s*[–-]\s*who passed/i);
  if (!await title.isVisible({ timeout: 500 }).catch(() => false)) return;
  if (rng.bool(0.55)) {
    const picked = await pickFirstPlayerInModal(page);
    if (!picked) await clearModals(page);
  } else {
    const noAssistBtn = page.getByRole("button", { name: /No assist/i }).first();
    if (await noAssistBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await noAssistBtn.click({ timeout: 3000 }).catch(() => undefined);
    } else {
      await clearModals(page);
    }
  }
  await dismissAnyChainPrompt(page);
}

// ── Operator action primitives ────────────────────────────────────────────────

async function doShot(page: Page, points: 2 | 3, made: boolean, rng: Rng): Promise<void> {
  await clearModals(page);
  await dismissAnyChainPrompt(page);
  const btns = page.locator(".classic-score-grid button").filter({ hasText: `${points}pt` });
  if (await btns.count() === 0) return;
  await btns.first().click({ timeout: 5000 });
  const toggle = page.getByRole("button", { name: made ? "Made" : "Miss" }).first();
  if (await toggle.isVisible({ timeout: 1500 }).catch(() => false)) await toggle.click({ timeout: 3000 }).catch(() => undefined);
  const picked = await pickFirstPlayerInModal(page);
  if (!picked) { await clearModals(page); return; }
  if (made) await handleChainAssist(page, rng);
  await clearModals(page);
}

async function doFreeThrow(page: Page, made: boolean, rng: Rng): Promise<void> {
  await clearModals(page);
  await dismissAnyChainPrompt(page);
  const btns = page.locator(".classic-score-grid button").filter({ hasText: "1pt" });
  if (await btns.count() === 0) return;
  await btns.first().click({ timeout: 5000 });
  const toggle = page.getByRole("button", { name: made ? "Made" : "Miss" }).first();
  if (await toggle.isVisible({ timeout: 1500 }).catch(() => false)) await toggle.click({ timeout: 3000 }).catch(() => undefined);
  const picked = await pickFirstPlayerInModal(page);
  if (!picked) { await clearModals(page); return; }
  await handleChainAssist(page, rng);
  await clearModals(page);
}

async function doStat(page: Page, btnText: RegExp | string, subtypeLabel?: string): Promise<void> {
  await clearModals(page);
  await dismissAnyChainPrompt(page);
  // Ensure we're on the Stats tab
  const statsTab = page.locator(".right-panel-toggle-row button").filter({ hasText: "Stats" });
  if (await statsTab.isVisible({ timeout: 400 }).catch(() => false) && !await statsTab.evaluate((el) => el.classList.contains("active")).catch(() => false)) {
    await statsTab.click();
  }
  const btn = page.locator(".stat-grid button").filter({ hasText: btnText }).first();
  if (!await btn.isVisible({ timeout: 600 }).catch(() => false)) return;
  await btn.click({ timeout: 5000 }).catch(() => undefined);
  if (subtypeLabel) {
    const stBtn = page.locator(".modal-subtype-btn").filter({ hasText: subtypeLabel }).first();
    if (await stBtn.isVisible({ timeout: 600 }).catch(() => false)) await stBtn.click({ timeout: 3000 }).catch(() => undefined);
  }
  const picked = await pickFirstPlayerInModal(page);
  if (!picked) { await clearModals(page); return; }
  await dismissAnyChainPrompt(page);
  await clearModals(page);
}

async function doAssistFlow(page: Page): Promise<void> {
  await clearModals(page);
  await dismissAnyChainPrompt(page);
  const statsTab = page.locator(".right-panel-toggle-row button").filter({ hasText: "Stats" });
  if (await statsTab.isVisible({ timeout: 400 }).catch(() => false) && !await statsTab.evaluate((el) => el.classList.contains("active")).catch(() => false)) {
    await statsTab.click();
  }
  const assistBtn = page.locator(".stat-grid button").filter({ hasText: "asst" }).first();
  if (!await assistBtn.isVisible({ timeout: 600 }).catch(() => false)) return;
  await assistBtn.click({ timeout: 5000 }).catch(() => undefined);
  // Step 1: pick passer
  if (!await pickFirstPlayerInModal(page)) { await clearModals(page); return; }
  // Step 2: pick scorer (different player – pick second if available)
  const scorerRows = page.locator(".player-list .player-row");
  const cnt = await scorerRows.count();
  if (cnt === 0) { await clearModals(page); return; }
  await scorerRows.nth(cnt > 1 ? 1 : 0).click({ timeout: 5000 }).catch(() => undefined);
  // Step 3: pick points
  const pointsBtns = page.locator(".event-pills button");
  if (await pointsBtns.count() > 0) {
    await pointsBtns.first().click({ timeout: 3000 }).catch(() => undefined);
  } else {
    await clearModals(page);
  }
  await dismissAnyChainPrompt(page);
  await clearModals(page);
}

async function doSub(page: Page): Promise<void> {
  await clearModals(page);
  await dismissAnyChainPrompt(page);
  const statsTab = page.locator(".right-panel-toggle-row button").filter({ hasText: "Stats" });
  if (await statsTab.isVisible({ timeout: 400 }).catch(() => false) && !await statsTab.evaluate((el) => el.classList.contains("active")).catch(() => false)) {
    await statsTab.click();
  }
  const subBtn = page.locator(".stat-grid button.red-out").first();
  if (!await subBtn.isVisible({ timeout: 500 }).catch(() => false)) return;
  await subBtn.click({ timeout: 5000 }).catch(() => undefined);
  // Sub-out: pick first on-court player (abort if none)
  const noPlayers = page.getByText("No players on court yet");
  if (await noPlayers.isVisible({ timeout: 400 }).catch(() => false)) { await clearModals(page); return; }
  if (!await pickFirstPlayerInModal(page)) { await clearModals(page); return; }
  // Sub-in: pick first bench player
  if (!await pickFirstPlayerInModal(page)) { await clearModals(page); return; }
  await clearModals(page);
}

async function doTimeout(page: Page, myTeam: boolean, type: "short" | "full"): Promise<void> {
  await clearModals(page);
  await dismissAnyChainPrompt(page);
  const strips = page.locator(".shot-timeout-strip");
  const strip = strips.nth(myTeam ? 0 : 1);
  if (!await strip.isVisible({ timeout: 500 }).catch(() => false)) return;
  const pill = strip.locator(".to-pill").filter({ hasText: type === "short" ? "30s" : "60s" });
  if (!await pill.isVisible({ timeout: 400 }).catch(() => false)) return;
  if (await pill.isDisabled({ timeout: 400 }).catch(() => true)) return;
  await pill.click({ timeout: 3000 }).catch(() => undefined);
}

async function doQuickRosterAction(page: Page, actionText: string, rng: Rng): Promise<void> {
  await clearModals(page);
  await dismissAnyChainPrompt(page);
  const playersTab = page.locator(".right-panel-toggle-row button").filter({ hasText: "Players" });
  if (!await playersTab.isVisible({ timeout: 400 }).catch(() => false)) return;
  await playersTab.click({ timeout: 2000 }).catch(() => undefined);
  const onCourtPlayers = page.locator(".roster-player.on-court");
  const cnt = await onCourtPlayers.count();
  if (cnt === 0) {
    await page.locator(".right-panel-toggle-row button").filter({ hasText: "Stats" }).click({ timeout: 2000 }).catch(() => undefined);
    return;
  }
  // Pick a random on-court player
  await onCourtPlayers.nth(rng.int(0, cnt - 1)).locator(".roster-player-tap").click({ timeout: 3000 }).catch(() => undefined);
  const qaBtn = page.locator(".pqa-btn").filter({ hasText: actionText }).first();
  if (await qaBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await qaBtn.click({ timeout: 3000 }).catch(() => undefined);
  }
  // Handle downstream modal (FT or sub)
  const overlay = page.locator(".modal-overlay");
  if (await overlay.first().isVisible({ timeout: 600 }).catch(() => false)) {
    const madeBtn = page.getByRole("button", { name: "Made" }).first();
    if (await madeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      // Shot modal: pick "Made" then player, then handle optional chain-assist
      await madeBtn.click({ timeout: 2000 }).catch(() => undefined);
      await pickFirstPlayerInModal(page);
      await handleChainAssist(page, rng);
    } else {
      // Sub or FT modal: pick player(s)
      const picked = await pickFirstPlayerInModal(page);
      if (picked) await pickFirstPlayerInModal(page);
    }
  }
  await clearModals(page);
  await page.locator(".right-panel-toggle-row button").filter({ hasText: "Stats" }).click({ timeout: 2000 }).catch(() => undefined);
}

async function doUndo(page: Page): Promise<void> {
  await clearModals(page);
  const btn = page.locator(".live-nav-btn-undo");
  if (!await btn.isVisible({ timeout: 400 }).catch(() => false)) return;
  await btn.click({ timeout: 3000 }).catch(() => undefined);
  // Confirm if a dialog appears
  const confirmBtn = page.locator(".confirm-btn-primary").first();
  if (await confirmBtn.isVisible({ timeout: 600 }).catch(() => false)) {
    await confirmBtn.click({ timeout: 3000 }).catch(() => undefined);
  }
}

async function openCloseSummary(page: Page): Promise<void> {
  await clearModals(page);
  // Wait until no modal overlay is blocking the nav bar
  await page.waitForFunction(() => !document.querySelector(".modal-overlay"), { timeout: 5000 }).catch(() => undefined);
  const btn = page.locator(".live-nav-btn").filter({ hasText: "Summary" });
  if (!await btn.isVisible({ timeout: 400 }).catch(() => false)) return;
  // Use JS click to avoid interceptor issues
  await btn.evaluate((el) => (el as HTMLButtonElement).click());
  const overlay = page.locator(".modal-overlay");
  await overlay.first().waitFor({ state: "visible", timeout: 3000 }).catch(() => undefined);
  // Close via JS click on modal-close
  await page.evaluate(() => {
    const btn2 = document.querySelector<HTMLElement>(".modal-close");
    if (btn2) btn2.click();
  }).catch(() => undefined);
  await page.waitForTimeout(200);
  await clearModals(page);
}

async function clickPossession(page: Page, rng: Rng): Promise<void> {
  await clearModals(page);
  const cards = page.locator(".scoreboard-team-card-poss-clickable");
  const n = await cards.count();
  if (n === 0) return;
  await cards.nth(rng.int(0, n - 1)).click({ timeout: 3000 }).catch(() => undefined);
}

async function advancePeriod(page: Page, label: string): Promise<void> {
  await clearModals(page);
  await page.waitForFunction(() => !document.querySelector(".modal-overlay"), { timeout: 5000 }).catch(() => undefined);
  const btn = page.locator(".period-btn").filter({ hasText: label }).first();
  if (!await btn.isVisible({ timeout: 2000 }).catch(() => false)) return;
  await btn.click({ timeout: 5000 }).catch(() => undefined);
  // Confirm skip-ahead if dialog appears
  const confirmBtn = page.locator(".confirm-btn-primary").first();
  if (await confirmBtn.isVisible({ timeout: 800 }).catch(() => false)) {
    await confirmBtn.click({ timeout: 3000 }).catch(() => undefined);
  }
}

async function editFirstFeedEvent(page: Page): Promise<void> {
  await clearModals(page);
  const items = page.locator(".feed-item");
  const n = await items.count();
  for (let i = 0; i < Math.min(n, 8); i++) {
    await items.nth(i).click({ timeout: 3000 }).catch(() => undefined);
    const overlay = page.locator(".modal-overlay");
    if (await overlay.first().isVisible({ timeout: 500 }).catch(() => false)) {
      // Just open and close – proving the edit modal opens without crashing
      await clearModals(page);
      return;
    }
  }
}

async function deleteOneFeedEvent(page: Page): Promise<void> {
  await clearModals(page);
  const items = page.locator(".feed-item");
  const n = await items.count();
  for (let i = 0; i < Math.min(n, 10); i++) {
    await items.nth(i).click({ timeout: 3000 }).catch(() => undefined);
    const deleteBtn = page.locator(".modal-delete-btn").first();
    if (await deleteBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await deleteBtn.click({ timeout: 3000 }).catch(() => undefined);
      const confirmBtn = page.locator(".confirm-btn-primary").first();
      if (await confirmBtn.isVisible({ timeout: 800 }).catch(() => false)) {
        await confirmBtn.click({ timeout: 3000 }).catch(() => undefined);
      }
      await clearModals(page);
      return;
    }
    await clearModals(page);
  }
}

// ── Action catalogue ──────────────────────────────────────────────────────────
type ActionKind =
  | "2pt_made" | "2pt_miss" | "3pt_made" | "3pt_miss"
  | "ft_made"  | "ft_miss"
  | "def_reb"  | "off_reb"
  | "foul"     | "turnover" | "steal" | "block" | "assist"
  | "quick_shot_2_made" | "quick_shot_3_made" | "quick_shot_2_miss"
  | "quick_stat_reb"    | "quick_stat_foul"   | "quick_stat_to"
  | "quick_stat_stl"    | "quick_stat_blk";

const ACTION_WEIGHTS: ReadonlyArray<{ v: ActionKind; w: number }> = [
  { v: "2pt_made",   w: 28 }, { v: "2pt_miss",   w: 10 },
  { v: "3pt_made",   w: 10 }, { v: "3pt_miss",   w:  7 },
  { v: "ft_made",    w:  6 }, { v: "ft_miss",    w:  3 },
  { v: "def_reb",    w:  8 }, { v: "off_reb",    w:  4 },
  { v: "foul",       w:  7 }, { v: "turnover",   w:  7 },
  { v: "steal",      w:  5 }, { v: "block",      w:  4 },
  { v: "assist",     w:  5 },
  { v: "quick_shot_2_made", w: 4 }, { v: "quick_shot_3_made", w: 3 },
  { v: "quick_shot_2_miss", w: 2 },
  { v: "quick_stat_reb",    w: 3 }, { v: "quick_stat_foul",   w: 3 },
  { v: "quick_stat_to",     w: 3 }, { v: "quick_stat_stl",    w: 2 },
  { v: "quick_stat_blk",    w: 2 },
];

async function runAction(page: Page, kind: ActionKind, rng: Rng): Promise<void> {
  switch (kind) {
    case "2pt_made":   return doShot(page, 2, true,  rng);
    case "2pt_miss":   return doShot(page, 2, false, rng);
    case "3pt_made":   return doShot(page, 3, true,  rng);
    case "3pt_miss":   return doShot(page, 3, false, rng);
    case "ft_made":    return doFreeThrow(page, true,  rng);
    case "ft_miss":    return doFreeThrow(page, false, rng);
    case "def_reb":    return doStat(page, "DEF");
    case "off_reb":    return doStat(page, "OFF");
    case "foul":       return doStat(page, "foul",     rng.pick(FOUL_TYPE_LABELS));
    case "turnover":   return doStat(page, "to",       rng.pick(TURNOVER_TYPE_LABELS));
    case "steal":      return doStat(page, "stl");
    case "block":      return doStat(page, "blk");
    case "assist":     return doAssistFlow(page);
    case "quick_shot_2_made": return doQuickRosterAction(page, "2PT ✓", rng);
    case "quick_shot_3_made": return doQuickRosterAction(page, "3PT ✓", rng);
    case "quick_shot_2_miss": return doQuickRosterAction(page, "2PT ✗", rng);
    case "quick_stat_reb":   return doQuickRosterAction(page, "REB",   rng);
    case "quick_stat_foul":  return doQuickRosterAction(page, "FOUL",  rng);
    case "quick_stat_to":    return doQuickRosterAction(page, "TO",    rng);
    case "quick_stat_stl":   return doQuickRosterAction(page, "STL",   rng);
    case "quick_stat_blk":   return doQuickRosterAction(page, "BLK",   rng);
  }
}

// ── Test ──────────────────────────────────────────────────────────────────────
test.setTimeout(240_000);

test("randomized full-game chaos — all features, all buttons", async ({ browser, request }) => {
  const rng = new Rng();
  console.log(`\n[chaos] RNG seed: ${rng.seed}  (set PW_RNG_SEED=${rng.seed} to reproduce)\n`);

  // ── 1. Seed account + roster ───────────────────────────────────────────────
  const seed = await seedCoachAccountAndRoster(request);

  // ── 2. Coach browser — launch game ────────────────────────────────────────
  const coachCtx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    storageState: {
      cookies: [],
      origins: [{
        origin: COACH_BASE,
        localStorage: [
          { name: "coach:tutorial-complete", value: "1" },
          { name: AUTH_SESSION_KEY, value: JSON.stringify({ token: seed.token, email: seed.coachEmail, fullName: "Chaos Coach", role: "owner", schoolId: seed.schoolId, lastLoginAtIso: null }) },
          { name: ROSTER_STORAGE_KEY, value: JSON.stringify({ teams: [seed.team] }) },
        ],
      }],
    },
  });
  const coachPage = await coachCtx.newPage();

  for (const pattern of ["**/api/auth/session**", "**/api/onboarding/state**"]) {
    await coachPage.route(pattern, async (route) => {
      if (pattern.includes("session")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, token: seed.token, user: { accountId: `acct-${seed.schoolId}`, email: seed.coachEmail, fullName: "Chaos Coach", role: "owner", schoolId: seed.schoolId }, onboarding: { completed: true } }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true, hasAccount: true, hasProfile: true, hasTeam: true, teamCount: 1 }) });
      }
    });
  }

  await coachPage.goto(`${COACH_BASE}/live?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });
  await expect(coachPage.getByRole("heading", { name: "Start New Game" })).toBeVisible({ timeout: 15_000 });
  await expect(coachPage.getByRole("button", { name: seed.team.name, exact: true })).toBeVisible({ timeout: 15_000 });
  await coachPage.getByRole("button", { name: seed.team.name, exact: true }).click();
  await coachPage.getByPlaceholder("e.g. Opponent").fill("Chaos Rivals");

  for (const p of seed.team.players.slice(0, 5)) {
    await coachPage.getByRole("button", { name: new RegExp(p.name) }).click();
  }

  await coachPage.getByRole("button", { name: "Launch Game" }).click();
  await expect(coachPage.getByRole("heading", { name: "Live Game Controls" })).toBeVisible({ timeout: 15_000 });

  const connectionCode = (await coachPage.locator(".settings-pairing-code").first().innerText()).trim();
  expect(connectionCode).toMatch(/^\d{6}$/);

  // ── 3. Operator browser ────────────────────────────────────────────────────
  const opCtx = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    storageState: {
      cookies: [],
      origins: [{
        origin: OPERATOR_BASE,
        localStorage: [
          { name: "ipo:tutorial-complete", value: "1" },
          {
            name: ROSTER_STORAGE_KEY,
            value: JSON.stringify({
              teams: [{
                id: seed.team.id, name: seed.team.name, abbreviation: "CCH",
                players: seed.team.players.map(p => ({ id: p.id, number: p.number, name: p.name, position: p.position })),
              }],
              gameSetup: {
                gameId: "game-chaos-1",
                connectionId: connectionCode,
                syncedConnectionId: connectionCode,
                myTeamId: seed.team.id,
                apiUrl: API_BASE,
                schoolId: seed.schoolId,
                opponent: "Chaos Rivals",
                vcSide: "home",
                dashboardUrl: `${COACH_BASE}/live?schoolId=${seed.schoolId}`,
                clockVisible: true, clockEnabled: true,
                trackClock: true, trackPossession: true, trackTimeouts: true,
                opponentTrackStats: ["points", "free_throws", "def_reb", "off_reb", "turnover", "steal", "assist", "block", "foul"],
                homeTeamColor: "#7c3aed", awayTeamColor: "#f87171",
                startingLineup: ["p-1", "p-2", "p-3", "p-4", "p-5"],
                apiKey: seed.token,
              },
            }),
          },
        ],
      }],
    },
  });
  const opPage = await opCtx.newPage();
  await opPage.goto(`${OPERATOR_BASE}/?schoolId=${seed.schoolId}`, { waitUntil: "domcontentloaded" });
  await opPage.getByLabel("Connection code").fill(connectionCode);
  await opPage.getByRole("button", { name: "Sync Now" }).click();
  await expect(opPage.getByRole("button", { name: "Start Game" })).toBeEnabled({ timeout: 10_000 });
  await opPage.getByRole("button", { name: "Start Game" }).click();
  await expect(opPage.locator(".classic-score-grid")).toBeVisible({ timeout: 10_000 });

  // ── 4. Q1 — 14 random actions ──────────────────────────────────────────────
  console.log("[chaos] Q1 begins");
  for (let i = 0; i < 14; i++) {
    const kind = rng.weighted(ACTION_WEIGHTS);
    console.log(`  Q1 action ${i + 1}: ${kind}`);
    await runAction(opPage, kind, rng);
    if (i === 4)  await doTimeout(opPage, true,  rng.bool() ? "short" : "full");
    if (i === 9)  await doTimeout(opPage, false, "short");
    if (i === 11) await doSub(opPage);
  }

  // ── 5. Q2 — 14 random actions + edit + delete + summary + undo ────────────
  await advancePeriod(opPage, "Q2");
  await clickPossession(opPage, rng);
  console.log("[chaos] Q2 begins");
  for (let i = 0; i < 14; i++) {
    const kind = rng.weighted(ACTION_WEIGHTS);
    console.log(`  Q2 action ${i + 1}: ${kind}`);
    await runAction(opPage, kind, rng);
    if (i === 3)  await doSub(opPage);
    if (i === 7)  await doTimeout(opPage, true, "full");
    if (i === 11) { await doSub(opPage); await doSub(opPage); } // Double sub
  }
  // Edit, delete, summary, undo mid-game
  await editFirstFeedEvent(opPage);
  await deleteOneFeedEvent(opPage);
  await openCloseSummary(opPage);
  await doUndo(opPage);
  await clickPossession(opPage, rng);

  // ── 6. Q3 — 14 random actions ──────────────────────────────────────────────
  await advancePeriod(opPage, "Q3");
  console.log("[chaos] Q3 begins");
  for (let i = 0; i < 14; i++) {
    const kind = rng.weighted(ACTION_WEIGHTS);
    console.log(`  Q3 action ${i + 1}: ${kind}`);
    await runAction(opPage, kind, rng);
    if (i === 6)  await doTimeout(opPage, rng.bool() ? true : false, "full");
    if (i === 10) await doSub(opPage);
  }

  // ── 7. Q4 — 14 random actions + all remaining foul/TO subtypes ────────────
  await advancePeriod(opPage, "Q4");
  await clickPossession(opPage, rng);
  console.log("[chaos] Q4 begins");
  // Force all foul types once each
  for (const ft of FOUL_TYPE_LABELS) {
    await doStat(opPage, "foul", ft);
  }
  // Force all turnover types once each
  for (const tt of TURNOVER_TYPE_LABELS) {
    await doStat(opPage, "to", tt);
  }
  // Continue with random actions
  for (let i = 0; i < 10; i++) {
    const kind = rng.weighted(ACTION_WEIGHTS);
    console.log(`  Q4 action ${i + 1}: ${kind}`);
    await runAction(opPage, kind, rng);
    if (i === 5) await doTimeout(opPage, false, "full");
    if (i === 8) await doUndo(opPage);
  }
  await doSub(opPage);

  // ── 8. Resolve game ID candidates and assert events before ending game ─────
  const gameIdCandidates = new Set<string>();
  const gameIdText = await coachPage.locator(".settings-section-desc", { hasText: "Game ID:" }).first().innerText().catch(() => "");
  const coachGameId = gameIdText.replace("Game ID:", "").trim();
  if (coachGameId) {
    gameIdCandidates.add(coachGameId);
  }

  const activeStateRes = await request.get(`${API_BASE}/api/games/active/state`, {
    headers: { Authorization: `Bearer ${seed.token}`, "x-school-id": seed.schoolId },
  });
  if (activeStateRes.ok()) {
    const activeState = await activeStateRes.json() as { gameId?: string | null };
    if (activeState?.gameId) {
      gameIdCandidates.add(activeState.gameId);
    }
  }

  const activeSetupRes = await request.get(`${API_BASE}/api/games/active/setup`, {
    headers: { Authorization: `Bearer ${seed.token}`, "x-school-id": seed.schoolId },
  });
  if (activeSetupRes.ok()) {
    const activeSetup = await activeSetupRes.json() as { activeGameId?: string | null };
    if (activeSetup?.activeGameId) {
      gameIdCandidates.add(activeSetup.activeGameId);
    }
  }

  const gamesRes = await request.get(`${API_BASE}/api/games`, {
    headers: { Authorization: `Bearer ${seed.token}`, "x-school-id": seed.schoolId },
  });
  if (gamesRes.ok()) {
    const games = await gamesRes.json() as Array<{ gameId?: string; opponent?: string }>;
    for (const game of games) {
      if (game?.gameId && typeof game.gameId === "string" && game.opponent === "Chaos Rivals") {
        gameIdCandidates.add(game.gameId);
      }
    }
  }

  // Operator local setup uses this as a fallback gameId in this test.
  gameIdCandidates.add("game-chaos-1");
  console.log(`[chaos] gameId candidates: ${Array.from(gameIdCandidates).join(", ")}`);

  // ── 9. API assertion — at least 30 events logged (must be pre-endgame) ────
  let resolvedGameId = "";
  let resolvedEvents: unknown[] | null = null;
  const statusByGameId: Array<{ gameId: string; status: number }> = [];

  for (const candidate of gameIdCandidates) {
    const eventsRes = await request.get(`${API_BASE}/api/games/${candidate}/events`, {
      headers: { Authorization: `Bearer ${seed.token}`, "x-school-id": seed.schoolId },
    });
    statusByGameId.push({ gameId: candidate, status: eventsRes.status() });

    if (!eventsRes.ok()) {
      continue;
    }

    const payload = await eventsRes.json() as unknown;
    const events = Array.isArray(payload)
      ? payload
      : (payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown[] }).events)
        ? (payload as { events: unknown[] }).events
        : []);

    resolvedGameId = candidate;
    resolvedEvents = events;
    break;
  }

  expect(resolvedEvents !== null, `Could not fetch events for any candidate gameId. Statuses: ${JSON.stringify(statusByGameId)}`).toBeTruthy();
  const events = resolvedEvents ?? [];
  console.log(`[chaos] resolved gameId: ${resolvedGameId}`);
  console.log(`[chaos] total events in API: ${events.length}`);
  expect(events.length).toBeGreaterThan(30);

  // ── 10. End game ───────────────────────────────────────────────────────────
  await clearModals(opPage);
  const endBtn = opPage.locator(".live-nav-btn-end");
  await expect(endBtn).toBeVisible({ timeout: 5_000 });
  await endBtn.click();
  const confirmEnd = opPage.locator(".confirm-btn-primary").first();
  if (await confirmEnd.isVisible({ timeout: 1500 }).catch(() => false)) {
    await confirmEnd.click();
  }

  // ── 11. Post-game screen ──────────────────────────────────────────────────
  const submitBtn = opPage.getByRole("button", { name: /Submit Game/i });
  await expect(submitBtn).toBeVisible({ timeout: 10_000 });

  await opCtx.close();
  await coachCtx.close();
});
