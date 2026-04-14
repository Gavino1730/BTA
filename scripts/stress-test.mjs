#!/usr/bin/env node

const DEFAULTS = {
  apiUrl: process.env.BTA_API_URL || "http://localhost:4000",
  schoolId: process.env.BTA_SCHOOL_ID || `stress-${Date.now().toString(36)}`,
  apiKey: process.env.BTA_API_KEY || "",
  games: Number(process.env.BTA_STRESS_GAMES || 20),
  eventsPerGame: Number(process.env.BTA_STRESS_EVENTS || 120),
  concurrency: Number(process.env.BTA_STRESS_CONCURRENCY || 4),
  resetFirst: process.env.BTA_STRESS_RESET === "1",
};

function parseArgs(argv) {
  const result = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    if (key === "reset-first") {
      result.resetFirst = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      continue;
    }

    i += 1;

    switch (key) {
      case "api-url":
        result.apiUrl = value;
        break;
      case "school-id":
        result.schoolId = value;
        break;
      case "api-key":
        result.apiKey = value;
        break;
      case "games":
        result.games = Number(value);
        break;
      case "events":
        result.eventsPerGame = Number(value);
        break;
      case "concurrency":
        result.concurrency = Number(value);
        break;
      default:
        break;
    }
  }

  return result;
}

function headersFor(config) {
  const headers = {
    "content-type": "application/json",
    "x-school-id": config.schoolId,
  };
  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  }
  return headers;
}

async function requestJson(config, method, path, body) {
  const start = performance.now();
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: headersFor(config),
    body: body ? JSON.stringify(body) : undefined,
  });

  const durationMs = performance.now() - start;
  const contentType = res.headers.get("content-type") || "";
  let json = null;
  let text = "";

  if (contentType.includes("application/json")) {
    json = await res.json().catch(() => null);
  } else {
    text = await res.text().catch(() => "");
  }

  return {
    ok: res.ok,
    status: res.status,
    durationMs,
    json,
    text,
  };
}

function makeGameId(index) {
  return `stress-game-${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildEvent(config, gameId, sequence) {
  const teamId = sequence % 2 === 0 ? "home" : "away";
  const base = {
    id: `${gameId}-e-${sequence}`,
    schoolId: config.schoolId,
    gameId,
    sequence,
    timestampIso: new Date().toISOString(),
    period: "Q1",
    clockSecondsRemaining: Math.max(0, 480 - sequence * 2),
    teamId,
    operatorId: "stress-runner",
  };

  const eventType = sequence % 5;

  if (eventType === 0) {
    return {
      ...base,
      type: "shot_attempt",
      playerId: `p-${(sequence % 10) + 1}`,
      made: true,
      points: sequence % 3 === 0 ? 3 : 2,
      zone: sequence % 3 === 0 ? "above_break_three" : "paint",
    };
  }

  if (eventType === 1) {
    return {
      ...base,
      type: "shot_attempt",
      playerId: `p-${(sequence % 10) + 1}`,
      made: false,
      points: 2,
      zone: "midrange",
    };
  }

  if (eventType === 2) {
    return {
      ...base,
      type: "turnover",
      playerId: `p-${(sequence % 10) + 1}`,
      turnoverType: "bad_pass",
    };
  }

  if (eventType === 3) {
    return {
      ...base,
      type: "foul",
      playerId: `p-${(sequence % 10) + 1}`,
      foulType: "personal",
    };
  }

  return {
    ...base,
    type: "rebound",
    playerId: `p-${(sequence % 10) + 1}`,
    offensive: sequence % 2 === 0,
  };
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runSingleGame(config, index, timings) {
  const gameConfig = {
    ...config,
    schoolId: `${config.schoolId}-g${index}`,
  };
  let gameId = makeGameId(index);
  let created = await requestJson(gameConfig, "POST", "/api/games", {
    gameId,
    homeTeamId: "home",
    awayTeamId: "away",
  });
  timings.push(created.durationMs);

  // Rare parallel collisions can happen in shared dev environments; retry with a new id.
  if (!created.ok && created.status === 409) {
    gameId = makeGameId(index + config.games);
    created = await requestJson(gameConfig, "POST", "/api/games", {
      gameId,
      homeTeamId: "home",
      awayTeamId: "away",
    });
    timings.push(created.durationMs);
  }

  if (!created.ok) {
    return {
      gameId,
      ok: false,
      error: `create game failed (${created.status})`,
      posted: 0,
      expectedPoints: 0,
    };
  }

  let posted = 0;
  let expectedPoints = 0;

  for (let seq = 1; seq <= config.eventsPerGame; seq += 1) {
    const event = buildEvent(gameConfig, gameId, seq);
    if (event.type === "shot_attempt" && event.made) {
      expectedPoints += event.points;
    }

    const result = await requestJson(gameConfig, "POST", `/api/games/${gameId}/events`, event);
    timings.push(result.durationMs);

    if (!result.ok) {
      return {
        gameId,
        ok: false,
        error: `event sequence ${seq} failed (${result.status})`,
        posted,
        expectedPoints,
      };
    }

    posted += 1;
  }

  const stateResult = await requestJson(gameConfig, "GET", `/api/games/${gameId}/state`);
  timings.push(stateResult.durationMs);

  if (!stateResult.ok || !stateResult.json) {
    return {
      gameId,
      ok: false,
      error: `state fetch failed (${stateResult.status})`,
      posted,
      expectedPoints,
    };
  }

  const scoreByTeam = stateResult.json.scoreByTeam || {};
  const actualTotal = Number(scoreByTeam.home || 0) + Number(scoreByTeam.away || 0);

  if (actualTotal < expectedPoints) {
    return {
      gameId,
      ok: false,
      error: `score mismatch (expected at least ${expectedPoints}, got ${actualTotal})`,
      posted,
      expectedPoints,
    };
  }

  return {
    gameId,
    ok: true,
    posted,
    expectedPoints,
  };
}

async function runWithConcurrency(config) {
  const timings = [];
  const results = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= config.games) {
        return;
      }
      const result = await runSingleGame(config, current + 1, timings);
      results.push(result);
      const prefix = result.ok ? "OK" : "FAIL";
      console.log(`[${prefix}] ${result.gameId} events=${result.posted}/${config.eventsPerGame}${result.ok ? "" : ` reason=${result.error}`}`);
    }
  }

  const workers = [];
  const workerCount = Math.max(1, Math.min(config.concurrency, config.games));
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return { results, timings };
}

async function maybeReset(config) {
  if (!config.resetFirst) {
    return;
  }

  const result = await requestJson(config, "DELETE", "/admin/reset");
  if (!result.ok) {
    console.warn(`Reset skipped: HTTP ${result.status}`);
  }
}

async function main() {
  const config = parseArgs(process.argv);

  console.log("BTA API Stress Test");
  console.log(`API: ${config.apiUrl}`);
  console.log(`School: ${config.schoolId}`);
  console.log(`Games: ${config.games}`);
  console.log(`Events/Game: ${config.eventsPerGame}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log("");

  const health = await requestJson(config, "GET", "/health");
  if (!health.ok) {
    console.error(`Health check failed: HTTP ${health.status}`);
    process.exit(1);
  }

  await maybeReset(config);

  const started = performance.now();
  const { results, timings } = await runWithConcurrency(config);
  const elapsedMs = performance.now() - started;

  const failures = results.filter((result) => !result.ok);
  const success = results.length - failures.length;
  const totalEventsPosted = results.reduce((sum, result) => sum + result.posted, 0);
  const throughput = elapsedMs > 0 ? (totalEventsPosted / elapsedMs) * 1000 : 0;

  console.log("");
  console.log("Summary");
  console.log(`Passed games: ${success}/${results.length}`);
  console.log(`Posted events: ${totalEventsPosted}`);
  console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${throughput.toFixed(1)} events/sec`);
  console.log(`Latency p50: ${percentile(timings, 50).toFixed(1)}ms`);
  console.log(`Latency p95: ${percentile(timings, 95).toFixed(1)}ms`);

  if (failures.length > 0) {
    console.log("Failures");
    for (const failure of failures.slice(0, 10)) {
      console.log(`- ${failure.gameId}: ${failure.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
