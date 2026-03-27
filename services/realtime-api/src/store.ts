import {
  applyEvent,
  createInitialGameState,
  replayEvents,
  type GameState
} from "@bta/game-state";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";
import {
  generateInsights,
  type LiveInsight
} from "@bta/insight-engine";
import { parseGameEvent, isOvertimePeriod, type GameEvent } from "@bta/shared-schema";

export interface CreateGameInput {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiContext?: Partial<GameAiContext>;
}

export interface RosterPlayer {
  id: string;
  number: string;
  name: string;
  position: string;
  height?: string;
  grade?: string;
  role?: string;
  notes?: string;
}

export interface RosterTeam {
  id: string;
  name: string;
  abbreviation: string;
  teamColor?: string;
  coachStyle?: string;
  players: RosterPlayer[];
}

export interface CoachAiSettings {
  playingStyle: string;
  teamContext: string;
  customPrompt: string;
  focusInsights: Array<
    "timeouts"
    | "substitutions"
    | "foul_management"
    | "momentum"
    | "shot_selection"
    | "ball_security"
    | "hot_hand"
    | "defense"
  >;
}

export interface AiPromptPreview {
  model: string;
  userPrompt: string;
  systemGuide: string[];
  coachSettings: CoachAiSettings;
  recentEventCount: number;
  generatedAtIso: string;
}

export interface CoachAiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachAiChatResponse {
  answer: string;
  suggestions: string[];
  generatedAtIso: string;
  usedHistoricalContext: boolean;
}

export interface GameAiContext {
  clockEnabled: boolean;
  opponentStatsLimited: boolean;
  opponentTrackedStats: string[];
}

interface GameSession {
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiSettings: CoachAiSettings;
  aiContext: GameAiContext;
  historicalContextSummary: string;
  historicalContextFetchedAtMs: number;
  state: GameState;
  eventsById: Map<string, GameEvent>;
  eventIdsBySequence: Map<number, string>;
  ruleInsights: LiveInsight[];
  aiInsights: LiveInsight[];
  aiRefreshInFlight: Promise<LiveInsight[] | null> | null;
  lastAiRefreshAtMs: number;
  lastAiEventCount: number;
  lastAiFingerprint: string;
}

interface PersistedGameSession {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  opponentName?: string;
  opponentTeamId?: string;
  startingLineupByTeam?: Record<string, string[]>;
  aiSettings?: CoachAiSettings;
  aiContext?: GameAiContext;
  historicalContextSummary?: string;
  historicalContextFetchedAtMs?: number;
  events: GameEvent[];
}

interface PersistedSnapshot {
  sessions: PersistedGameSession[];
  rosterTeams: RosterTeam[];
}

const sessions = new Map<string, GameSession>();
let rosterTeams: RosterTeam[] = [];
const persistenceEnabled = !process.env.VITEST && process.env.NODE_ENV !== "test";
const dataDirectory = resolve(process.cwd(), ".platform-data");
const dataFile = resolve(dataDirectory, "realtime-api.json");
const OPENAI_API_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";
const LIVE_AI_MODEL = process.env.BTA_LIVE_INSIGHT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const LIVE_AI_TIMEOUT_MS = readEnvNumber("BTA_LIVE_INSIGHT_TIMEOUT_MS", 12000);
const LIVE_AI_MIN_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_EVENTS", 4);
const LIVE_AI_REFRESH_EVERY_EVENTS = readEnvNumber("BTA_LIVE_INSIGHT_REFRESH_EVERY_EVENTS", 3);
const LIVE_AI_MIN_INTERVAL_MS = readEnvNumber("BTA_LIVE_INSIGHT_MIN_INTERVAL_MS", 20000);
const LIVE_AI_RECENT_EVENT_WINDOW = readEnvNumber("BTA_LIVE_INSIGHT_RECENT_EVENT_WINDOW", 8);
const STATS_DASHBOARD_BASE = (process.env.STATS_DASHBOARD_BASE ?? "http://localhost:5000").replace(/\/+$/, "");
const HISTORICAL_CONTEXT_TTL_MS = readEnvNumber("BTA_HISTORICAL_CONTEXT_TTL_MS", 60000);
const FOCUS_INSIGHT_OPTIONS = new Set<CoachAiSettings["focusInsights"][number]>([
  "timeouts",
  "substitutions",
  "foul_management",
  "momentum",
  "shot_selection",
  "ball_security",
  "hot_hand",
  "defense"
]);

function defaultCoachAiSettings(): CoachAiSettings {
  return {
    playingStyle: "",
    teamContext: "",
    customPrompt: "",
    focusInsights: [
      "timeouts",
      "substitutions",
      "foul_management",
      "momentum",
      "shot_selection",
      "ball_security",
      "hot_hand",
      "defense"
    ]
  };
}

function defaultGameAiContext(): GameAiContext {
  return {
    clockEnabled: true,
    opponentStatsLimited: true,
    opponentTrackedStats: ["points", "foul"]
  };
}

function sanitizeGameAiContext(input: Partial<GameAiContext> | null | undefined): GameAiContext {
  const defaults = defaultGameAiContext();
  const clockEnabled = typeof input?.clockEnabled === "boolean"
    ? input.clockEnabled
    : defaults.clockEnabled;
  const opponentStatsLimited = typeof input?.opponentStatsLimited === "boolean"
    ? input.opponentStatsLimited
    : defaults.opponentStatsLimited;
  const opponentTrackedStats = Array.isArray(input?.opponentTrackedStats)
    ? [...new Set(input.opponentTrackedStats
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 24))]
    : defaults.opponentTrackedStats;

  return {
    clockEnabled,
    opponentStatsLimited,
    opponentTrackedStats: opponentTrackedStats.length > 0 ? opponentTrackedStats : defaults.opponentTrackedStats
  };
}

function sanitizeCoachAiSettings(input: Partial<CoachAiSettings> | null | undefined): CoachAiSettings {
  const defaults = defaultCoachAiSettings();
  const sanitize = (text: string, max: number) => text
    .replace(/^\ufeff/g, "") // BOM
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // Control chars
    .trim()
    .slice(0, max);
  
  const playingStyle = typeof input?.playingStyle === "string" ? sanitize(input.playingStyle, 500) : defaults.playingStyle;
  const teamContext = typeof input?.teamContext === "string" ? sanitize(input.teamContext, 1200) : defaults.teamContext;
  const customPrompt = typeof input?.customPrompt === "string" ? sanitize(input.customPrompt, 1200) : defaults.customPrompt;
  const focusInsights = Array.isArray(input?.focusInsights)
    ? [...new Set(input.focusInsights.filter((item): item is CoachAiSettings["focusInsights"][number] => FOCUS_INSIGHT_OPTIONS.has(item as CoachAiSettings["focusInsights"][number])))]
    : defaults.focusInsights;

  return {
    playingStyle,
    teamContext,
    customPrompt,
    focusInsights: focusInsights.length > 0 ? focusInsights : defaults.focusInsights
  };
}

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
}

function buildStatsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.BTA_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

function combineInsights(session: GameSession): LiveInsight[] {
  return [...session.aiInsights, ...session.ruleInsights]
    .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
    .slice(0, 20);
}

function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case "shot_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} ${event.points}pt shot (${event.zone})`;
    case "free_throw_attempt":
      return `${event.teamId} ${event.made ? "made" : "missed"} free throw ${event.attemptNumber}/${event.totalAttempts}`;
    case "rebound":
      return `${event.teamId} ${event.offensive ? "offensive" : "defensive"} rebound by ${event.playerId}`;
    case "turnover":
      return `${event.teamId} turnover${event.playerId ? ` by ${event.playerId}` : ""} (${event.turnoverType})`;
    case "foul":
      return `${event.teamId} foul on ${event.playerId} (${event.foulType})`;
    case "assist":
      return `${event.teamId} assist by ${event.playerId}`;
    case "steal":
      return `${event.teamId} steal by ${event.playerId}`;
    case "block":
      return `${event.teamId} block by ${event.playerId}`;
    case "substitution":
      return `${event.teamId} substitution ${event.playerOutId} -> ${event.playerInId}`;
    case "possession_start":
      return `possession starts for ${event.possessedByTeamId}`;
    case "possession_end":
      return `possession ends for ${event.possessedByTeamId} (${event.result})`;
    case "timeout":
      return `${event.teamId} timeout (${event.timeoutType})`;
    case "period_transition":
      return `period starts: ${event.newPeriod}`;
  }

  return "unknown event";
}

function isPreGameState(state: GameState, orderedEvents: GameEvent[]): boolean {
  const totalScore = Object.values(state.scoreByTeam).reduce((sum, s) => sum + s, 0);
  return state.currentPeriod === "Q1" && totalScore === 0 && orderedEvents.length < 5;
}

function formatFgPct(made: number, att: number): string {
  if (att === 0) return "0%";
  return `${Math.round(made / att * 100)}%`;
}

function summarizeTeamState(
  state: GameState,
  teamId: string,
  isOurTeam: boolean,
  opponentStatsLimited: boolean
): string {
  const teamStats = state.teamStats[teamId];
  const players = Object.values(state.playerStatsByTeam[teamId] ?? {});
  const teamLabel = isOurTeam
    ? (teamId === state.homeTeamId ? "Our team (home)" : "Our team (away)")
    : (state.opponentName?.trim() || (teamId === state.homeTeamId ? "Opponent (home)" : "Opponent (away)"));

  const sortedPlayers = [...players].sort((left, right) => right.points - left.points);
  const topScorer = sortedPlayers[0];
  const foulTroubledPlayers = players
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 3)
    .map((p) => `${p.playerId}(${state.playerFouls[p.playerId]}f)`)
    .join(", ");

  const fgPct = formatFgPct(teamStats?.shooting.fgMade ?? 0, teamStats?.shooting.fgAttempts ?? 0);
  const activeLineup = (state.activeLineupsByTeam[teamId] ?? []).join(", ");

  const lines = [
    `${teamLabel}: ${state.scoreByTeam[teamId] ?? 0} pts`,
    `FG ${teamStats?.shooting.fgMade ?? 0}/${teamStats?.shooting.fgAttempts ?? 0} (${fgPct})`,
    `FT ${teamStats?.shooting.ftMade ?? 0}/${teamStats?.shooting.ftAttempts ?? 0}`,
    `Reb off/def: ${teamStats?.reboundsOff ?? 0}/${teamStats?.reboundsDef ?? 0}`,
    `TO ${teamStats?.turnovers ?? 0}`,
    `Fouls ${teamStats?.fouls ?? 0}`,
    `Bonus ${state.bonusByTeam[teamId] ? "YES" : "no"}`,
    topScorer ? `Top scorer: ${topScorer.playerId} (${topScorer.points}pts, ${topScorer.fgMade}/${topScorer.fgAttempts}FG)` : "Top scorer: none",
    foulTroubledPlayers ? `Foul trouble: ${foulTroubledPlayers}` : "",
    activeLineup ? `Active lineup: ${activeLineup}` : ""
  ].filter(Boolean).join(", ");

  // If opponent — note partial tracking
  if (!isOurTeam && opponentStatsLimited) {
    return `${lines} [NOTE: opponent tracking may be score+fouls only]`;
  }
  return lines;
}

function buildRosterMetadataLines(state: GameState, teamId: string): string[] {
  const rosterTeam = rosterTeams.find((team) => team.id === teamId);
  if (!rosterTeam) {
    return [];
  }

  const liveLineup = new Set(state.activeLineupsByTeam[teamId] ?? []);
  const statPlayers = Object.values(state.playerStatsByTeam[teamId] ?? {});
  const relevantPlayers = new Set<string>([
    ...liveLineup,
    ...statPlayers
      .filter((player) => player.points > 0 || player.fouls >= 2 || player.turnovers > 0)
      .map((player) => player.playerId)
  ]);

  const relevantMetadata = rosterTeam.players
    .filter((player) => player.role?.trim() || player.notes?.trim())
    .filter((player) => relevantPlayers.size === 0 || relevantPlayers.has(player.id));

  const playersToDescribe = (relevantMetadata.length > 0 ? relevantMetadata : rosterTeam.players)
    .filter((player) => player.role?.trim() || player.notes?.trim())
    .slice(0, 8);

  return playersToDescribe.map((player) => {
    const details = [
      player.role?.trim() ? `role: ${player.role.trim()}` : "",
      player.notes?.trim() ? `context: ${player.notes.trim()}` : "",
      liveLineup.has(player.id) ? "currently in lineup" : ""
    ].filter(Boolean).join("; ");

    return `- ${player.id}${player.number ? ` (#${player.number})` : ""}: ${details}`;
  });
}

function isOpeningSample(state: GameState, orderedEvents: GameEvent[]): boolean {
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const inEarlyQ1 = state.currentPeriod === "Q1" && (latestEvent?.clockSecondsRemaining ?? 0) >= 390;
  const lowEventVolume = orderedEvents.length < 10;
  return inEarlyQ1 || lowEventVolume;
}

function buildAiInsightPrompt(
  session: GameSession,
  orderedEvents: GameEvent[],
  historicalContextSummary?: string
): string {
  const state = session.state;
  const recentEvents = orderedEvents.slice(-LIVE_AI_RECENT_EVENT_WINDOW);
  const openingSample = isOpeningSample(state, orderedEvents);
  const preGame = isPreGameState(state, orderedEvents);
  const aiSettings = sanitizeCoachAiSettings(session.aiSettings);
  const aiContext = sanitizeGameAiContext(session.aiContext);
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const clockSec = latestEvent?.clockSecondsRemaining ?? 0;
  const isOT = isOvertimePeriod(state.currentPeriod);

  // Identify which is "our" team
  const ourTeamId = state.opponentTeamId
    ? (state.homeTeamId !== state.opponentTeamId ? state.homeTeamId : state.awayTeamId)
    : session.homeTeamId;
  const opponentTeamId = state.opponentTeamId ?? session.awayTeamId;
  const rosterTeam = rosterTeams.find((team) => team.id === ourTeamId);

  const homeLabel = state.homeTeamId === ourTeamId ? "Our team (home)" : (state.opponentName || "Opponent (home)");
  const awayLabel = state.awayTeamId === ourTeamId ? "Our team (away)" : (state.opponentName || "Opponent (away)");

  const clockStr = clockSec >= 60
    ? `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}`
    : `${clockSec}s`;

  // Timeout usage
  const timeouts = orderedEvents.filter((e) => e.type === "timeout");
  const ourTimeouts = timeouts.filter((e) => e.teamId === ourTeamId).length;
  const oppTimeouts = timeouts.filter((e) => e.teamId === opponentTeamId).length;
  const maxRegTimeouts = 3;
  const maxOTTimeouts = 1;
  const maxTimeouts = isOT ? maxOTTimeouts : maxRegTimeouts;

  // Player foul summary for our team
  const ourPlayers = Object.values(state.playerStatsByTeam[ourTeamId] ?? {});
  const playerFoulLines = ourPlayers
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 2)
    .sort((a, b) => (state.playerFouls[b.playerId] ?? 0) - (state.playerFouls[a.playerId] ?? 0))
    .map((p) => {
      const f = state.playerFouls[p.playerId] ?? 0;
      const foulNote = f >= 4 ? " (FOUL OUT RISK)" : f === 3 ? " (watch)" : "";
      return `${p.playerId}: ${f} fouls${foulNote}, ${p.points}pts, ${p.fgMade}/${p.fgAttempts}FG`;
    });

  // Our active lineup
  const ourLineup = (state.activeLineupsByTeam[ourTeamId] ?? []).join(", ");
  const theirLineup = (state.activeLineupsByTeam[opponentTeamId] ?? []).join(", ");

  const recentEventLines = recentEvents.map((event) => `- ${describeEvent(event)}`).join("\n");
  const focusInsightsLine = aiSettings.focusInsights.length > 0
    ? `Coach requested focus: ${aiSettings.focusInsights.join(", ")}`
    : "Coach requested focus: none";
  const combinedStyle = [rosterTeam?.coachStyle?.trim(), aiSettings.playingStyle]
    .filter(Boolean)
    .join(" | ");
  const styleLine = combinedStyle
    ? `Team playing style from coach: ${combinedStyle}`
    : "Team playing style from coach: not provided";
  const contextLine = aiSettings.teamContext
    ? `Team context from coach: ${aiSettings.teamContext}`
    : "Team context from coach: not provided";
  const customPromptLine = aiSettings.customPrompt
    ? `Custom coach instruction: ${aiSettings.customPrompt}`
    : "Custom coach instruction: none";
  const historicalLine = historicalContextSummary
    ? `Historical context from stats dashboard: ${historicalContextSummary}`
    : "Historical context from stats dashboard: unavailable";
  const rosterMetadataLines = buildRosterMetadataLines(state, ourTeamId);
  const clockTrackingLine = `Clock tracking status: ${aiContext.clockEnabled ? "enabled" : "disabled"}`;
  const opponentTrackingLine = aiContext.opponentStatsLimited
    ? `Opponent stat tracking: limited (${aiContext.opponentTrackedStats.join(", ")})`
    : `Opponent stat tracking: expanded (${aiContext.opponentTrackedStats.join(", ")})`;

  if (preGame) {
    return [
      "CONTEXT: Game has just started — minimal data available.",
      "Give ONE general pre-game readiness note only. Do not reference stats or runs.",
      `Home: ${homeLabel} | Away: ${awayLabel}`,
      "IMPORTANT: Do not make assumptions about plays, strategies, or player roles without data."
    ].join("\n");
  }

  return [
    `Game: ${state.gameId}`,
    `Period: ${state.currentPeriod}${isOT ? " [OVERTIME — 4-min period, 1 timeout per team per OT]" : ""}`,
    `Clock: ${clockStr}${latestEvent && clockSec === 0 ? " [clock at 0:00 in latest event]" : ""}`,
    clockTrackingLine,
    opponentTrackingLine,
    `Sample context: ${openingSample ? "opening_small_sample — be conservative with conclusions" : "stabilized"}`,
    "",
    `Score: ${homeLabel} ${state.scoreByTeam[session.homeTeamId] ?? 0} — ${awayLabel} ${state.scoreByTeam[session.awayTeamId] ?? 0}`,
    "",
    "Team snapshots:",
    summarizeTeamState(state, ourTeamId, true, aiContext.opponentStatsLimited),
    summarizeTeamState(state, opponentTeamId, false, aiContext.opponentStatsLimited),
    "",
    `Timeouts used — us: ${ourTimeouts}/${maxTimeouts}, them: ${oppTimeouts}/${maxTimeouts}`,
    styleLine,
    contextLine,
    historicalLine,
    focusInsightsLine,
    customPromptLine,
    rosterMetadataLines.length > 0 ? `Roster context from coaches:\n${rosterMetadataLines.join("\n")}` : "",
    ourLineup ? `Our current lineup: ${ourLineup}` : "",
    theirLineup ? `Their current lineup: ${theirLineup}` : "",
    playerFoulLines.length > 0 ? `Our player foul detail:\n${playerFoulLines.join("\n")}` : "",
    "",
    `Recent events (last ${Math.min(LIVE_AI_RECENT_EVENT_WINDOW, recentEvents.length)}):`,
    recentEventLines || "- none",
    "",
    "RULES for your response:",
    "- You are helping OUR team (identified above). Give advice that benefits us, not the opponent.",
    "- Do NOT invent or guess tactical plays, player roles, or tendencies not visible in the data.",
    "- ONLY name specific players when their stats (fouls, points, etc.) directly support the claim.",
    "- If clock tracking status is disabled, omit clock-specific urgency statements and avoid time-dependent calls.",
    "- If opponent stat tracking is limited, avoid assumptions about opponent rebounds, assists, turnovers, and shot profile unless explicitly shown.",
    "- Think in this order before writing: score/time state -> foul/timeout constraints -> best immediate action -> fallback action.",
    "- Prioritize the coach's focus settings and custom instructions when they do not conflict with game reality.",
    "- Each insight must follow: Trigger | Action | Why-now, using concrete numbers from the context.",
    "- In clutch time (<= 30s, margin <= 3), always include one end-game management call (timeout/foul/2-for-1/quick-hit).",
    "- If multiple actions are reasonable, provide best call first and one fallback option.",
    isOT ? "- This is OVERTIME — timeout urgency is critical (only 1 per team). Note if either team still has their OT timeout." : "",
    openingSample
      ? "- Opening sample: keep claims conservative. No momentum/run language yet."
      : "- Data is stabilized: include decisive tactical calls grounded in provided stats only.",
    "- Allowed insight types per call: timeout suggestion, sub suggestion, foul management, momentum, shot selection, ball security.",
    "- Multiple insights allowed if the situation clearly warrants distinct calls.",
    "- Keep each message concise, command-style, and immediately actionable.",
  ].filter(Boolean).join("\n");
}

function resolveRecordLine(seasonStats: Record<string, unknown>): string {
  const wins = Number(seasonStats.win ?? seasonStats.wins ?? 0);
  const losses = Number(seasonStats.loss ?? seasonStats.losses ?? 0);
  if (Number.isFinite(wins) && Number.isFinite(losses) && (wins > 0 || losses > 0)) {
    return `${wins}-${losses}`;
  }
  return "n/a";
}

function resolveTeamLabelFromRoster(teamId: string): string {
  const team = rosterTeams.find((item) => item.id === teamId);
  return team?.name?.trim() || team?.abbreviation?.trim() || teamId;
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimToLength(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function summarizeHistoricalPlayers(playersPayload: Array<Record<string, unknown>>, session: GameSession): string {
  if (!Array.isArray(playersPayload) || playersPayload.length === 0) {
    return "";
  }

  const ourTeamId = session.opponentTeamId
    ? (session.homeTeamId !== session.opponentTeamId ? session.homeTeamId : session.awayTeamId)
    : session.homeTeamId;
  const rosterTeam = rosterTeams.find((team) => team.id === ourTeamId);
  const rosterNames = new Set((rosterTeam?.players ?? []).map((player) => player.name.trim().toLowerCase()).filter(Boolean));

  const preferredPlayers = playersPayload.filter((player) => {
    const fullName = trimToLength(player.full_name, 120).toLowerCase();
    const name = trimToLength(player.name, 120).toLowerCase();
    return rosterNames.size === 0 || rosterNames.has(fullName) || rosterNames.has(name);
  });

  const playersToSummarize = (preferredPlayers.length > 0 ? preferredPlayers : playersPayload)
    .slice()
    .sort((left, right) => safeNumber(right.ppg) - safeNumber(left.ppg))
    .slice(0, 12);

  if (playersToSummarize.length === 0) {
    return "";
  }

  return playersToSummarize.map((player) => {
    const fullName = trimToLength(player.full_name, 120) || trimToLength(player.name, 120) || "Unknown";
    const number = trimToLength(player.number, 8);
    const role = trimToLength(player.role, 80) || trimToLength((player.roster_info as { role?: unknown } | undefined)?.role, 80);
    const notes = trimToLength((player.roster_info as { notes?: unknown } | undefined)?.notes, 140);
    const line = [
      `${fullName}${number ? ` (#${number})` : ""}`,
      `${safeNumber(player.ppg).toFixed(1)} ppg`,
      `${safeNumber(player.rpg).toFixed(1)} rpg`,
      `${safeNumber(player.apg).toFixed(1)} apg`,
      `${safeNumber(player.fg_pct).toFixed(1)} FG%`,
      `${safeNumber(player.efg_pct).toFixed(1)} eFG%`,
      `${safeNumber(player.ts_pct).toFixed(1)} TS%`,
      `${safeNumber(player.fpg).toFixed(1)} fouls/g`,
      role ? `role: ${role}` : "",
      notes ? `notes: ${notes}` : "",
    ].filter(Boolean).join(", ");

    return `- ${line}`;
  }).join("\n");
}

function buildCurrentPlayerSnapshot(state: GameState, teamId: string): string {
  const playerStats = Object.values(state.playerStatsByTeam[teamId] ?? {})
    .slice()
    .sort((left, right) => right.points - left.points || right.fgMade - left.fgMade);

  if (playerStats.length === 0) {
    return "No tracked player stats yet.";
  }

  return playerStats
    .map((player) => {
      const fgPct = player.fgAttempts > 0 ? Math.round((player.fgMade / player.fgAttempts) * 100) : 0;
      const fouls = state.playerFouls[player.playerId] ?? player.fouls ?? 0;
      return `- ${player.playerId}: ${player.points} pts, ${player.fgMade}/${player.fgAttempts} FG (${fgPct}%), ${player.ftMade}/${player.ftAttempts} FT, ${player.reboundsOff + player.reboundsDef} reb, ${player.assists} ast, ${player.turnovers} to, ${fouls} fouls`;
    })
    .join("\n");
}

function sanitizeAiChatHistory(history: unknown): CoachAiChatMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item): CoachAiChatMessage => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: trimToLength(item.content, 1200),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-12);
}

function buildAiChatPrompt(
  session: GameSession,
  orderedEvents: GameEvent[],
  question: string,
  history: CoachAiChatMessage[],
  historicalContextSummary?: string
): string {
  const state = session.state;
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const ourTeamId = state.opponentTeamId
    ? (state.homeTeamId !== state.opponentTeamId ? state.homeTeamId : state.awayTeamId)
    : session.homeTeamId;
  const opponentTeamId = state.opponentTeamId ?? session.awayTeamId;
  const aiSettings = sanitizeCoachAiSettings(session.aiSettings);
  const aiContext = sanitizeGameAiContext(session.aiContext);
  const rosterTeam = rosterTeams.find((team) => team.id === ourTeamId);
  const isOT = isOvertimePeriod(state.currentPeriod);

  const clockSec = latestEvent?.clockSecondsRemaining ?? 0;
  const clockStr = clockSec >= 60
    ? `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}`
    : `${clockSec}s`;

  const recentEvents = orderedEvents.slice(-10).map((event) => `- ${describeEvent(event)}`).join("\n") || "- none";
  const chatHistory = history.length > 0
    ? history.map((entry) => `${entry.role === "assistant" ? "Assistant" : "Coach"}: ${entry.content}`).join("\n")
    : "Coach: no prior chat in this thread";

  // Coach settings and roster context (same as buildAiInsightPrompt)
  const combinedStyle = [rosterTeam?.coachStyle?.trim(), aiSettings.playingStyle].filter(Boolean).join(" | ");
  const styleLine = combinedStyle ? `Team playing style: ${combinedStyle}` : "Team playing style: not provided";
  const contextLine = aiSettings.teamContext ? `Team context: ${aiSettings.teamContext}` : "Team context: not provided";
  const customPromptLine = aiSettings.customPrompt ? `Custom coach instruction: ${aiSettings.customPrompt}` : "";
  const focusLine = aiSettings.focusInsights.length > 0 ? `Coach focus areas: ${aiSettings.focusInsights.join(", ")}` : "";
  const rosterMetadataLines = buildRosterMetadataLines(state, ourTeamId);

  // Player foul summary
  const ourPlayers = Object.values(state.playerStatsByTeam[ourTeamId] ?? {});
  const playerFoulLines = ourPlayers
    .filter((p) => (state.playerFouls[p.playerId] ?? 0) >= 2)
    .sort((a, b) => (state.playerFouls[b.playerId] ?? 0) - (state.playerFouls[a.playerId] ?? 0))
    .map((p) => {
      const f = state.playerFouls[p.playerId] ?? 0;
      const foulNote = f >= 4 ? " (FOUL OUT RISK)" : f === 3 ? " (watch)" : "";
      return `${p.playerId}: ${f} fouls${foulNote}, ${p.points}pts, ${p.fgMade}/${p.fgAttempts}FG`;
    });

  // Active lineups
  const ourLineup = (state.activeLineupsByTeam[ourTeamId] ?? []).join(", ");
  const theirLineup = (state.activeLineupsByTeam[opponentTeamId] ?? []).join(", ");

  // Active rule insights context
  const activeAlerts = (session.ruleInsights ?? []).slice(0, 6).map((i) => `- [${i.type}] ${i.message}`).join("\n");

  return [
    `Game: ${state.gameId}`,
    `Period: ${state.currentPeriod}${isOT ? " [OVERTIME]" : ""}  |  Clock: ${clockStr}`,
    `Clock tracking: ${aiContext.clockEnabled ? "enabled" : "disabled"}`,
    `Opponent stats: ${aiContext.opponentStatsLimited ? "limited" : "expanded"}`,
    "",
    `Our team: ${summarizeTeamState(state, ourTeamId, true, aiContext.opponentStatsLimited)}`,
    `Opponent: ${summarizeTeamState(state, opponentTeamId, false, aiContext.opponentStatsLimited)}`,
    "",
    `Current player stats (our team):\n${buildCurrentPlayerSnapshot(state, ourTeamId)}`,
    "",
    playerFoulLines.length > 0 ? `Player foul detail:\n${playerFoulLines.join("\n")}` : "",
    ourLineup ? `Our lineup: ${ourLineup}` : "",
    theirLineup ? `Their lineup: ${theirLineup}` : "",
    "",
    styleLine,
    contextLine,
    customPromptLine,
    focusLine,
    rosterMetadataLines.length > 0 ? `Roster context from coaches:\n${rosterMetadataLines.join("\n")}` : "",
    "",
    `Historical context: ${historicalContextSummary || "unavailable"}`,
    "",
    activeAlerts ? `Active system alerts:\n${activeAlerts}` : "",
    "",
    `Recent events:\n${recentEvents}`,
    "",
    `Conversation so far:\n${chatHistory}`,
    "",
    `Coach question: ${question}`,
    "",
    "Answer rules:",
    "- Answer as an in-game varsity basketball bench assistant for OUR team.",
    "- Use the live game state, player stats, roster context, coach instructions, and active alerts provided above.",
    "- Prioritize coach's style, context, focus areas, and custom instructions when they don't conflict with game reality.",
    "- When recommending substitutions, name exactly who goes in/out and explain the trigger clearly.",
    "- Reference specific player foul counts, stats, and lineup context when making calls.",
    "- If opponent stats are limited, avoid assumptions about opponent rebounding, assists, or shot profile.",
    "- If data is incomplete, say so directly instead of guessing.",
    "- Keep answers concise and immediately actionable with concrete numbers.",
    "- Output strict JSON: {\"answer\":\"...\",\"suggestions\":[\"...\",\"...\"]}",
    "- suggestions: 0 to 3 short follow-up questions the coach may want to ask next.",
    "- No markdown. No code fences.",
  ].filter(Boolean).join("\n");
}

async function fetchHistoricalContextSummary(session: GameSession): Promise<string> {
  async function attempt(): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const [seasonRes, gamesRes, playersRes] = await Promise.all([
        fetch(`${STATS_DASHBOARD_BASE}/api/season-stats`, {
          headers: buildStatsHeaders(),
          signal: controller.signal
        }),
        fetch(`${STATS_DASHBOARD_BASE}/api/games`, {
          headers: buildStatsHeaders(),
          signal: controller.signal
        }),
        fetch(`${STATS_DASHBOARD_BASE}/api/players`, {
          headers: buildStatsHeaders(),
          signal: controller.signal
        })
      ]);

      const seasonStats = seasonRes.ok
        ? await seasonRes.json() as Record<string, unknown>
        : {};
      const games = gamesRes.ok
        ? await gamesRes.json() as Array<Record<string, unknown>>
        : [];
      const players = playersRes.ok
        ? await playersRes.json() as Array<Record<string, unknown>>
        : [];

      const seasonLine = [
        `record ${resolveRecordLine(seasonStats)}`,
        `PPG ${Number(seasonStats.ppg ?? 0).toFixed(1)}`,
        `Opp PPG ${Number(seasonStats.opp_ppg ?? 0).toFixed(1)}`,
        `FG% ${Math.round(Number(seasonStats.fg_pct ?? 0) * 100)}%`,
        `3PT% ${Math.round(Number(seasonStats.fg3_pct ?? 0) * 100)}%`,
        `TO avg ${Number(seasonStats.to_avg ?? 0).toFixed(1)}`
      ].join(", ");

      const recentGames = Array.isArray(games)
        ? [...games].sort((a, b) => Number(b.gameId ?? 0) - Number(a.gameId ?? 0)).slice(0, 3)
        : [];
      const ourTeamId = session.opponentTeamId
        ? (session.homeTeamId !== session.opponentTeamId ? session.homeTeamId : session.awayTeamId)
        : session.homeTeamId;
      const ourTeamLabel = resolveTeamLabelFromRoster(ourTeamId);

      const recentLine = recentGames.length > 0
        ? recentGames.map((game) => {
          const vc = Number(game.vc_score ?? 0);
          const opp = Number(game.opp_score ?? 0);
          const opponent = String(game.opponent ?? "Unknown");
          const result = vc > opp ? "W" : vc < opp ? "L" : "T";
          return `${opponent} ${result} ${vc}-${opp}`;
        }).join(" | ")
        : "no recent games";

      const playerLine = summarizeHistoricalPlayers(players, session);

      return `${ourTeamLabel} season: ${seasonLine}. Last games: ${recentLine}.${playerLine ? ` Player history:\n${playerLine}` : ""}`;
    } catch {
      return "";
    } finally {
      clearTimeout(timeout);
    }
  }

  const result = await attempt();
  if (result) return result;
  // One retry after a short delay to recover from transient network or cold-start timeouts
  await new Promise<void>((resolve) => setTimeout(resolve, 1200));
  return attempt();
}

function parseAiChatResponse(content: string): { answer: string; suggestions: string[] } {
  try {
    const parsed = JSON.parse(content) as { answer?: unknown; suggestions?: unknown };
    const answer = trimToLength(parsed.answer, 4000);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((item) => trimToLength(item, 160)).filter(Boolean).slice(0, 3)
      : [];

    if (answer) {
      return { answer, suggestions };
    }
  } catch {
    // Fall through to raw-text fallback.
  }

  return {
    answer: trimToLength(content, 4000),
    suggestions: []
  };
}

async function requestAiChatResponse(
  session: GameSession,
  question: string,
  history: CoachAiChatMessage[]
): Promise<CoachAiChatResponse | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  if (Date.now() - session.historicalContextFetchedAtMs >= HISTORICAL_CONTEXT_TTL_MS) {
    const summary = await fetchHistoricalContextSummary(session);
    if (summary) {
      session.historicalContextSummary = summary;
      session.historicalContextFetchedAtMs = Date.now();
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_AI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LIVE_AI_MODEL,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a live varsity basketball assistant for the coaching staff.",
              "Answer in-game questions using the provided live stats, lineup context, recent events, and historical team/player performance.",
              "Favor concrete coaching actions: subs, matchup pressure, foul management, pace, shot diet, timeout use.",
              "Do not invent film, scheme, or player tendencies that are not present in the provided context.",
              "If evidence is thin, say so clearly.",
              "Output strict JSON only: {\"answer\":\"...\",\"suggestions\":[\"...\"]}."
            ].join(" ")
          },
          {
            role: "user",
            content: buildAiChatPrompt(session, orderedEvents, question, history, session.historicalContextSummary)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = parseAiChatResponse(content);
    return {
      answer: parsed.answer,
      suggestions: parsed.suggestions,
      generatedAtIso: new Date().toISOString(),
      usedHistoricalContext: Boolean(session.historicalContextSummary)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseAiInsightResponse(content: string, session: GameSession, latestEvent: GameEvent): LiveInsight[] {
  const parsed = JSON.parse(content) as { insights?: unknown };
  const rawInsights = Array.isArray(parsed.insights) ? parsed.insights : [];
  const validTeams = new Set(Object.keys(session.state.scoreByTeam));
  const createdAtIso = new Date().toISOString();

  const insights = rawInsights
    .map((item, index): LiveInsight | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const message = typeof raw.message === "string" ? raw.message.trim() : "";
      const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
      if (!message || !explanation) {
        return null;
      }

      const relatedTeamId = typeof raw.relatedTeamId === "string" && validTeams.has(raw.relatedTeamId)
        ? raw.relatedTeamId
        : undefined;
      const confidence = raw.confidence === "high" ? "high" : "medium";

      return {
        id: `ai-${latestEvent.id}-${index}`,
        gameId: session.state.gameId,
        type: "ai_coaching",
        priority: "important",
        createdAtIso,
        confidence,
        message,
        explanation,
        relatedTeamId
      };
    })
    .filter((insight): insight is LiveInsight => insight !== null);

  // Allow up to 4 AI insights for richer late-game and OT guidance
  return insights.slice(0, 4);
}

async function requestAiInsights(session: GameSession, orderedEvents: GameEvent[]): Promise<LiveInsight[]> {
  const apiKey = getOpenAiApiKey();
  const latestEvent = orderedEvents[orderedEvents.length - 1];

  if (!apiKey || !latestEvent) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_AI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LIVE_AI_MODEL,
        temperature: 0.2,
        max_tokens: 650,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a varsity basketball bench assistant speaking directly to coaches in real time.",
              "Your job is to help OUR team win — all advice should benefit our team.",
              "Use ONLY the provided game state and recent events. Never invent plays, tendencies, or player roles.",
              "NEVER guess tactical plays (e.g. pick and roll) unless that specific event type appeared in the data.",
              "Base player-specific advice only on stats (points, fouls, FG%) that appear in the context.",
              "Be direct, practical, command-style. No fluff, no analysis paragraphs.",
              "Decision quality standard: prioritize the highest-leverage next possession call before secondary advice.",
              "When game state is clutch or overtime, include time/score management (timeouts, foul strategy, tempo) grounded in context.",
              "When clock context is unavailable/disabled, avoid time-specific commands and focus on possession quality and foul/lineup management.",
              "Output strict JSON: {\"insights\":[{\"message\":\"...\",\"explanation\":\"...\",\"relatedTeamId\":\"...\",\"confidence\":\"high|medium\"}]}",
              "message: one concise coaching call.",
              "explanation: one stat-grounded reason from the data provided, including trigger and why-now.",
              "You may write 1 to 4 insights if the situation warrants multiple distinct calls.",
              "No markdown. No code fences."
            ].join(" ")
          },
          {
            role: "user",
            content: buildAiInsightPrompt(session, orderedEvents, session.historicalContextSummary)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsedInsights = parseAiInsightResponse(content, session, latestEvent);
    if (!isOpeningSample(session.state, orderedEvents)) {
      return parsedInsights;
    }

    return parsedInsights
      .slice(0, 1)
      .map((insight) => ({
        ...insight,
        explanation: insight.explanation.startsWith("Opening sample")
          ? insight.explanation
          : `Opening sample: ${insight.explanation}`
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function persistSessions() {
  if (!persistenceEnabled) {
    return;
  }

  mkdirSync(dataDirectory, { recursive: true });

  const payload: PersistedSnapshot = {
    sessions: [...sessions.values()].map((session) => ({
      gameId: session.state.gameId,
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      opponentName: session.opponentName,
      opponentTeamId: session.opponentTeamId,
      startingLineupByTeam: session.startingLineupByTeam,
      aiContext: sanitizeGameAiContext(session.aiContext),
      historicalContextSummary: session.historicalContextSummary,
      historicalContextFetchedAtMs: session.historicalContextFetchedAtMs,
      events: listOrderedEvents(session),
      aiSettings: sanitizeCoachAiSettings(session.aiSettings)
    })),
    rosterTeams
  };

  writeFileSync(dataFile, JSON.stringify(payload, null, 2), "utf8");
}

function restoreSessions() {
  if (!persistenceEnabled || !existsSync(dataFile)) {
    return;
  }

  const payload = JSON.parse(readFileSync(dataFile, "utf8")) as PersistedSnapshot | PersistedGameSession[];
  const persistedSessions = Array.isArray(payload) ? payload : payload.sessions;
  const persistedRosterTeams = Array.isArray(payload) ? [] : payload.rosterTeams;

  rosterTeams = Array.isArray(persistedRosterTeams) ? persistedRosterTeams : [];

  for (const session of persistedSessions) {
    const initialState = createInitialGameState(
      session.gameId,
      session.homeTeamId,
      session.awayTeamId,
      session.opponentName,
      session.opponentTeamId
    );

    // Re-seed the starting lineup before replaying events so substitutions
    // are applied on top of the correct initial on-court players.
    if (session.startingLineupByTeam) {
      for (const [teamId, lineup] of Object.entries(session.startingLineupByTeam)) {
        if ((teamId === session.homeTeamId || teamId === session.awayTeamId) && Array.isArray(lineup)) {
          initialState.activeLineupsByTeam[teamId] = lineup.map(String).filter(Boolean);
        }
      }
    }

    const restoredSession: GameSession = {
      homeTeamId: session.homeTeamId,
      awayTeamId: session.awayTeamId,
      opponentName: session.opponentName,
      opponentTeamId: session.opponentTeamId,
      startingLineupByTeam: session.startingLineupByTeam,
      aiSettings: sanitizeCoachAiSettings(session.aiSettings),
      aiContext: sanitizeGameAiContext(session.aiContext),
      historicalContextSummary: typeof session.historicalContextSummary === "string" ? session.historicalContextSummary : "",
      historicalContextFetchedAtMs: Number(session.historicalContextFetchedAtMs ?? 0),
      state: replayEvents(initialState, session.events),
      eventsById: new Map(session.events.map((event) => [event.id, event])),
      eventIdsBySequence: new Map(session.events.map((event) => [event.sequence, event.id])),
      ruleInsights: [],
      aiInsights: [],
      aiRefreshInFlight: null,
      lastAiRefreshAtMs: 0,
      lastAiEventCount: 0,
      lastAiFingerprint: ""
    };

    recomputeSession(restoredSession);
    sessions.set(session.gameId, restoredSession);
  }
}

restoreSessions();

export function getRosterTeams(): RosterTeam[] {
  return rosterTeams;
}

export function saveRosterTeams(next: RosterTeam[]): RosterTeam[] {
  rosterTeams = Array.isArray(next) ? next : [];
  persistSessions();
  return rosterTeams;
}

export function createGame(input: CreateGameInput): GameState {
  const state = createInitialGameState(
    input.gameId,
    input.homeTeamId,
    input.awayTeamId,
    input.opponentName,
    input.opponentTeamId
  );

  if (input.startingLineupByTeam) {
    for (const [teamId, lineup] of Object.entries(input.startingLineupByTeam)) {
      if (teamId !== input.homeTeamId && teamId !== input.awayTeamId) {
        continue;
      }

      const seededLineup = Array.isArray(lineup)
        ? [...new Set(lineup.map((playerId) => String(playerId).trim()).filter(Boolean))].slice(0, 5)
        : [];

      state.activeLineupsByTeam[teamId] = seededLineup;
    }
  }

  sessions.set(input.gameId, {
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    opponentName: input.opponentName,
    opponentTeamId: input.opponentTeamId,
    startingLineupByTeam: input.startingLineupByTeam,
    aiSettings: defaultCoachAiSettings(),
    aiContext: sanitizeGameAiContext(input.aiContext),
    historicalContextSummary: "",
    historicalContextFetchedAtMs: 0,
    state,
    eventsById: new Map<string, GameEvent>(),
    eventIdsBySequence: new Map<number, string>(),
    ruleInsights: [],
    aiInsights: [],
    aiRefreshInFlight: null,
    lastAiRefreshAtMs: 0,
    lastAiEventCount: 0,
    lastAiFingerprint: ""
  });

  persistSessions();

  return state;
}

export function deleteGame(gameId: string): boolean {
  const removed = sessions.delete(gameId);
  if (removed) {
    persistSessions();
  }
  return removed;
}

/**
 * Patch the active lineup for one or more teams without resetting game state or
 * replaying events.  Only fills in empty slots — if a team already has 5 players
 * on court the incoming lineup is ignored for that team.  Returns the updated
 * state, or null if the game doesn't exist.
 */
export function patchGameLineup(
  gameId: string,
  startingLineupByTeam: Record<string, string[]>
): GameState | null {
  const session = sessions.get(gameId);
  if (!session) return null;

  let changed = false;
  for (const [teamId, lineup] of Object.entries(startingLineupByTeam)) {
    if (teamId !== session.homeTeamId && teamId !== session.awayTeamId) continue;
    if ((session.state.activeLineupsByTeam[teamId]?.length ?? 0) >= 5) continue;

    const seeded = [...new Set(lineup.map((id) => String(id).trim()).filter(Boolean))].slice(0, 5);
    if (seeded.length === 0) continue;

    session.state = {
      ...session.state,
      activeLineupsByTeam: {
        ...session.state.activeLineupsByTeam,
        [teamId]: seeded,
      },
    };
    // Persist the starting lineup so it survives server restarts.
    session.startingLineupByTeam = {
      ...(session.startingLineupByTeam ?? {}),
      [teamId]: seeded,
    };
    changed = true;
  }

  if (changed) {
    persistSessions();
  }

  return session.state;
}

export function getGameState(gameId: string): GameState | null {
  return sessions.get(gameId)?.state ?? null;
}

export function getGameAiSettings(gameId: string): CoachAiSettings | null {
  const session = sessions.get(gameId);
  if (!session) {
    return null;
  }
  return sanitizeCoachAiSettings(session.aiSettings);
}

export function getGameAiContext(gameId: string): GameAiContext | null {
  const session = sessions.get(gameId);
  if (!session) {
    return null;
  }
  return sanitizeGameAiContext(session.aiContext);
}

export function updateGameAiSettings(gameId: string, settings: Partial<CoachAiSettings>): CoachAiSettings | null {
  const session = sessions.get(gameId);
  if (!session) {
    return null;
  }

  session.aiSettings = sanitizeCoachAiSettings({
    ...session.aiSettings,
    ...settings
  });
  // Force next AI refresh to include updated instructions.
  session.lastAiFingerprint = "";
  session.lastAiRefreshAtMs = 0;
  persistSessions();
  return session.aiSettings;
}

export function updateGameAiContext(gameId: string, context: Partial<GameAiContext>): GameAiContext | null {
  const session = sessions.get(gameId);
  if (!session) {
    return null;
  }

  session.aiContext = sanitizeGameAiContext({
    ...session.aiContext,
    ...context
  });
  recomputeSession(session);
  session.lastAiFingerprint = "";
  session.lastAiRefreshAtMs = 0;
  persistSessions();
  return session.aiContext;
}

export function getGameAiPromptPreview(gameId: string): AiPromptPreview | null {
  const session = sessions.get(gameId);
  if (!session) {
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  const coachSettings = sanitizeCoachAiSettings(session.aiSettings);
  const userPrompt = buildAiInsightPrompt(
    { ...session, aiSettings: coachSettings },
    orderedEvents,
    session.historicalContextSummary
  );

  return {
    model: LIVE_AI_MODEL,
    userPrompt,
    systemGuide: [
      "Uses only provided game state and recent events.",
      "Prioritizes our team outcome and avoids speculative play calls.",
      "Returns strict JSON coaching insights with trigger/action/why-now structure.",
      "Keeps hidden internal safety and policy rules private."
    ],
    coachSettings,
    recentEventCount: orderedEvents.length,
    generatedAtIso: new Date().toISOString()
  };
}

export async function answerGameAiChat(
  gameId: string,
  question: string,
  history?: unknown
): Promise<CoachAiChatResponse | null> {
  const session = sessions.get(gameId);
  const trimmedQuestion = trimToLength(question, 1200);
  if (!session || !trimmedQuestion) {
    return null;
  }

  return requestAiChatResponse(session, trimmedQuestion, sanitizeAiChatHistory(history));
}

export function getGameInsights(gameId: string): LiveInsight[] {
  const session = sessions.get(gameId);
  return session ? combineInsights(session) : [];
}

export function getGameEvents(gameId: string): GameEvent[] {
  const session = sessions.get(gameId);
  if (!session) {
    return [];
  }

  return listOrderedEvents(session);
}

function listOrderedEvents(session: GameSession): GameEvent[] {
  return [...session.eventsById.values()].sort((left, right) => left.sequence - right.sequence);
}

function recomputeSession(session: GameSession): void {
  const orderedEvents = listOrderedEvents(session);
  const initialState = createInitialGameState(
    session.state.gameId,
    session.homeTeamId,
    session.awayTeamId,
    session.opponentName,
    session.opponentTeamId
  );

  session.state = replayEvents(initialState, orderedEvents);

  const insightIds = new Set<string>();
  // Tracks the latest insight id per (type, teamId, playerId) to replace stale same-condition alerts
  const latestByCondition = new Map<string, string>();
  const insights: LiveInsight[] = [];
  let rollingState = initialState;

  for (const event of orderedEvents) {
    rollingState = applyEvent(rollingState, event);
    const nextInsights = generateInsights({
      state: rollingState,
      latestEvent: event,
      clockEnabled: session.aiContext.clockEnabled
    }).filter((insight) => !insightIds.has(insight.id));

    for (const insight of nextInsights) {
      const conditionKey = `${insight.type}:${insight.relatedTeamId ?? ""}:${insight.relatedPlayerId ?? ""}`;
      const supersededId = latestByCondition.get(conditionKey);
      if (supersededId !== undefined) {
        const oldIdx = insights.findIndex((i) => i.id === supersededId);
        if (oldIdx !== -1) {
          insights.splice(oldIdx, 1);
        }
        insightIds.delete(supersededId);
      }
      latestByCondition.set(conditionKey, insight.id);
      insightIds.add(insight.id);
      insights.unshift(insight);
    }
  }

  // Strip stale pre-game insights once the game has meaningfully started
  const totalScore = Object.values(session.state.scoreByTeam ?? {}).reduce((s, v) => s + v, 0);
  const stillPreGame = session.state.currentPeriod === "Q1" && totalScore === 0 && session.state.events.length < 5;
  const finalInsights = stillPreGame ? insights : insights.filter((i) => i.type !== "pre_game");

  session.ruleInsights = finalInsights.slice(0, 15);
}

export async function refreshGameAiInsights(
  gameId: string,
  options?: { force?: boolean }
): Promise<LiveInsight[] | null> {
  const session = sessions.get(gameId);
  if (!session) {
    return null;
  }

  const forceRefresh = options?.force === true;

  if (!getOpenAiApiKey()) {
    return null;
  }

  const orderedEvents = listOrderedEvents(session);
  if (Date.now() - session.historicalContextFetchedAtMs >= HISTORICAL_CONTEXT_TTL_MS) {
    const summary = await fetchHistoricalContextSummary(session);
    if (summary) {
      session.historicalContextSummary = summary;
      session.historicalContextFetchedAtMs = Date.now();
    }
  }

  if (orderedEvents.length < LIVE_AI_MIN_EVENTS) {
    if (session.aiInsights.length > 0) {
      session.aiInsights = [];
      session.lastAiEventCount = orderedEvents.length;
      session.lastAiFingerprint = "";
      persistSessions();
      return combineInsights(session);
    }

    return null;
  }

  const latestEvent = orderedEvents[orderedEvents.length - 1];
  if (!latestEvent) {
    return null;
  }

  const fingerprint = [
    orderedEvents.length,
    latestEvent.id,
    latestEvent.sequence,
    session.state.currentPeriod,
    latestEvent.clockSecondsRemaining,
    ...Object.entries(session.state.scoreByTeam).flat()
  ].join("|");

  const now = Date.now();
  const hasEnoughNewEvents = orderedEvents.length - session.lastAiEventCount >= LIVE_AI_REFRESH_EVERY_EVENTS;
  const intervalElapsed = now - session.lastAiRefreshAtMs >= LIVE_AI_MIN_INTERVAL_MS;
  const shouldRefresh = session.aiInsights.length === 0 || fingerprint !== session.lastAiFingerprint;

  if (!forceRefresh && (!shouldRefresh || (!hasEnoughNewEvents && !intervalElapsed && session.aiInsights.length > 0))) {
    return null;
  }

  if (session.aiRefreshInFlight) {
    return session.aiRefreshInFlight;
  }

  session.aiRefreshInFlight = requestAiInsights(session, orderedEvents)
    .then((aiInsights) => {
      // Only update if we got new insights; preserve existing if API failed/timed out
      if (aiInsights.length > 0) {
        session.aiInsights = aiInsights;
        session.lastAiRefreshAtMs = Date.now();
        session.lastAiEventCount = orderedEvents.length;
        session.lastAiFingerprint = fingerprint;
        persistSessions();
      } else {
        // API failed/timed out: keep existing aiInsights, rule-based insights show as fallback
        session.lastAiEventCount = orderedEvents.length;
      }
      return combineInsights(session);
    })
    .catch(() => {
      // Network error: keep existing insights and show rule-based fallback
      console.warn("[realtime-api] AI insights fetch failed; showing rule-based insights");
      return combineInsights(session);
    })
    .finally(() => {
      session.aiRefreshInFlight = null;
    });

  return session.aiRefreshInFlight;
}

export function ingestEvent(rawEvent: unknown): {
  event: GameEvent;
  state: GameState;
  insights: LiveInsight[];
} {
  const event = parseGameEvent(rawEvent);
  const session = sessions.get(event.gameId);

  if (!session) {
    throw new Error(`Game not found: ${event.gameId}`);
  }

  const existingEventId = session.eventIdsBySequence.get(event.sequence);
  if (existingEventId && existingEventId !== event.id) {
    throw new Error(`Sequence ${event.sequence} already belongs to event ${existingEventId}`);
  }

  if (session.eventsById.has(event.id)) {
    return { event, state: session.state, insights: combineInsights(session) };
  }

  session.eventsById.set(event.id, event);
  session.eventIdsBySequence.set(event.sequence, event.id);
  recomputeSession(session);
  persistSessions();

  return {
    event,
    state: session.state,
    insights: combineInsights(session)
  };
}

export function deleteEvent(gameId: string, eventId: string): {
  state: GameState;
  insights: LiveInsight[];
} {
  const session = sessions.get(gameId);

  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const event = session.eventsById.get(eventId);
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  session.eventsById.delete(eventId);
  session.eventIdsBySequence.delete(event.sequence);
  recomputeSession(session);
  persistSessions();

  return {
    state: session.state,
    insights: combineInsights(session)
  };
}

export function updateEvent(gameId: string, eventId: string, rawEvent: unknown): {
  event: GameEvent;
  state: GameState;
  insights: LiveInsight[];
} {
  const session = sessions.get(gameId);
  if (!session) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const existing = session.eventsById.get(eventId);
  if (!existing) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const parsed = parseGameEvent({
    ...(rawEvent as object),
    id: eventId,
    gameId
  });

  const currentOwner = session.eventIdsBySequence.get(parsed.sequence);
  if (currentOwner && currentOwner !== eventId) {
    throw new Error(`Sequence ${parsed.sequence} already belongs to event ${currentOwner}`);
  }

  session.eventsById.set(eventId, parsed);
  if (existing.sequence !== parsed.sequence) {
    session.eventIdsBySequence.delete(existing.sequence);
  }
  session.eventIdsBySequence.set(parsed.sequence, eventId);

  recomputeSession(session);
  persistSessions();

  return {
    event: parsed,
    state: session.state,
    insights: combineInsights(session)
  };
}
