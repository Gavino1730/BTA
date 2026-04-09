const fs = require("fs");

(async () => {
  const teamData = JSON.parse(fs.readFileSync("vancouver-bears-team.json", "utf8"));
  const finals = teamData.teams[0].schedule.filter((g) => g.status === "final");
  const expected = new Map(finals.map((g) => ["game-" + g.date + "-" + String(g.opponent).toLowerCase(), {
    vc: Number(g.vwb_score),
    opp: Number(g.opp_score),
    result: g.result
  }]));

  const login = await fetch("https://btarealtime-api-production.up.railway.app/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-school-id": "vancouver-bears" },
    body: JSON.stringify({ email: "gavino1730@gmail.com", password: "Boyaca1730!" })
  });
  const loginJson = await login.json();
  const token = loginJson.token;

  const gamesRes = await fetch("https://btarealtime-api-production.up.railway.app/api/games", {
    headers: {
      "x-api-key": "Q7mZ2xR9aV6pT3kLw8JfH1N5gC4sD0YvE2uB7cM9WqP3tK8Xr6LhS1dF4jA5oU",
      "x-school-id": "vancouver-bears",
      "Authorization": "Bearer " + token
    }
  });
  const games = await gamesRes.json();

  const rows = [];
  for (const g of games) {
    const gid = g.game_id || g.gameId || "";
    const exp = expected.get(gid);
    const ps = Array.isArray(g.player_stats) ? g.player_stats : [];
    const sumPts = ps.reduce((s, p) => s + Number(p.pts || 0), 0);
    rows.push({
      gid,
      apiVc: Number(g.vc_score ?? g.vcScore ?? 0),
      apiOpp: Number(g.opp_score ?? g.oppScore ?? 0),
      apiResult: String(g.result || ""),
      sumPlayerPts: sumPts,
      players: ps.length,
      expVc: exp?.vc ?? null,
      expOpp: exp?.opp ?? null,
      expResult: exp?.result ?? null,
      scoreMatch: exp ? Number(g.vc_score) === exp.vc && Number(g.opp_score) === exp.opp : false,
      playerMatch: Number(g.vc_score) === sumPts,
    });
  }

  rows.sort((a, b) => a.gid.localeCompare(b.gid));
  console.log(JSON.stringify({
    count: rows.length,
    mismatchedScores: rows.filter((r) => !r.scoreMatch).length,
    mismatchedPlayerTotals: rows.filter((r) => !r.playerMatch).length,
    rows,
  }, null, 2));
})();
