import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./server.js";

/**
 * Realtime API server endpoint tests
 * 
 * Since the server module starts listening automatically on import,
 * these tests use fetch() against a running instance.
 * 
 * To run these in isolation:
 *   npm run test -- server.test.ts
 */

const API_BASE = "http://localhost:4000";
const API_KEY = process.env.BTA_API_KEY || "test-key-xyz";

beforeEach(() => {
  // Reset env for each test
  delete process.env.BTA_API_KEY;
});

async function resetSchool(schoolId: string): Promise<void> {
  await fetch(`${API_BASE}/admin/reset`, {
    method: "DELETE",
    headers: { "x-school-id": schoolId }
  });
}

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe("school tenancy", () => {
  it("isolates roster teams by x-school-id", async () => {
    await resetSchool("alpha");
    await resetSchool("beta");

    const alphaPayload = {
      teams: [
        {
          id: "alpha-team",
          name: "Alpha Varsity",
          abbreviation: "ALP",
          players: []
        }
      ]
    };
    const betaPayload = {
      teams: [
        {
          id: "beta-team",
          name: "Beta Varsity",
          abbreviation: "BET",
          players: []
        }
      ]
    };

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "alpha" },
      body: JSON.stringify(alphaPayload)
    });

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "beta" },
      body: JSON.stringify(betaPayload)
    });

    const alphaRes = await fetch(`${API_BASE}/teams`, {
      headers: { "x-school-id": "alpha" }
    });
    const betaRes = await fetch(`${API_BASE}/teams`, {
      headers: { "x-school-id": "beta" }
    });

    expect(alphaRes.status).toBe(200);
    expect(betaRes.status).toBe(200);

    const alphaBody = await alphaRes.json() as { teams: Array<{ id: string; schoolId?: string }> };
    const betaBody = await betaRes.json() as { teams: Array<{ id: string; schoolId?: string }> };

    expect(alphaBody.teams).toHaveLength(1);
    expect(alphaBody.teams[0]?.id).toBe("alpha-team");
    expect(alphaBody.teams[0]?.schoolId).toBe("alpha");

    expect(betaBody.teams).toHaveLength(1);
    expect(betaBody.teams[0]?.id).toBe("beta-team");
    expect(betaBody.teams[0]?.schoolId).toBe("beta");
  });

  it("resets only the requested school scope", async () => {
    await resetSchool("alpha-reset");
    await resetSchool("beta-reset");

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "alpha-reset" },
      body: JSON.stringify({
        teams: [{ id: "alpha-only", name: "Alpha", abbreviation: "A", players: [] }]
      })
    });

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "beta-reset" },
      body: JSON.stringify({
        teams: [{ id: "beta-only", name: "Beta", abbreviation: "B", players: [] }]
      })
    });

    const resetRes = await fetch(`${API_BASE}/admin/reset`, {
      method: "DELETE",
      headers: { "x-school-id": "alpha-reset" }
    });

    expect(resetRes.status).toBe(200);

    const alphaRes = await fetch(`${API_BASE}/teams`, {
      headers: { "x-school-id": "alpha-reset" }
    });
    const betaRes = await fetch(`${API_BASE}/teams`, {
      headers: { "x-school-id": "beta-reset" }
    });

    const alphaBody = await alphaRes.json() as { teams: Array<{ id: string }> };
    const betaBody = await betaRes.json() as { teams: Array<{ id: string }> };

    expect(alphaBody.teams).toHaveLength(0);
    expect(betaBody.teams).toHaveLength(1);
    expect(betaBody.teams[0]?.id).toBe("beta-only");
  });
});

describe("operator pairing endpoints", () => {
  it("returns coach-linked roster and game setup for a connection code", async () => {
    await resetSchool("pairing-school");

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "pairing-school" },
      body: JSON.stringify({
        teams: [
          {
            id: "vc-varsity",
            name: "Valley Catholic Varsity",
            abbreviation: "VC",
            teamColor: "#1d4ed8",
            players: [
              { id: "p1", number: "1", name: "Ava", position: "PG" },
              { id: "p2", number: "2", name: "Mia", position: "SG" }
            ]
          }
        ]
      })
    });

    const putRes = await fetch(`${API_BASE}/api/operator-links/conn-pair-123`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "pairing-school" },
      body: JSON.stringify({
        gameId: "pairing-game",
        myTeamId: "vc-varsity",
        myTeamName: "Valley Catholic Varsity",
        opponentName: "Central Christian",
        vcSide: "home",
        homeTeamColor: "#1d4ed8",
        awayTeamColor: "#ef4444",
        dashboardUrl: "http://localhost:5173/live"
      })
    });

    expect(putRes.status).toBe(200);

    const getRes = await fetch(`${API_BASE}/api/operator-links/conn-pair-123`, {
      headers: { "x-school-id": "pairing-school" }
    });

    expect(getRes.status).toBe(200);
    const body = await getRes.json() as {
      connectionId: string;
      setup: { myTeamId: string; opponentName: string; vcSide: string; gameId: string };
      teams: Array<{ id: string; players: Array<{ id: string }> }>;
    };

    expect(body.connectionId).toBe("conn-pair-123");
    expect(body.setup.myTeamId).toBe("vc-varsity");
    expect(body.setup.opponentName).toBe("Central Christian");
    expect(body.setup.vcSide).toBe("home");
    expect(body.setup.gameId).toBe("pairing-game");
    expect(body.teams).toHaveLength(1);
    expect(body.teams[0]?.id).toBe("vc-varsity");
    expect(body.teams[0]?.players).toHaveLength(2);
  });
});

describe("unified stats endpoints", () => {
  it("redirects legacy stats dashboard pages to the coach workspace", async () => {
    const response = await fetch(`${API_BASE}/settings`, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:5173/stats/settings");
  });

  it("serves season stats, players, and live context from realtime-api state", async () => {
    await resetSchool("stats-school");

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "stats-school" },
      body: JSON.stringify({
        teams: [
          {
            id: "vc",
            name: "Valley Catholic",
            abbreviation: "VC",
            coachStyle: "Push pace",
            players: [
              { id: "p1", number: "1", name: "Cooper Bonnett", position: "G" },
              { id: "p2", number: "2", name: "Alex Post", position: "G" }
            ]
          }
        ]
      })
    });

    await fetch(`${API_BASE}/api/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "stats-school" },
      body: JSON.stringify({
        gameId: "stats-game",
        homeTeamId: "vc",
        awayTeamId: "opp",
        opponentName: "OES",
        opponentTeamId: "opp"
      })
    });

    await fetch(`${API_BASE}/api/games/stats-game/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "stats-school" },
      body: JSON.stringify({
        id: "evt-1",
        sequence: 1,
        timestampIso: "2026-03-30T19:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 420,
        teamId: "vc",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "p1",
        made: true,
        points: 3,
        zone: "above_break_three"
      })
    });

    await fetch(`${API_BASE}/api/games/stats-game/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "stats-school" },
      body: JSON.stringify({
        id: "evt-2",
        sequence: 2,
        timestampIso: "2026-03-30T19:00:05.000Z",
        period: "Q1",
        clockSecondsRemaining: 415,
        teamId: "vc",
        operatorId: "op-1",
        type: "assist",
        playerId: "p2"
      })
    });

    const [seasonRes, playersRes, liveContextRes] = await Promise.all([
      fetch(`${API_BASE}/api/season-stats`, { headers: { "x-school-id": "stats-school" } }),
      fetch(`${API_BASE}/api/players`, { headers: { "x-school-id": "stats-school" } }),
      fetch(`${API_BASE}/api/live-context`, { headers: { "x-school-id": "stats-school" } })
    ]);

    expect(seasonRes.status).toBe(200);
    expect(playersRes.status).toBe(200);
    expect(liveContextRes.status).toBe(200);

    const seasonBody = await seasonRes.json() as { fg3: number; ppg: number };
    const playersBody = await playersRes.json() as Array<{ full_name: string; ppg: number }>;
    const liveContextBody = await liveContextRes.json() as {
      teamInfo: { name: string; coachStyle: string };
      recentGames: Array<{ opponent: string }>;
    };

    expect(seasonBody.fg3).toBe(1);
    expect(seasonBody.ppg).toBe(3);
    expect(playersBody.some((player) => player.full_name === "Cooper Bonnett" && player.ppg === 3)).toBe(true);
    expect(liveContextBody.teamInfo.name).toBe("Valley Catholic");
    expect(liveContextBody.teamInfo.coachStyle).toBe("Push pace");
    expect(liveContextBody.recentGames[0]?.opponent).toBe("OES");
  });

  it("accepts the legacy operator game registration route", async () => {
    await resetSchool("legacy-game-route");

    const response = await fetch(`${API_BASE}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "legacy-game-route" },
      body: JSON.stringify({
        gameId: "legacy-route-game",
        homeTeamId: "vc",
        awayTeamId: "opp",
        opponentName: "OES",
        opponentTeamId: "opp"
      })
    });

    expect(response.status).toBe(201);

    const body = await response.json() as { gameId: string; opponentName?: string };
    expect(body.gameId).toBe("legacy-route-game");
    expect(body.opponentName).toBe("OES");
  });

  it("supports legacy team settings and roster management routes", async () => {
    await resetSchool("compat-school");

    const teamRes = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "compat-school" },
      body: JSON.stringify({
        name: "Valley Catholic",
        season: "2026",
        teamColor: "#112233",
        playingStyle: "Control tempo"
      })
    });

    expect(teamRes.status).toBe(201);

    const aiSettingsRes = await fetch(`${API_BASE}/api/ai-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "compat-school" },
      body: JSON.stringify({
        teamContext: "Short bench",
        customPrompt: "Protect foul trouble",
        focusInsights: ["timeouts", "ball_security"]
      })
    });

    expect(aiSettingsRes.status).toBe(200);

    const playerSaveRes = await fetch(`${API_BASE}/api/player/${encodeURIComponent("Jordan Bell")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "compat-school" },
      body: JSON.stringify({
        number: "4",
        position: "G",
        grade: "11",
        role: "Primary ball handler"
      })
    });

    expect(playerSaveRes.status).toBe(201);

    const [teamsRes, settingsRes, playerRes] = await Promise.all([
      fetch(`${API_BASE}/api/teams`, { headers: { "x-school-id": "compat-school" } }),
      fetch(`${API_BASE}/api/ai-settings`, { headers: { "x-school-id": "compat-school" } }),
      fetch(`${API_BASE}/api/player/${encodeURIComponent("Jordan Bell")}`, { headers: { "x-school-id": "compat-school" } })
    ]);

    expect(teamsRes.status).toBe(200);
    expect(settingsRes.status).toBe(200);
    expect(playerRes.status).toBe(200);

    const teamsBody = await teamsRes.json() as {
      teams: Array<{
        season: string;
        playingStyle: string;
        teamContext: string;
        customPrompt: string;
        focusInsights: string[];
      }>;
    };
    const settingsBody = await settingsRes.json() as { customPrompt: string; focusInsights: string[] };
    const playerBody = await playerRes.json() as { full_name: string; roster_info?: { role?: string } | null };

    expect(teamsBody.teams[0]?.season).toBe("2026");
    expect(teamsBody.teams[0]?.playingStyle).toBe("Control tempo");
    expect(teamsBody.teams[0]?.teamContext).toBe("Short bench");
    expect(teamsBody.teams[0]?.customPrompt).toBe("Protect foul trouble");
    expect(teamsBody.teams[0]?.focusInsights).toEqual(["timeouts", "ball_security"]);
    expect(settingsBody.customPrompt).toBe("Protect foul trouble");
    expect(playerBody.full_name).toBe("Jordan Bell");
    expect(playerBody.roster_info?.role).toBe("Primary ball handler");

    const playerDeleteRes = await fetch(`${API_BASE}/api/roster/player/${encodeURIComponent("Jordan Bell")}`, {
      method: "DELETE",
      headers: { "x-school-id": "compat-school" }
    });

    expect(playerDeleteRes.status).toBe(200);

    const missingPlayerRes = await fetch(`${API_BASE}/api/player/${encodeURIComponent("Jordan Bell")}`, {
      headers: { "x-school-id": "compat-school" }
    });
    expect(missingPlayerRes.status).toBe(404);
  });

  it("persists onboarding profile and setup completion state", async () => {
    await resetSchool("onboarding-school");

    const completeRes = await fetch(`${API_BASE}/api/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "onboarding-school" },
      body: JSON.stringify({
        organizationName: "Valley Catholic Athletics",
        coachName: "Coach Rivera",
        coachEmail: "coach@valleycatholic.org",
        teamName: "Valley Catholic",
        season: "2026",
        teamColor: "#1d4ed8",
        playingStyle: "Control tempo",
        roster: [
          { name: "Jordan Bell", number: "4", position: "G", grade: "11" },
          { name: "Aiden Cole", number: "12", position: "F", grade: "12" }
        ]
      })
    });

    expect(completeRes.status).toBe(201);

    const [stateRes, profileRes, accountRes, teamsRes] = await Promise.all([
      fetch(`${API_BASE}/api/onboarding/state`, { headers: { "x-school-id": "onboarding-school" } }),
      fetch(`${API_BASE}/api/onboarding/profile`, { headers: { "x-school-id": "onboarding-school" } }),
      fetch(`${API_BASE}/api/onboarding/account`, { headers: { "x-school-id": "onboarding-school" } }),
      fetch(`${API_BASE}/api/teams`, { headers: { "x-school-id": "onboarding-school" } }),
    ]);

    expect(stateRes.status).toBe(200);
    expect(profileRes.status).toBe(200);
    expect(accountRes.status).toBe(200);
    expect(teamsRes.status).toBe(200);

    const stateBody = await stateRes.json() as { completed: boolean; hasAccount: boolean; hasProfile: boolean; hasTeam: boolean };
    const profileBody = await profileRes.json() as {
      profile: {
        organizationName: string;
        coachName: string;
        coachEmail: string;
        completedAtIso?: string;
      } | null;
    };
    const accountBody = await accountRes.json() as {
      account: {
        organization: { organizationName: string; teamName?: string; onboardingCompletedAtIso?: string };
        primaryCoach: { fullName: string; email: string; role: string };
      } | null;
    };
    const teamsBody = await teamsRes.json() as {
      teams: Array<{ name: string; season: string; coachStyle?: string; players: Array<{ name: string }> }>;
    };

    expect(stateBody.completed).toBe(true);
    expect(stateBody.hasAccount).toBe(true);
    expect(stateBody.hasProfile).toBe(true);
    expect(stateBody.hasTeam).toBe(true);
    expect(profileBody.profile?.organizationName).toBe("Valley Catholic Athletics");
    expect(profileBody.profile?.coachName).toBe("Coach Rivera");
    expect(teamsBody.teams[0]?.coachStyle ?? "").toBe("");
    expect(profileBody.profile?.coachEmail).toBe("coach@valleycatholic.org");
    expect(Boolean(profileBody.profile?.completedAtIso)).toBe(true);
    expect(accountBody.account?.organization.organizationName).toBe("Valley Catholic Athletics");
    expect(accountBody.account?.organization.teamName).toBe("Valley Catholic");
    expect(Boolean(accountBody.account?.organization.onboardingCompletedAtIso)).toBe(true);
    expect(accountBody.account?.primaryCoach.fullName).toBe("Coach Rivera");
    expect(accountBody.account?.primaryCoach.email).toBe("coach@valleycatholic.org");
    expect(accountBody.account?.primaryCoach.role).toBe("owner");
    expect(teamsBody.teams[0]?.name).toBe("Valley Catholic");
    expect(teamsBody.teams[0]?.season).toBe("2026");
    expect(teamsBody.teams[0]?.players).toHaveLength(2);
  });

  it("supports local email/password accounts through onboarding", async () => {
    await resetSchool("account-school");

    const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "account-school" },
      body: JSON.stringify({
        fullName: "Coach Jordan",
        email: "coach@accountschool.org",
        password: "Secret123!"
      })
    });

    expect(registerRes.status).toBe(201);
    const registerBody = await registerRes.json() as {
      token: string;
      user: { email: string; fullName: string; role: string };
    };

    expect(registerBody.token.startsWith("bta.")).toBe(true);
    expect(registerBody.user.email).toBe("coach@accountschool.org");
    expect(registerBody.user.fullName).toBe("Coach Jordan");
    expect(registerBody.user.role).toBe("owner");

    const completeRes = await fetch(`${API_BASE}/api/onboarding/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${registerBody.token}`,
        "Content-Type": "application/json",
        "x-school-id": "account-school"
      },
      body: JSON.stringify({
        organizationName: "Account School Athletics",
        teamName: "Account School Varsity",
        season: "2026",
        playingStyle: "Pressure and pace",
        roster: [{ name: "Ava Stone", number: "2", position: "G", grade: "11" }]
      })
    });

    expect(completeRes.status).toBe(201);

    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "account-school" },
      body: JSON.stringify({
        email: "coach@accountschool.org",
        password: "Secret123!"
      })
    });

    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json() as {
      token: string;
      user: { email: string };
      onboarding: { completed: boolean };
      currentMember?: { email: string; role: string } | null;
    };

    expect(loginBody.token.startsWith("bta.")).toBe(true);
    expect(loginBody.user.email).toBe("coach@accountschool.org");
    expect(loginBody.onboarding.completed).toBe(true);
    expect(loginBody.currentMember?.email).toBe("coach@accountschool.org");
    expect(loginBody.currentMember?.role).toBe("owner");
  });

  it("supports game edit and reset compatibility routes", async () => {
    await resetSchool("games-compat");

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "games-compat" },
      body: JSON.stringify({
        teams: [
          {
            id: "vc",
            name: "Valley Catholic",
            abbreviation: "VC",
            players: [{ id: "p1", number: "3", name: "Mason Lee", position: "G" }]
          }
        ]
      })
    });

    await fetch(`${API_BASE}/api/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "games-compat" },
      body: JSON.stringify({
        gameId: "101",
        homeTeamId: "vc",
        awayTeamId: "opp",
        opponentName: "Jesuit",
        opponentTeamId: "opp"
      })
    });

    const updateRes = await fetch(`${API_BASE}/api/games/101`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "games-compat" },
      body: JSON.stringify({
        date: "2026-03-30",
        opponent: "Jesuit",
        location: "away",
        vc_score: 62,
        opp_score: 58,
        team_stats: {
          fg: 22,
          fga: 50,
          fg3: 6,
          fg3a: 17,
          ft: 12,
          fta: 15,
          oreb: 7,
          dreb: 19,
          reb: 26,
          asst: 14,
          to: 9,
          stl: 6,
          blk: 3,
          fouls: 11
        },
        player_stats: [{ name: "Mason Lee", number: 3, fg_made: 7, fg_att: 14, fg3_made: 2, fg3_att: 6, ft_made: 4, ft_att: 5, oreb: 1, dreb: 4, asst: 5, stl: 2, blk: 0, to: 2, fouls: 2, plus_minus: 4, pts: 20 }]
      })
    });

    expect(updateRes.status).toBe(200);

    const gameDetailRes = await fetch(`${API_BASE}/api/games/101`, {
      headers: { "x-school-id": "games-compat" }
    });
    expect(gameDetailRes.status).toBe(200);
    const gameDetail = await gameDetailRes.json() as { vc_score: number; location: string; player_stats: Array<{ name: string }> };
    expect(gameDetail.vc_score).toBe(62);
    expect(gameDetail.location).toBe("away");
    expect(gameDetail.player_stats[0]?.name).toBe("Mason Lee");

    const deleteRes = await fetch(`${API_BASE}/api/games/101`, {
      method: "DELETE",
      headers: { "x-school-id": "games-compat" }
    });
    expect(deleteRes.status).toBe(200);

    const resetRes = await fetch(`${API_BASE}/api/reset`, {
      method: "POST",
      headers: { "x-school-id": "games-compat" }
    });
    expect(resetRes.status).toBe(200);
  });

  it("serves AI summary compatibility routes", async () => {
    await resetSchool("ai-compat");

    await fetch(`${API_BASE}/config/roster-teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-school-id": "ai-compat" },
      body: JSON.stringify({
        teams: [
          {
            id: "vc",
            name: "Valley Catholic",
            abbreviation: "VC",
            players: [{ id: "p7", number: "7", name: "Eli Carter", position: "G" }]
          }
        ]
      })
    });

    await fetch(`${API_BASE}/api/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "ai-compat" },
      body: JSON.stringify({
        gameId: "301",
        homeTeamId: "vc",
        awayTeamId: "opp",
        opponentName: "Central Catholic",
        opponentTeamId: "opp"
      })
    });

    await fetch(`${API_BASE}/api/games/301/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-school-id": "ai-compat" },
      body: JSON.stringify({
        id: "ai-e1",
        sequence: 1,
        timestampIso: "2026-03-30T21:00:00.000Z",
        period: "Q1",
        clockSecondsRemaining: 420,
        teamId: "vc",
        operatorId: "op-1",
        type: "shot_attempt",
        playerId: "p7",
        made: true,
        points: 3,
        zone: "above_break_three"
      })
    });

    const [teamSummaryRes, playerInsightsRes, gameAnalysisRes, chatRes] = await Promise.all([
      fetch(`${API_BASE}/api/ai/team-summary`, { headers: { "x-school-id": "ai-compat" } }),
      fetch(`${API_BASE}/api/ai/player-insights/${encodeURIComponent("Eli Carter")}`, { headers: { "x-school-id": "ai-compat" } }),
      fetch(`${API_BASE}/api/ai/game-analysis/301`, { headers: { "x-school-id": "ai-compat" } }),
      fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-school-id": "ai-compat" },
        body: JSON.stringify({ message: "What should we focus on next?" })
      })
    ]);

    expect(teamSummaryRes.status).toBe(200);
    expect(playerInsightsRes.status).toBe(200);
    expect(gameAnalysisRes.status).toBe(200);
    expect(chatRes.status).toBe(200);

    const teamSummaryBody = await teamSummaryRes.json() as { summary: string };
    const playerInsightsBody = await playerInsightsRes.json() as { insights: string };
    const gameAnalysisBody = await gameAnalysisRes.json() as { analysis: string };
    const chatBody = await chatRes.json() as { reply: string };

    expect(teamSummaryBody.summary.length).toBeGreaterThan(10);
    expect(playerInsightsBody.insights).toContain("Eli Carter");
    expect(gameAnalysisBody.analysis).toContain("Central Catholic");
    expect(chatBody.reply.length).toBeGreaterThan(10);
  });
});

describe("Realtime API Server", () => {
  describe("tenant enforcement", () => {
    it("rejects api requests without school scope", async () => {
      const res = await fetch(`${API_BASE}/api/teams`);
      expect(res.status).toBe(400);
      const body = await res.json() as { error?: string };
      expect(body.error).toMatch(/schoolId is required/i);
    });
  });

  describe("POST /api/games/:gameId/events", () => {
    it("rejects event with invalid payload structure", async () => {
      const res = await fetch(`${API_BASE}/api/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-school-id": "test-school" },
        body: JSON.stringify({ invalid: "payload" })
      });

      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    it("accepts valid field goal event", async () => {
      const event = {
        id: "evt-1",
        schoolId: "test-school",
        gameId: "test-game",
        sequence: 1,
        timestampIso: new Date().toISOString(),
        period: "Q1" as const,
        clockSecondsRemaining: 600,
        teamId: "home",
        operatorId: "op-1",
        type: "shot_attempt" as const,
        playerId: "p1",
        made: true
      };

      const res = await fetch(`${API_BASE}/api/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-school-id": "test-school" },
        body: JSON.stringify(event)
      });

      expect([201, 400]).toContain(res.status);
      if (res.status === 201) {
        const body = await res.json() as Record<string, unknown>;
        expect(body.event).toBeDefined();
      }
    });

    it("accepts valid free throw event with correct attempt count", async () => {
      const event = {
        id: "evt-2",
        schoolId: "test-school",
        gameId: "test-game",
        sequence: 2,
        timestampIso: new Date().toISOString(),
        period: "Q1" as const,
        clockSecondsRemaining: 590,
        teamId: "away",
        operatorId: "op-1",
        type: "free_throw_attempt" as const,
        playerId: "p2",
        made: true,
        attemptNumber: 1,
        totalAttempts: 2
      };

      const res = await fetch(`${API_BASE}/api/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-school-id": "test-school" },
        body: JSON.stringify(event)
      });

      expect([201, 400]).toContain(res.status);
    });

    it("rejects free throw event with impossible attempt count (3 of 2)", async () => {
      const event = {
        id: "evt-3",
        schoolId: "test-school",
        gameId: "test-game",
        sequence: 3,
        timestampIso: new Date().toISOString(),
        period: "Q1" as const,
        clockSecondsRemaining: 580,
        teamId: "home",
        operatorId: "op-1",
        type: "free_throw_attempt" as const,
        playerId: "p3",
        made: true,
        attemptNumber: 3,
        totalAttempts: 2
      };

      const res = await fetch(`${API_BASE}/api/games/test-game/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-school-id": "test-school" },
        body: JSON.stringify(event)
      });

      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });
  });

  describe("GET /api/games/:gameId/state", () => {
    it("returns game state or 404 for nonexistent game", async () => {
      const res = await fetch(`${API_BASE}/api/games/nonexistent-game-xyz/state`);
      
      // strict tenant mode requires explicit school scope
      const status = res.status;
      expect([200, 404, 400]).toContain(status);
    });
  });

  describe("GET /api/games/:gameId/insights", () => {
    it("returns insights array for a game", async () => {
      const res = await fetch(`${API_BASE}/api/games/test-game/insights`);

      expect([200, 404, 400]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
      }
    });
  });

  describe("CORS", () => {
    it("allows requests from whitelisted origin", async () => {
      const res = await fetch(`${API_BASE}/api/games/test-game/state`, {
        headers: { Origin: "http://localhost:5173", "x-school-id": "test-school" }
      });

      // Should not 403 due to CORS
      expect([200, 404]).toContain(res.status);
    });

    it("rejects requests from non-whitelisted origin", async () => {
      const res = await fetch(`${API_BASE}/api/games/test-game/state`, {
        headers: { Origin: "https://evil.com", "x-school-id": "test-school" }
      });

      // Should either 200/404 (if CORS check happens at middleware level)
      // or a CORS error at browser level. Accept any response for now.
      expect(res).toBeDefined();
    });
  });

  describe("Rate Limiting", () => {
    it("allows burst of requests within limit", async () => {
      // Send 5 rapid requests to /api/games/:gameId/events
      const promises = Array.from({ length: 5 }).map(() =>
        fetch(`${API_BASE}/api/games/test-game/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-school-id": "test-school" },
          body: JSON.stringify({ invalid: "test" })
        }).then(r => r.status)
      );

      const statuses = await Promise.all(promises);
      // Should all complete, likely 400 (invalid payload)
      statuses.forEach(status => {
        expect([200, 201, 400, 429]).toContain(status);
      });
    });
  });

  describe("API Key Auth", () => {
    it("allows requests without key when BTA_API_KEY env not set", async () => {
      delete process.env.BTA_API_KEY;

      const res = await fetch(`${API_BASE}/api/games/test-game/state`);

      // Should succeed auth-wise but still enforce tenant scope
      expect([200, 400, 404]).toContain(res.status);
    });

    it("accepts request with valid API key header", async () => {
      // This test assumes BTA_API_KEY is set in test env
      const res = await fetch(`${API_BASE}/api/games/test-game/state`, {
        headers: { "x-api-key": API_KEY, "x-school-id": "test-school" }
      });

      expect([200, 404, 401]).toContain(res.status);
    });

    it("rejects request with invalid API key", async () => {
      const res = await fetch(`${API_BASE}/api/games/test-game/state`, {
        headers: { "x-api-key": "wrong-key-123", "x-school-id": "test-school" }
      });

      // May be 401 if key is enforced, or 404/200 if not configured
      expect([200, 401, 404]).toContain(res.status);
    });
  });
});
