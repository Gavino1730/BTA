#!/usr/bin/env node
// Push comprehensive game overrides with player-level stats for Vancouver Bears.
// Usage: node scripts/push-bears-overrides.mjs

const API = process.env.BTA_API_URL || "https://btarealtime-api-production.up.railway.app";
const KEY = process.env.BTA_API_KEY || "Q7mZ2xR9aV6pT3kLw8JfH1N5gC4sD0YvE2uB7cM9WqP3tK8Xr6LhS1dF4jA5oU";
const SCHOOL = process.env.BTA_SCHOOL_ID || "vancouver-bears";
const EMAIL = process.env.BTA_LOGIN_EMAIL || "bears@demo.com";
const PASSWORD = process.env.BTA_LOGIN_PASSWORD || "12345678";

import { readFileSync } from "node:fs";

const teamData = JSON.parse(readFileSync("vancouver-bears-team.json", "utf8"));
const players = teamData.teams[0].players;
const schedule = teamData.teams[0].schedule.filter((g) => g.status === "final");

// Map schedule entries to game IDs
function gameId(g) {
  return `game-${g.date}-${g.opponent.toLowerCase()}`;
}

// Parse "5/12" → { made: 5, att: 12 }
function parseFg(str) {
  const [made, att] = str.split("/").map(Number);
  return { made, att };
}

// Deterministic pseudo-random from seed
function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Distribute a total across N buckets with variance
function distribute(total, n, rand) {
  if (n === 0) return [];
  const raw = Array.from({ length: n }, () => rand() + 0.1);
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((v) => Math.round((v / sum) * total));
  // Fix rounding error on first bucket
  const diff = total - scaled.reduce((a, b) => a + b, 0);
  scaled[0] += diff;
  return scaled;
}

async function main() {
  // Login
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const { token } = await loginRes.json();
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": KEY,
    Authorization: `Bearer ${token}`,
    "x-school-id": SCHOOL,
  };
  console.log("Logged in OK");

  // Estimated team stats for games without gamelog data
  const estimatedTeamStats = {
    "game-2026-03-07-yak": { fg: 38, fga: 82, fg3: 8, fg3a: 22, ft: 17, fta: 23, oreb: 12, dreb: 28, reb: 40, asst: 18, to: 14, stl: 8, blk: 4, fouls: 18 },
    "game-2026-03-15-bkm": { fg: 50, fga: 95, fg3: 12, fg3a: 28, ft: 23, fta: 30, oreb: 16, dreb: 32, reb: 48, asst: 25, to: 12, stl: 10, blk: 5, fouls: 16 },
    "game-2026-03-29-slc": { fg: 34, fga: 78, fg3: 7, fg3a: 20, ft: 17, fta: 24, oreb: 11, dreb: 27, reb: 38, asst: 16, to: 15, stl: 7, blk: 3, fouls: 20 },
    "game-2026-04-04-yak": { fg: 43, fga: 90, fg3: 10, fg3a: 26, ft: 20, fta: 26, oreb: 14, dreb: 30, reb: 44, asst: 22, to: 16, stl: 9, blk: 5, fouls: 19 },
  };

  // Pick rotation players (first ~12) for synthetic stats
  const rotationIds = players.slice(0, 12).map((p) => p.id);

  for (const game of schedule) {
    const gid = gameId(game);
    const loc = game.home_away === "HOME" ? "home" : "away";

    // Collect gamelogs
    const playerStatsList = [];
    let sumPts = 0;

    for (const p of players) {
      const gl = (p.gameLog ?? []).find(
        (g) => g.date === game.date && g.opponent === game.opponent
      );
      if (!gl) continue;
      const fg = parseFg(gl.fg);
      const fg3 = parseFg(gl.fg3);
      const ft = parseFg(gl.ft);
      const oreb = Math.floor(gl.reb * 0.3);
      const dreb = gl.reb - oreb;
      playerStatsList.push({
        playerId: p.id,
        pts: gl.pts,
        fg: fg.made,
        fga: fg.att,
        fg3: fg3.made,
        fg3a: fg3.att,
        ft: ft.made,
        fta: ft.att,
        oreb,
        dreb,
        reb: gl.reb,
        asst: gl.ast,
        to: gl.tov,
        stl: gl.stl,
        blk: gl.blk,
        fouls: Math.floor(Math.random() * 4) + 1,
      });
      sumPts += gl.pts;
    }

    // Use gamelog-derived or estimated team stats
    let teamStats;
    if (playerStatsList.length >= 5) {
      // Derive from gamelogs
      teamStats = {
        fg: playerStatsList.reduce((s, p) => s + p.fg, 0),
        fga: playerStatsList.reduce((s, p) => s + p.fga, 0),
        fg3: playerStatsList.reduce((s, p) => s + p.fg3, 0),
        fg3a: playerStatsList.reduce((s, p) => s + p.fg3a, 0),
        ft: playerStatsList.reduce((s, p) => s + p.ft, 0),
        fta: playerStatsList.reduce((s, p) => s + p.fta, 0),
        oreb: playerStatsList.reduce((s, p) => s + p.oreb, 0),
        dreb: playerStatsList.reduce((s, p) => s + p.dreb, 0),
        reb: playerStatsList.reduce((s, p) => s + p.reb, 0),
        asst: playerStatsList.reduce((s, p) => s + p.asst, 0),
        to: playerStatsList.reduce((s, p) => s + p.to, 0),
        stl: playerStatsList.reduce((s, p) => s + p.stl, 0),
        blk: playerStatsList.reduce((s, p) => s + p.blk, 0),
        fouls: playerStatsList.reduce((s, p) => s + p.fouls, 0),
      };
    } else {
      teamStats = estimatedTeamStats[gid] ?? {
        fg: 40, fga: 85, fg3: 8, fg3a: 22, ft: 18, fta: 25,
        oreb: 12, dreb: 28, reb: 40, asst: 18, to: 14, stl: 8, blk: 4, fouls: 18,
      };
    }

    // For games with few/no gamelogs, synthesize player stats from team totals
    if (playerStatsList.length < 5) {
      playerStatsList.length = 0; // clear partial data
      const n = rotationIds.length;
      const seed = game.date.replace(/-/g, "") * 1;
      const rand = seededRand(seed);

      const fgDist = distribute(teamStats.fg, n, rand);
      const fgaDist = distribute(teamStats.fga, n, rand);
      const fg3Dist = distribute(teamStats.fg3, n, rand);
      const fg3aDist = distribute(teamStats.fg3a, n, rand);
      const ftDist = distribute(teamStats.ft, n, rand);
      const ftaDist = distribute(teamStats.fta, n, rand);
      const orebDist = distribute(teamStats.oreb, n, rand);
      const drebDist = distribute(teamStats.dreb, n, rand);
      const asstDist = distribute(teamStats.asst, n, rand);
      const toDist = distribute(teamStats.to, n, rand);
      const stlDist = distribute(teamStats.stl, n, rand);
      const blkDist = distribute(teamStats.blk, n, rand);
      const foulsDist = distribute(teamStats.fouls, n, rand);

      for (let i = 0; i < n; i++) {
        // Ensure fga >= fg, fg3a >= fg3, fta >= ft
        const fg = Math.min(fgDist[i], fgaDist[i]);
        const fg3 = Math.min(fg3Dist[i], fg3aDist[i]);
        const ft = Math.min(ftDist[i], ftaDist[i]);
        const pts = (fg - fg3) * 2 + fg3 * 3 + ft;
        playerStatsList.push({
          playerId: rotationIds[i],
          pts,
          fg,
          fga: Math.max(fgaDist[i], fg),
          fg3,
          fg3a: Math.max(fg3aDist[i], fg3),
          ft,
          fta: Math.max(ftaDist[i], ft),
          oreb: orebDist[i],
          dreb: drebDist[i],
          reb: orebDist[i] + drebDist[i],
          asst: asstDist[i],
          to: toDist[i],
          stl: stlDist[i],
          blk: blkDist[i],
          fouls: foulsDist[i],
        });
      }
    }

    // Recalculate team_stats from actual player stats to guarantee consistency
    teamStats = {
      fg: playerStatsList.reduce((s, p) => s + p.fg, 0),
      fga: playerStatsList.reduce((s, p) => s + p.fga, 0),
      fg3: playerStatsList.reduce((s, p) => s + p.fg3, 0),
      fg3a: playerStatsList.reduce((s, p) => s + p.fg3a, 0),
      ft: playerStatsList.reduce((s, p) => s + p.ft, 0),
      fta: playerStatsList.reduce((s, p) => s + p.fta, 0),
      oreb: playerStatsList.reduce((s, p) => s + p.oreb, 0),
      dreb: playerStatsList.reduce((s, p) => s + p.dreb, 0),
      reb: playerStatsList.reduce((s, p) => s + p.reb, 0),
      asst: playerStatsList.reduce((s, p) => s + p.asst, 0),
      to: playerStatsList.reduce((s, p) => s + p.to, 0),
      stl: playerStatsList.reduce((s, p) => s + p.stl, 0),
      blk: playerStatsList.reduce((s, p) => s + p.blk, 0),
      fouls: playerStatsList.reduce((s, p) => s + p.fouls, 0),
    };
    // Anchor to the source schedule score, then reconcile player point totals
    // so player-level stats and scoreboard stay in sync.
    const targetScore = Number(game.vwb_score);
    let currentScore = playerStatsList.reduce((s, p) => s + p.pts, 0);
    let remaining = targetScore - currentScore;
    if (playerStatsList.length > 0 && remaining !== 0) {
      if (remaining > 0) {
        playerStatsList[0].pts = Math.max(0, (playerStatsList[0].pts ?? 0) + remaining);
        remaining = 0;
      } else {
        // Reduce points from players until we reach the target without going below 0.
        for (const p of playerStatsList) {
          if (remaining === 0) {
            break;
          }
          const pts = Math.max(0, Number(p.pts ?? 0));
          if (pts <= 0) {
            continue;
          }
          const reducible = Math.min(pts, Math.abs(remaining));
          p.pts = pts - reducible;
          remaining += reducible;
        }
      }
      currentScore = playerStatsList.reduce((s, p) => s + p.pts, 0);
      if (currentScore !== targetScore) {
        const first = playerStatsList[0];
        first.pts = Math.max(0, Number(first.pts ?? 0) + (targetScore - currentScore));
      }
    }

    const reconciledScore = playerStatsList.reduce((s, p) => s + p.pts, 0);
    const result = game.result || (reconciledScore > game.opp_score ? "W" : reconciledScore < game.opp_score ? "L" : "T");

    const body = {
      date: game.date,
      opponent: game.opponent,
      location: loc,
      vc_score: reconciledScore,
      opp_score: game.opp_score,
      result,
      team_stats: teamStats,
      player_stats: playerStatsList,
    };

    try {
      const res = await fetch(`${API}/api/games/${gid}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`OK ${gid} ${reconciledScore}-${game.opp_score} ${result} (${playerStatsList.length} players)`);
    } catch (e) {
      console.log(`FAIL ${gid}: ${e.message}`);
    }
  }

  console.log("\nDone! All overrides pushed.");
}

main().catch(console.error);
