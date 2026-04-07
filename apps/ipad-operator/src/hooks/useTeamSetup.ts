import { normalizeTeamColor } from "@bta/shared-schema";
import type { GameEvent } from "@bta/shared-schema";
import {
  DEFAULT_AWAY_TEAM_COLOR,
  DEFAULT_HOME_TEAM_COLOR,
} from "../constants.js";
import { normalizeOpponentTrackStats } from "../helpers/network.js";
import type { AppData, Player } from "../types.js";
import type { OpponentTrackStat, TeamSide } from "../types.js";

interface Result {
  myTeam: AppData["teams"][number] | undefined;
  vcSideSetup: TeamSide;
  homeTeam: AppData["teams"][number] | undefined;
  awayTeam: AppData["teams"][number] | undefined;
  opponentName: string;
  opponentTeamId: string;
  homeTeamId: string;
  awayTeamId: string;
  vcTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeTeamColor: string;
  awayTeamColor: string;
  trackClock: boolean;
  trackPossession: boolean;
  trackTimeouts: boolean;
  opponentSide: TeamSide;
  isOpponentStatEnabled: (key: OpponentTrackStat) => boolean;
  homePlayers: Player[];
  awayPlayers: Player[];
  allPlayers: Player[];
  resolveTeamId: (side: TeamSide) => string;
  normalizeEventTeamId: (event: GameEvent) => GameEvent;
}

function generateTeamId(name: string): string {
  return `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent"}`;
}

export function useTeamSetup(appData: AppData): Result {
  const myTeam = appData.teams.find((t) => t.id === appData.gameSetup.myTeamId);
  const vcSideSetup: TeamSide = appData.gameSetup.vcSide ?? "home";
  const homeTeam = vcSideSetup === "home" ? myTeam : undefined;
  const awayTeam = vcSideSetup === "away" ? myTeam : undefined;
  const opponentName = appData.gameSetup.opponent?.trim() || "";
  const opponentTeamId = opponentName ? generateTeamId(opponentName) : "opponent";
  const homeTeamId = vcSideSetup === "home" ? (appData.gameSetup.myTeamId || "team-home") : opponentTeamId;
  const awayTeamId = vcSideSetup === "away" ? (appData.gameSetup.myTeamId || "team-away") : opponentTeamId;
  const vcTeamId = vcSideSetup === "home" ? homeTeamId : awayTeamId;
  const homeTeamName = myTeam && vcSideSetup === "home" ? myTeam.name : opponentName || "Home";
  const awayTeamName = myTeam && vcSideSetup === "away" ? myTeam.name : opponentName || "Away";
  const homeTeamAbbr = vcSideSetup === "home"
    ? (myTeam?.abbreviation ?? homeTeamName.slice(0, 3).toUpperCase())
    : (opponentName ? opponentName.slice(0, 3).toUpperCase() : "OPP");
  const awayTeamAbbr = vcSideSetup === "away"
    ? (myTeam?.abbreviation ?? awayTeamName.slice(0, 3).toUpperCase())
    : (opponentName ? opponentName.slice(0, 3).toUpperCase() : "OPP");
  const homeTeamColor = normalizeTeamColor(appData.gameSetup.homeTeamColor) ?? DEFAULT_HOME_TEAM_COLOR;
  const awayTeamColor = normalizeTeamColor(appData.gameSetup.awayTeamColor) ?? DEFAULT_AWAY_TEAM_COLOR;
  const opponentTrackStats = normalizeOpponentTrackStats(appData.gameSetup.opponentTrackStats);
  const opponentTrackSet = new Set<OpponentTrackStat>(opponentTrackStats);
  const trackClock = appData.gameSetup.trackClock ?? true;
  const trackPossession = appData.gameSetup.trackPossession ?? true;
  const trackTimeouts = appData.gameSetup.trackTimeouts ?? true;
  const opponentSide: TeamSide = vcSideSetup === "home" ? "away" : "home";

  function isOpponentStatEnabled(key: OpponentTrackStat): boolean {
    return opponentTrackSet.has(key);
  }

  const homePlayers: Player[] = homeTeam?.players ?? [];
  const awayPlayers: Player[] = awayTeam?.players ?? [];
  const allPlayers: Player[] = [...homePlayers, ...awayPlayers];

  function resolveTeamId(side: TeamSide): string {
    return side === "home" ? homeTeamId : awayTeamId;
  }

  function normalizeEventTeamId(event: GameEvent): GameEvent {
    if (event.teamId === homeTeamId || event.teamId === awayTeamId) return event;
    if (event.teamId === "home") return { ...event, teamId: homeTeamId };
    if (event.teamId === "away") return { ...event, teamId: awayTeamId };
    if (event.teamId === "team-home") return { ...event, teamId: homeTeamId };
    if (event.teamId === "team-away") return { ...event, teamId: awayTeamId };
    return event;
  }

  return {
    myTeam,
    vcSideSetup,
    homeTeam,
    awayTeam,
    opponentName,
    opponentTeamId,
    homeTeamId,
    awayTeamId,
    vcTeamId,
    homeTeamName,
    awayTeamName,
    homeTeamAbbr,
    awayTeamAbbr,
    homeTeamColor,
    awayTeamColor,
    trackClock,
    trackPossession,
    trackTimeouts,
    opponentSide,
    isOpponentStatEnabled,
    homePlayers,
    awayPlayers,
    allPlayers,
    resolveTeamId,
    normalizeEventTeamId,
  };
}
