import { useEffect, useMemo, useRef, useState } from "react";
import TutorialOverlay from "./TutorialOverlay.js";
import IpadTipsPage from "./IpadTipsPage.js";
import { SettingsScreen } from "./SettingsScreen.js";
import { PreGameScreen } from "./PreGameScreen.js";
import { PostGameScreen } from "./PostGameScreen.js";
import { GameSummaryModal } from "./GameSummaryModal.js";
import { ModalRouter, ChainPromptBar } from "./ModalRouter.js";
import { ScoringPanel } from "./ScoringPanel.js";
import { RosterPanel } from "./RosterPanel.js";
import { useFeedback, useInlineNotice, useConfirmDialog, useNetworkStatus, useWakeLock, useClockTick, useEventQueue, useCoachSync, useSocket, useGameActions, useEventEditor, usePeriodControl, getPeriodOrder, useGameFlow, buildRealtimeGameRegistrationPayload, buildRealtimeGameRegistrationPayload, DEFAULT_CONNECTION_SYNC_STATUS } from "./hooks/index.js";
import {
  getPeriodDefaultClock,
  isOvertimePeriod,
  normalizeTeamColor,
  type GameEvent,
} from "@bta/shared-schema";
import { io } from "socket.io-client";
import {
  createTeamViaRealtime,
  deletePlayerViaRealtime,
  deleteTeamViaRealtime,
  updatePlayerViaRealtime,
  updateTeamViaRealtime,
} from "./roster-sync.js";

import {
  DEFAULT_API,
  DEFAULT_HOME_TEAM_COLOR,
  DEFAULT_AWAY_TEAM_COLOR,
  DEFAULT_SCHOOL_ID,
  DEFAULT_STATS_DASHBOARD,
} from "./constants.js";
import type {
  AppData,
  ChainPrompt,
  DashboardPlayerStat,
  EventEditContext,
  FeedEventSelection,
  GameSetup,
  Modal,
  OperatorAlert,
  Player,
  RunningTotals,
  Team,
} from "./types.js";
import type { OpponentTrackStat, SettingsView, TeamSide } from "./types.js";
import {
  clockToSec,
  formatClockFromDigits,
  formatClockFromPadInput,
  formatClockFromSeconds,
} from "./helpers/clock.js";
import {
  computePlayerTotals,
  computeScores,
  describeEvent,
  getEventSectionLabel,
  getEventTeamBucket,
} from "./helpers/events.js";
import {
  getOperatorAlertAutoClearMs,
} from "./helpers/labels.js";
import {
  apiHeaders,
  apiKeyHeader,
  buildCoachViewUrl,
  generateGameId,
  isConnectionReadyForStart,
  normalizeConnectionId,
  normalizeOpponentTrackStats,
  normalizeUrlBase,
} from "./helpers/network.js";
import {
  abbreviateName,
  computeTeamStats,
  playerDisplayName,
} from "./helpers/players.js";
import {
  clearOperatorLocalCache,
  DEFAULT_DATA,
  getOrCreateOperatorId,
  loadAppData,
  loadPending,
  saveAppData,
  uid,
} from "./helpers/storage.js";

function parseViewFromHash(hash: string): { view: "game" | "settings"; settingsView: SettingsView } {
  const h = hash.replace(/^#\/?/, "");
  if (h === "settings/game-setup") return { view: "settings", settingsView: "game-setup" };
  if (h === "settings/ipad-tips") return { view: "settings", settingsView: "ipad-tips" };
  if (h.startsWith("settings")) return { view: "settings", settingsView: "menu" };
  return { view: "game", settingsView: "menu" };
}

function viewToHash(v: "game" | "settings", sv: SettingsView): string {
  if (v === "settings" && sv !== "menu") return `#settings/${sv}`;
  if (v === "settings") return "#settings";
  return "#game";
}

export function App() {
  const { triggerFeedback, unlockFeedbackAudio } = useFeedback();
  const operatorId = useMemo(() => getOrCreateOperatorId(), []);

  // ---- App data (teams, game setup) ----
  const [appData, setAppData] = useState<AppData>(loadAppData);

  function persistData(next: AppData) {
    setAppData(next);
    saveAppData(next);
  }

  // ---- Navigation state ----
  const [view, setView] = useState<"game" | "settings">(() => parseViewFromHash(window.location.hash).view);
  const [settingsView, setSettingsView] = useState<SettingsView>(() => parseViewFromHash(window.location.hash).settingsView);
  const operatorAllowedSettingsViews = new Set<SettingsView>(["menu", "game-setup", "ipad-tips"]);

  function navigateView(nextView: "game" | "settings", nextSettingsView: SettingsView = "menu") {
    const hash = viewToHash(nextView, nextSettingsView);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setView(nextView);
    setSettingsView(nextSettingsView);
  }

  useEffect(() => {
    function handleHashChange() {
      const { view: v, settingsView: sv } = parseViewFromHash(window.location.hash);
      setView(v);
      setSettingsView(sv);
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // ---- Game session state ----
  const gameId = appData.gameSetup.gameId;
  const online = useNetworkStatus();
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  // ---- In-game UI state ----
  const [period, setPeriod] = useState("Q1" as string);
  const [clockInput, setClockInput] = useState("8:00");
  const [clockRunning, setClockRunning] = useState(false);
  const [dismissedTimeoutId, setDismissedTimeoutId] = useState<string | null>(null);
  const [clockPadOpen, setClockPadOpen] = useState(false);
  const [clockPadDigits, setClockPadDigits] = useState("");

  const [gameMoment, setGameMoment] = useState<string>("");
  const [preGameNotes, setPreGameNotes] = useState<string>(() => localStorage.getItem("operator-console:pregame-notes") ?? "");
  const [modal, setModal] = useState<Modal | null>(null);
  const [chainPrompt, setChainPrompt] = useState<ChainPrompt | null>(null);
  const chainTimerRef = useRef<number | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('ipo:tutorial-complete'));
  const [overtimeCount, setOvertimeCount] = useState(0);
  const [gameDate, setGameDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showGameSummary, setShowGameSummary] = useState(false);
  const [possessionOverrideTeamId, setPossessionOverrideTeamId] = useState<string | null | undefined>(undefined);

  const [submitStatus, setSubmitStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const { inlineNotice, showInlineNotice, dismissInlineNotice } = useInlineNotice();
  const { confirmDialog, requestConfirm, resolveConfirm } = useConfirmDialog();
  const [liveAlerts, setLiveAlerts] = useState<OperatorAlert[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const liveAlertTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setPossessionOverrideTeamId(undefined);
  }, [gameId]);

  const [submitMessage, setSubmitMessage] = useState<string>("Ready to save final stats to the dashboard.");
  const [postGameNameInput, setPostGameNameInput] = useState("");
  const [postGameOpponentInput, setPostGameOpponentInput] = useState("");
  const [postGameDateInput, setPostGameDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [postGameHomeScoreInput, setPostGameHomeScoreInput] = useState("0");
  const [postGameAwayScoreInput, setPostGameAwayScoreInput] = useState("0");

  // ---- Game flow phase ----
  const [gamePhase, setGamePhase] = useState<"pre-game" | "live" | "post-game">(() => {
    const saved = localStorage.getItem("operator-console:phase");
    if (saved === "live" || saved === "post-game" || saved === "pre-game") return saved as "pre-game" | "live" | "post-game";
    // Legacy: if there are already events for this game, land in live view
    return loadPending(loadAppData().gameSetup.gameId).length > 0 ? "live" : "pre-game";
  });

  const [showLineupSetup, setShowLineupSetup] = useState(false);
  const [selectedStarters, setSelectedStarters] = useState<Set<string>>(new Set());
  const [lineupLockedByLiveGame, setLineupLockedByLiveGame] = useState(false);
  const [connectionSyncStatus, setConnectionSyncStatus] = useState(DEFAULT_CONNECTION_SYNC_STATUS);
  const { syncFromCoachCode } = useCoachSync({ appData, setAppData, setConnectionSyncStatus, showInlineNotice });

  useEffect(() => {
    if (gamePhase !== "pre-game") {
      setLineupLockedByLiveGame(false);
      return;
    }

    // Never auto-attach this iPad to a live game unless the same connection
    // code has been explicitly synced from the coach dashboard.
    if (!isConnectionReadyForStart(appData.gameSetup)) {
      setLineupLockedByLiveGame(false);
      return;
    }

    let cancelled = false;

    async function syncActiveGameLockAndLineup() {
      try {
        const response = await fetch(`${appData.gameSetup.apiUrl}/api/games/active/state`, apiHeaders(appData.gameSetup));
        if (cancelled) return;

        if (!response.ok) {
          if (response.status === 404) {
            setLineupLockedByLiveGame(false);
          }
          return;
        }

        const activeState = await response.json() as {
          gameId?: string;
          events?: unknown[];
          activeLineupsByTeam?: Record<string, string[]>;
        };

        const hasLiveEvents = Array.isArray(activeState.events) && activeState.events.length > 0;
        setLineupLockedByLiveGame(hasLiveEvents);

        if (hasLiveEvents && gamePhase === "pre-game") {
          setConnectionSyncStatus("Live game detected from the server. Resuming this game on this iPad.");
          persistPhase("live");
        }

        setAppData((current) => {
          const trackedTeamId = current.gameSetup.vcSide === "away"
            ? (current.gameSetup.myTeamId || "team-away")
            : (current.gameSetup.myTeamId || "team-home");

          const serverLineup = sanitizeLineup(activeState.activeLineupsByTeam?.[trackedTeamId]);
          const currentLineup = sanitizeLineup(current.gameSetup.startingLineup ?? []);

          const team = current.teams.find((entry) => entry.id === current.gameSetup.myTeamId);
          const allowedPlayerIds = new Set((team?.players ?? []).map((player) => player.id));
          const filteredLineup = serverLineup.filter((playerId) => allowedPlayerIds.has(playerId));
          const nextLineup = filteredLineup.length > 0 ? filteredLineup : serverLineup;

          const nextGameId = activeState.gameId?.trim() || current.gameSetup.gameId;
          const lineupChanged = nextLineup.length > 0 && !lineupsEqual(currentLineup, nextLineup);
          const gameIdChanged = nextGameId !== current.gameSetup.gameId;

          if (!lineupChanged && !gameIdChanged) {
            return current;
          }

          const next = {
            ...current,
            gameSetup: {
              ...current.gameSetup,
              gameId: nextGameId,
              startingLineup: lineupChanged ? nextLineup : current.gameSetup.startingLineup,
            },
          };
          saveAppData(next);
          return next;
        });
      } catch {
        // Keep last known lineup lock if network is temporarily unavailable.
      }
    }

    void syncActiveGameLockAndLineup();
    const intervalId = window.setInterval(() => {
      void syncActiveGameLockAndLineup();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [appData.gameSetup, gamePhase]);

  // ---- In-game roster state ----
  const [showRosterPanel, setShowRosterPanel] = useState(true);
  const [activeRosterPlayerId, setActiveRosterPlayerId] = useState<string | null>(null);
  const [showClockAdmin, setShowClockAdmin] = useState(false);

  // Ref for auto-save interval - always holds the latest values without re-registering the interval
  const autoSaveCtx = useRef<{ run: () => void }>({ run: () => {} });

  // Helper to generate team ID from name
  function generateTeamId(name: string): string {
    return `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent"}`;
  }

  function persistPhase(phase: "pre-game" | "live" | "post-game") {
    setGamePhase(phase);
    localStorage.setItem("operator-console:phase", phase);
  }

  function sanitizeLineup(lineup: unknown): string[] {
    if (!Array.isArray(lineup)) return [];
    return [...new Set(lineup.map((id) => String(id).trim()).filter(Boolean))].slice(0, 5);
  }

  function lineupsEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }

  // ---- Derived: home/away teams ----
  // myTeamId is the team we are tracking; side determines which slot they fill.
  const myTeam = appData.teams.find(t => t.id === appData.gameSetup.myTeamId);
  const vcSideSetup = appData.gameSetup.vcSide ?? "home";
  const homeTeam = vcSideSetup === "home" ? myTeam : undefined;
  const awayTeam  = vcSideSetup === "away" ? myTeam : undefined;
  const opponentName = appData.gameSetup.opponent?.trim() || "";
  const opponentTeamId = opponentName ? generateTeamId(opponentName) : "opponent";
  const homeTeamId = vcSideSetup === "home" ? (appData.gameSetup.myTeamId || "team-home") : opponentTeamId;
  const awayTeamId = vcSideSetup === "away" ? (appData.gameSetup.myTeamId || "team-away") : opponentTeamId;
  const vcTeamId = vcSideSetup === "home" ? homeTeamId : awayTeamId;
  const homeTeamName = myTeam && vcSideSetup === "home" ? myTeam.name : opponentName || "Home";
  const awayTeamName  = myTeam && vcSideSetup === "away" ? myTeam.name : opponentName || "Away";
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

  // ---- Game moment options for context (pre-game, quarters, halftime, timeout, end of game) ----
  const liveHomeSideLabel = `${homeTeamName} (home)`;
  const liveAwaySideLabel = `${awayTeamName} (away)`;
  const homePlayers = homeTeam?.players ?? [];
  const awayPlayers = awayTeam?.players ?? [];
  const allPlayers = [...homePlayers, ...awayPlayers];

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

  // ---- Network ----
  useSocket({
    gameId,
    gamePhase,
    gameSetup: appData.gameSetup,
    socketRef,
    setAppData,
    setLiveAlerts,
    setDismissedAlertIds,
    setConnectionSyncStatus,
    persistPhase,
    showInlineNotice,
  });

  useEffect(() => {
    if (liveAlertTimerRef.current !== null) {
      window.clearTimeout(liveAlertTimerRef.current);
      liveAlertTimerRef.current = null;
    }

    const visibleAlerts = liveAlerts.filter((alert) => !dismissedAlertIds.has(alert.id));
    if (visibleAlerts.length === 0) {
      return;
    }

    liveAlertTimerRef.current = window.setTimeout(() => {
      setLiveAlerts([]);
      setDismissedAlertIds(new Set());
      liveAlertTimerRef.current = null;
    }, getOperatorAlertAutoClearMs(visibleAlerts));

    return () => {
      if (liveAlertTimerRef.current !== null) {
        window.clearTimeout(liveAlertTimerRef.current);
        liveAlertTimerRef.current = null;
      }
    };
  }, [dismissedAlertIds, liveAlerts]);

  // ---- Event queue (hook) ----
  const {
    pendingEvents, setPendingEvents,
    submittedEvents, setSubmittedEvents,
    sequence, setSequence,
    postEvent, undoLast,
    flushQueue, reconnectAndResubmit,
    resetTimeline,
  } = useEventQueue({
    gameId,
    gamePhase,
    gameSetup: appData.gameSetup,
    socketRef,
    normalizeEventTeamId,
    showInlineNotice,
    triggerFeedback,
    ensureRealtimeGameExists,
    onHydrateState(statePayload) {
      const trackedTeamId = appData.gameSetup.vcSide === "away"
        ? (appData.gameSetup.myTeamId || "team-away")
        : (appData.gameSetup.myTeamId || "team-home");
      const serverLineup = sanitizeLineup(statePayload.activeLineupsByTeam?.[trackedTeamId]);
      if (serverLineup.length > 0) {
        setAppData((current) => {
          const currentLineup = sanitizeLineup(current.gameSetup.startingLineup ?? []);
          if (lineupsEqual(currentLineup, serverLineup)) {
            return current;
          }
          const nextData = {
            ...current,
            gameSetup: {
              ...current.gameSetup,
              startingLineup: serverLineup,
            },
          };
          saveAppData(nextData);
          return nextData;
        });
      }
      const hasStarted = Array.isArray(statePayload.events) && statePayload.events.length > 0;
      setLineupLockedByLiveGame(hasStarted);
    },
  });

  async function ensureRealtimeGameExists(gid: string): Promise<boolean> {
    const latest = loadAppData();
    const apiUrl = latest.gameSetup.apiUrl?.trim();
    if (!apiUrl || !gid) return false;
    try {
      const res = await fetch(`${apiUrl}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader(latest.gameSetup) },
        body: JSON.stringify(buildRealtimeGameRegistrationPayload(latest.gameSetup, gid, preGameNotes)),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  // ---- Computed values ----
  const allEvents = useMemo(() => [
    ...submittedEvents.map(e => ({ event: e, pending: false })),
    ...pendingEvents.filter(e => !submittedEvents.some(s => s.id === e.id)).map(e => ({ event: e, pending: true })),
  ].sort((a, b) => b.event.sequence - a.event.sequence), [submittedEvents, pendingEvents]);
  // scores and totals include pending events so the UI is always up-to-date offline
  const allEventObjs = useMemo(() => allEvents.map(x => x.event), [allEvents]);
  const scores = useMemo(() => computeScores(allEventObjs, homeTeamId, awayTeamId), [allEventObjs, homeTeamId, awayTeamId]);
  const pTotals = useMemo(() => computePlayerTotals(allEventObjs), [allEventObjs]);
  const homeTeamStats = useMemo(() => computeTeamStats(allEventObjs, homeTeamId), [allEventObjs, homeTeamId]);
  const awayTeamStats = useMemo(() => computeTeamStats(allEventObjs, awayTeamId), [allEventObjs, awayTeamId]);
  const periodTeamFouls = useMemo(() => {
    const totals = { home: 0, away: 0 };
    const inOT = isOvertimePeriod(period);
    for (const event of allEventObjs) {
      if (event.type !== "foul") continue;
      // NFHS OT rule: Q4 fouls carry into OT and all OT-period fouls accumulate.
      const counts = inOT
        ? event.period === "Q4" || isOvertimePeriod(event.period)
        : event.period === period;
      if (!counts) continue;
      if (event.teamId === homeTeamId) totals.home += 1;
      if (event.teamId === awayTeamId) totals.away += 1;
    }
    return totals;
  }, [allEventObjs, period, homeTeamId, awayTeamId]);
  const homeInBonus = periodTeamFouls.away >= 5;
  const awayInBonus = periodTeamFouls.home >= 5;
  const timeoutUsage = useMemo(() => {
    const regulation = {
      home: { full: 0, short: 0 },
      away: { full: 0, short: 0 },
    };
    const overtime = {
      home: { full: 0 },
      away: { full: 0 },
    };
    for (const event of allEventObjs) {
      if (event.type !== "timeout") continue;
      const side = event.teamId === homeTeamId ? "home" : event.teamId === awayTeamId ? "away" : null;
      if (!side) continue;
      if (isOvertimePeriod(event.period)) {
        if (event.timeoutType === "full") overtime[side].full += 1;
      } else {
        regulation[side][event.timeoutType] += 1;
      }
    }
    return { regulation, overtime };
  }, [allEventObjs, homeTeamId, awayTeamId]);
  const inOvertimeNow = isOvertimePeriod(period);
  const timeoutRemaining = useMemo(() => {
    if (inOvertimeNow) {
      return {
        home: {
          full: Math.max(0, 1 - timeoutUsage.overtime.home.full),
          short: 0,
        },
        away: {
          full: Math.max(0, 1 - timeoutUsage.overtime.away.full),
          short: 0,
        },
      };
    }
    return {
      home: {
        full: Math.max(0, 3 - timeoutUsage.regulation.home.full),
        short: Math.max(0, 2 - timeoutUsage.regulation.home.short),
      },
      away: {
        full: Math.max(0, 3 - timeoutUsage.regulation.away.full),
        short: Math.max(0, 2 - timeoutUsage.regulation.away.short),
      },
    };
  }, [inOvertimeNow, timeoutUsage]);
  const totalTimeoutsLeft = {
    home: timeoutRemaining.home.full + timeoutRemaining.home.short,
    away: timeoutRemaining.away.full + timeoutRemaining.away.short,
  };
  const latestEvent = allEvents[0]?.event;

  // When the clock starts while a timeout is the latest event, mark that timeout as dismissed
  // so that pausing the clock again shows "Clock Stopped" rather than reverting to the timeout indicator.
  useEffect(() => {
    if (clockRunning && latestEvent?.type === "timeout") {
      setDismissedTimeoutId(latestEvent.id);
    }
  }, [clockRunning, latestEvent]);
  const currentGameState = useMemo(() => {
    if (gamePhase === "post-game") {
      return { label: "End of Game", tone: "done" as const };
    }
    if (gamePhase === "pre-game") {
      return { label: "Pre-Game", tone: "idle" as const };
    }

    const clockDisabled = appData.gameSetup.clockEnabled === false || trackClock === false;
    if (clockDisabled) {
      return { label: "Clock Disabled", tone: "idle" as const };
    }

    const clockAtZero = clockToSec(clockInput) <= 0;
    if (clockAtZero) {
      if (period === "Q2") return { label: "Halftime", tone: "break" as const };
      if (period === "Q4") return { label: "End of Q4", tone: "break" as const };
      return { label: `End of ${period}`, tone: "break" as const };
    }

    if (!clockRunning && trackTimeouts && latestEvent?.type === "timeout" && latestEvent.id !== dismissedTimeoutId) {
      const teamName = latestEvent.teamId === homeTeamId
        ? homeTeamName
        : latestEvent.teamId === awayTeamId
          ? awayTeamName
          : "Team";
      const timeoutLen = latestEvent.timeoutType === "full" ? "60" : "30";
      return { label: `${teamName} Timeout (${timeoutLen}s)`, tone: "alert" as const };
    }

    if (clockRunning) {
      return { label: "Live", tone: "live" as const };
    }

    return { label: "Clock Stopped", tone: "idle" as const };
  }, [
    allEvents,
    appData.gameSetup.clockEnabled,
    awayTeamId,
    awayTeamName,
    clockInput,
    clockRunning,
    dismissedTimeoutId,
    gamePhase,
    homeTeamId,
    homeTeamName,
    latestEvent,
    period,
    trackClock,
    trackTimeouts,
  ]);
  const eventPossessionTeamId = useMemo(() => {
    const possessionEvent = allEventObjs.find((event) => event.type === "possession_start");
    return possessionEvent?.possessedByTeamId ?? null;
  }, [allEventObjs]);
  const possessionTeamId = possessionOverrideTeamId !== undefined
    ? possessionOverrideTeamId
    : eventPossessionTeamId;
  const possessionLabel = possessionTeamId === homeTeamId
    ? homeTeamName
    : possessionTeamId === awayTeamId
      ? awayTeamName
      : "Not set";
  const foulAlerts = useMemo(() => {
    const vcPl = appData.gameSetup.vcSide === "home" ? homePlayers : awayPlayers;
    return vcPl.filter(p => (pTotals[p.id]?.fouls ?? 0) >= 4);
  }, [appData.gameSetup.vcSide, homePlayers, awayPlayers, pTotals]);
  const trackedPlayers = useMemo(
    () => (vcSideSetup === "home" ? homePlayers : awayPlayers),
    [vcSideSetup, homePlayers, awayPlayers],
  );
  const trackedTopScorer = useMemo(() => {
    let current: { name: string; points: number } | undefined;
    for (const player of trackedPlayers) {
      const points = pTotals[player.id]?.points ?? 0;
      if (!current || points > current.points) {
        current = { name: player.name, points };
      }
    }
    return current;
  }, [trackedPlayers, pTotals]);
  const maxOtInEvents = useMemo(() => {
    return allEventObjs.reduce((maxOt, event) => {
      if (!isOvertimePeriod(event.period)) return maxOt;
      const otNumber = Number.parseInt(event.period.slice(2), 10);
      return Number.isFinite(otNumber) ? Math.max(maxOt, otNumber) : maxOt;
    }, 0);
  }, [allEventObjs]);

  const furthestReachedPeriodOrder = useMemo(() => {
    let maxOrder = getPeriodOrder(period);
    for (const event of allEventObjs) {
      maxOrder = Math.max(maxOrder, getPeriodOrder(event.period));
      if (event.type === "period_transition") {
        maxOrder = Math.max(maxOrder, getPeriodOrder(event.newPeriod));
      }
    }
    return maxOrder;
  }, [allEventObjs, period]);

  // Keep the ref current so the interval always has the latest values
  useEffect(() => {
    autoSaveCtx.current.run = () => {
      if (allEventObjs.length > 0 && appData.gameSetup.opponent?.trim() && navigator.onLine) {
        void submitToDashboard();
      }
    };
  });

  useEffect(() => {
    if (gamePhase !== "post-game") return;
    setPostGameNameInput(appData.gameSetup.gameId || "");
    setPostGameOpponentInput(appData.gameSetup.opponent || "");
    setPostGameDateInput(gameDate);
    setPostGameHomeScoreInput(String(scores.home));
    setPostGameAwayScoreInput(String(scores.away));
  }, [gamePhase, appData.gameSetup.gameId, appData.gameSetup.opponent, gameDate, scores.home, scores.away]);

  const {
    startGame, endAndResetGame, endGame, handleNewGame,
    submitToDashboard, applyPostGameEdits, resetGameStateFor,
    resetFromPostGame, discardFromPostGame, submitGameToRealtimeApi,
  } = useGameFlow({
    appData, setAppData, gameId, gameDate, setGameDate,
    allEventObjs, scores, homeTeam, awayTeam, vcTeamId, vcSideSetup,
    preGameNotes,
    postGameNameInput, postGameOpponentInput, postGameDateInput,
    postGameHomeScoreInput, postGameAwayScoreInput,
    persistData, persistPhase, resetTimeline,
    ensureRealtimeGameExists,
    setSubmitStatus, setSubmitMessage,
    showInlineNotice, requestConfirm,
  });

  // ---- Event builder ----
  function base(seq: number) {
    return {
      id: uid(),
      schoolId: appData.gameSetup.schoolId?.trim() || DEFAULT_SCHOOL_ID,
      gameId,
      sequence: seq,
      timestampIso: new Date().toISOString(),
      period: period as string,
      clockSecondsRemaining: clockToSec(clockInput),
      operatorId,
    };
  }

  // Auto-dismiss chain prompt after 12 seconds
  useEffect(() => {
    if (chainTimerRef.current != null) {
      window.clearTimeout(chainTimerRef.current);
      chainTimerRef.current = null;
    }
    if (chainPrompt) {
      chainTimerRef.current = window.setTimeout(() => {
        setChainPrompt(null);
        chainTimerRef.current = null;
      }, 12000);
    }
    return () => {
      if (chainTimerRef.current != null) {
        window.clearTimeout(chainTimerRef.current);
      }
    };
  }, [chainPrompt]);

  // ---- Modal helpers ----
  function closeModal() { setModal(null); }
  function dismissChain() { setChainPrompt(null); }

  const {
    buildEditModalForEvent, saveEditedEvent, deleteEventRecord,
    openFeedEventEditor, getModalEditContext,
  } = useEventEditor({
    homeTeamId, awayTeamId, gameId,
    apiUrl: appData.gameSetup.apiUrl,
    apiSetup: appData.gameSetup,
    setModal, showInlineNotice, setPendingEvents, setSubmittedEvents,
    normalizeEventTeamId,
  });

  const { changePeriod, deleteOvertimePeriod, addOvertimePeriod } = usePeriodControl({
    period, setPeriod, sequence, base, homeTeamId, postEvent,
    setClockRunning, setClockInput, showInlineNotice, requestConfirm,
    overtimeCount, setOvertimeCount, maxOtInEvents, furthestReachedPeriodOrder,
    pendingEvents, setPendingEvents, submittedEvents, setSubmittedEvents,
    apiUrl: appData.gameSetup.apiUrl,
    apiSetup: appData.gameSetup,
    gameId, setSubmitMessage,
  });

  const {
    autoEmitPossession,
    confirmShot,
    confirmFreeThrow,
    confirmStat,
    confirmAssistScorer,
    confirmAssistPoints,
    confirmSubOut,
    confirmSubIn,
    handlePlayerQuickShot,
    handlePlayerQuickStat,
  } = useGameActions({
    modal, setModal, setChainPrompt, vcSideSetup, opponentSide, sequence,
    possessionTeamId, setPossessionOverrideTeamId, base, resolveTeamId,
    postEvent, saveEditedEvent, isOpponentStatEnabled, setActiveRosterPlayerId,
  });

  function setPossession(side: TeamSide) {
    const teamId = resolveTeamId(side);
    if (possessionTeamId === teamId) {
      const teamName = side === "home" ? homeTeamName : awayTeamName;
      showInlineNotice(`Possession is already set to ${teamName}.`, "warning", 2500);
      return;
    }
    setPossessionOverrideTeamId(teamId);
    void postEvent({
      ...base(sequence),
      teamId,
      type: "possession_start",
      possessedByTeamId: teamId,
    });
  }

  function takeTimeout(side: TeamSide, timeoutType: "full" | "short") {
    const teamId = resolveTeamId(side);
    const bucket = side === "home" ? timeoutRemaining.home : timeoutRemaining.away;
    if (timeoutType === "short" && inOvertimeNow) return;
    if (bucket[timeoutType] <= 0) return;
    void postEvent({
      ...base(sequence),
      teamId,
      type: "timeout",
      timeoutType,
    });
  }

  function handleClockInput(rawValue: string) {
    if (appData.gameSetup.clockEnabled === false) return;
    setClockInput(formatClockFromDigits(rawValue));
  }

  function adjustClock(deltaSeconds: number) {
    if (appData.gameSetup.clockEnabled === false) return;
    setClockInput((current) => formatClockFromSeconds(clockToSec(current) + deltaSeconds));
  }
  function resetClockForPeriod() {
    setClockRunning(false);
    setClockInput(getPeriodDefaultClock(period));
  }


  function renderInlineNotice() {
    if (!inlineNotice) return null;
    return (
      <div className={`inline-notice inline-notice-${inlineNotice.tone}`} role="alert" aria-live="assertive">
        <span>{inlineNotice.message}</span>
        <button className="inline-notice-close" onClick={dismissInlineNotice} aria-label="Dismiss notice">
          Dismiss
        </button>
      </div>
    );
  }

  function renderAlertBanner() {
    const visible = liveAlerts.filter((a) => !dismissedAlertIds.has(a.id));
    if (visible.length === 0) return null;
    const top = visible[0];
    const isUrgent = top.priority === "urgent";
    return (
      <div
        className={`operator-alert-banner operator-alert-banner-${top.priority}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="operator-alert-content">
          <span className={`operator-alert-badge operator-alert-badge-${top.priority}`}>
            {isUrgent ? "URGENT" : "ALERT"}
          </span>
          <span className="operator-alert-message">{top.message}</span>
          {visible.length > 1 && (
            <span className="operator-alert-count">+{visible.length - 1} more</span>
          )}
        </div>
        <button
          className="operator-alert-dismiss"
          onClick={() => setDismissedAlertIds((prev) => new Set([...prev, top.id]))}
          aria-label="Dismiss alert"
        >
          X
        </button>
      </div>
    );
  }

  function renderConfirmDialog() {
    if (!confirmDialog) return null;
    return (
      <div className="modal-overlay" onClick={() => resolveConfirm(false)}>
        <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">{confirmDialog.title}</span>
          </div>
          <div className="confirm-message">{confirmDialog.message}</div>
          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn-cancel" onClick={() => resolveConfirm(false)}>
              {confirmDialog.cancelLabel}
            </button>
            <button
              className={`confirm-btn ${confirmDialog.tone === "danger" ? "confirm-btn-danger" : "confirm-btn-primary"}`}
              onClick={() => resolveConfirm(true)}
            >
              {confirmDialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================================================================
  //  SETTINGS
  // ================================================================
  if (view === "settings") {
    if (settingsView === "ipad-tips") {
      return <IpadTipsPage onBack={() => navigateView("settings", "menu")} />;
    }

    const safeSettingsView: SettingsView = operatorAllowedSettingsViews.has(settingsView)
      ? settingsView
      : "menu";

    return <SettingsScreen
      appData={appData}
      settingsView={safeSettingsView}
      onPersist={persistData}
      onNav={(nextView) => navigateView("settings", operatorAllowedSettingsViews.has(nextView) ? nextView : "menu")}
      onBack={() => navigateView("game")}
      onStartGame={async () => {
        const reset = await endAndResetGame();
        if (reset) {
          navigateView("game");
        }
      }}
    />;
  }

  // ================================================================
  //  GAME VIEW (3-column)
  // ================================================================

  // ---- PRE-GAME SCREEN ----
  if (gamePhase === "pre-game") {
    return (
      <PreGameScreen
        appData={appData}
        myTeam={myTeam}
        opponentName={opponentName}
        connectionSyncStatus={connectionSyncStatus}
        selectedStarters={selectedStarters}
        showLineupSetup={showLineupSetup}
        lineupLockedByLiveGame={lineupLockedByLiveGame}
        onPersist={persistData}
        onSetConnectionSyncStatus={setConnectionSyncStatus}
        onSetSelectedStarters={setSelectedStarters}
        onSetShowLineupSetup={setShowLineupSetup}
        onSyncFromCoachCode={syncFromCoachCode}
        onStartGame={startGame}
        onNavigate={navigateView}
        showInlineNotice={showInlineNotice}
        inlineNoticeNode={renderInlineNotice()}
        confirmDialogNode={renderConfirmDialog()}
      />
    );
  }

  // ---- POST-GAME SCREEN ----
  if (gamePhase === "post-game") {
    return (
      <PostGameScreen
        appData={appData}
        gameId={gameId}
        myTeam={myTeam}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        scores={scores}
        postGameNameInput={postGameNameInput}
        postGameDateInput={postGameDateInput}
        postGameOpponentInput={postGameOpponentInput}
        postGameHomeScoreInput={postGameHomeScoreInput}
        postGameAwayScoreInput={postGameAwayScoreInput}
        submitStatus={submitStatus}
        submitMessage={submitMessage}
        onSetPostGameNameInput={setPostGameNameInput}
        onSetPostGameDateInput={setPostGameDateInput}
        onSetPostGameOpponentInput={setPostGameOpponentInput}
        onSetPostGameHomeScoreInput={setPostGameHomeScoreInput}
        onSetPostGameAwayScoreInput={setPostGameAwayScoreInput}
        onSetSubmitStatus={setSubmitStatus}
        onSetSubmitMessage={setSubmitMessage}
        onApplyPostGameEdits={applyPostGameEdits}
        onSubmitGameToRealtimeApi={submitGameToRealtimeApi}
        onSubmitToDashboard={submitToDashboard}
        onRequestConfirm={requestConfirm}
        onResetFromPostGame={resetFromPostGame}
        onDiscardFromPostGame={discardFromPostGame}
        onHandleNewGame={handleNewGame}
        inlineNoticeNode={renderInlineNotice()}
        confirmDialogNode={renderConfirmDialog()}
      />
    );
  }

  const periodLabels = [
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    ...Array.from({ length: overtimeCount }, (_, index) => `OT${index + 1}`),
  ];
  const liveCoachUrl = buildCoachViewUrl(gameId, {
    connectionId: appData.gameSetup.connectionId,
    myTeamId: appData.gameSetup.myTeamId,
    myTeamName: myTeam?.name,
    opponentName: appData.gameSetup.opponent,
    vcSide: appData.gameSetup.vcSide,
    homeTeamColor: normalizeTeamColor(appData.gameSetup.homeTeamColor) ?? DEFAULT_HOME_TEAM_COLOR,
    awayTeamColor: normalizeTeamColor(appData.gameSetup.awayTeamColor) ?? DEFAULT_AWAY_TEAM_COLOR,
  });

  return (
    <div
      className="game-layout"
      style={{
        ["--team-home-color" as string]: homeTeamColor,
        ["--team-away-color" as string]: awayTeamColor,
      }}
    >
      {showTutorial && <TutorialOverlay onDismiss={() => setShowTutorial(false)} />}
      <button className="help-fab" onClick={() => setShowTutorial(true)} title="Help &amp; Tutorial">?</button>
      {renderInlineNotice()}
      {renderAlertBanner()}
      {renderConfirmDialog()}
      <ModalRouter
        modal={modal}
        team={{
          vcSideSetup,
          opponentSide,
          homeTeamName,
          awayTeamName,
          homeTeamColor,
          awayTeamColor,
          homePlayers,
          awayPlayers,
        }}
        game={{
          allEventObjs,
          pTotals,
          startingLineup: appData.gameSetup.startingLineup ?? [],
          overtimeCount,
          resolveTeamId,
          isOpponentStatEnabled,
        }}
        callbacks={{
          setModal,
          confirmShot,
          confirmFreeThrow,
          confirmStat,
          confirmAssistScorer,
          confirmAssistPoints,
          confirmSubOut,
          confirmSubIn,
          saveEditedEvent,
          deleteEventRecord,
          requestConfirm,
          postEvent,
          base,
          sequence,
        }}
      />
      {!modal && (
        <ChainPromptBar
          chainPrompt={chainPrompt}
          vcSideSetup={vcSideSetup}
          opponentSide={opponentSide}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeTeamColor={homeTeamColor}
          awayTeamColor={awayTeamColor}
          onDismiss={dismissChain}
          setModal={setModal}
        />
      )}
      {showGameSummary && (
        <GameSummaryModal
          onClose={() => setShowGameSummary(false)}
          period={period}
          overtimeCount={overtimeCount}
          clockInput={clockInput}
          setClockInput={setClockInput}
          changePeriod={changePeriod}
          getPeriodOrder={getPeriodOrder}
          gameMoment={gameMoment}
          setGameMoment={setGameMoment}
          vcSideSetup={vcSideSetup}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeTeamAbbr={homeTeamAbbr}
          awayTeamAbbr={awayTeamAbbr}
          scores={scores}
          homeTeamStats={homeTeamStats}
          awayTeamStats={awayTeamStats}
          periodTeamFouls={periodTeamFouls}
          totalTimeoutsLeft={totalTimeoutsLeft}
          trackedPlayers={trackedPlayers}
          trackedTopScorer={trackedTopScorer}
          foulAlerts={foulAlerts}
          pTotals={pTotals}
          allEventObjs={allEventObjs}
          gameSetup={appData.gameSetup}
          gameId={gameId}
          gamePhase={gamePhase}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
        />
      )}
      {(!online || pendingEvents.length > 0) && (
        <button className="offline-badge pending-badge" onClick={() => void reconnectAndResubmit()}>
          {!online
            ? `OFFLINE${pendingEvents.length > 0 ? ` | ${pendingEvents.length} unsaved` : ""} - Tap to reconnect`
            : `${pendingEvents.length} pending upload - Tap to resubmit`}
        </button>
      )}

      {/* LEFT: Scoring */}
      <ScoringPanel
        vcSideSetup={vcSideSetup}
        opponentSide={opponentSide}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        timeoutRemaining={timeoutRemaining}
        inOvertimeNow={inOvertimeNow}
        trackTimeouts={trackTimeouts}
        isOpponentStatEnabled={isOpponentStatEnabled}
        setModal={setModal}
        takeTimeout={takeTimeout}
      />

      {/* CENTER: Feed */}
      <div className="panel center-panel">
        <div className="scoreboard">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.4rem" }}>
            {appData.gameSetup.connectionId && (
              <div className="score-device-id" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }} title="Operator connection status">
                <span>{`Connection: ${appData.gameSetup.connectionId}`}</span>
                <span className={`connection-indicator ${online ? "online" : "offline"}`} title={online ? "Connected" : "Offline - events queued locally"}>
                  *
                </span>
              </div>
            )}
            <div className={`game-state-banner game-state-${currentGameState.tone}`} style={{ margin: 0 }}>
              {currentGameState.label}
            </div>
          </div>
          {(() => {
            const myScoreRow = (
              <div className="scoreboard-team-card scoreboard-team-card-my">
                <div className="score-row">
                  <span className={`team-lbl team-${vcSideSetup}-txt`}>{vcSideSetup === "home" ? homeTeamName : awayTeamName}</span>
                  <span className={`score team-${vcSideSetup}-txt`}>{vcSideSetup === "home" ? scores.home : scores.away}</span>
                </div>
                <div className="score-meta-row">
                  <span className={`score-meta${(vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away) >= 5 ? " foul-count-danger" : (vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away) === 4 ? " foul-count-warn" : ""}`}>
                    Fouls: {vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away}
                  </span>
                  {(vcSideSetup === "home" ? homeInBonus : awayInBonus) && <span className="score-chip bonus-chip">BONUS</span>}
                  {possessionTeamId === (vcSideSetup === "home" ? homeTeamId : awayTeamId) && <span className={`score-chip possession-chip possession-chip-${vcSideSetup}`}>POSS</span>}
                </div>
              </div>
            );
            const oppSide = vcSideSetup === "home" ? "away" : "home";
            const oppScoreRow = (
              <div className="scoreboard-team-card scoreboard-team-card-opp">
                <div className="score-row">
                  <span className={`team-lbl team-${oppSide}-txt`}>{oppSide === "home" ? homeTeamName : awayTeamName}</span>
                  <span className={`score team-${oppSide}-txt`}>{oppSide === "home" ? scores.home : scores.away}</span>
                </div>
                <div className="score-meta-row">
                  <span className={`score-meta${(oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away) >= 5 ? " foul-count-danger" : (oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away) === 4 ? " foul-count-warn" : ""}`}>
                    Fouls: {oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away}
                  </span>
                  {(oppSide === "home" ? homeInBonus : awayInBonus) && <span className="score-chip bonus-chip">BONUS</span>}
                  {possessionTeamId === (oppSide === "home" ? homeTeamId : awayTeamId) && <span className={`score-chip possession-chip possession-chip-${oppSide}`}>POSS</span>}
                </div>
              </div>
            );
            return <div className="scoreboard-team-grid">{myScoreRow}{oppScoreRow}</div>;
          })()}
        </div>

        {foulAlerts.length > 0 && (
          <div className="foul-alerts">
            {foulAlerts.map(p => (
              <div key={p.id} className={`foul-alert ${(pTotals[p.id]?.fouls ?? 0) >= 5 ? "foul-out-alert" : "foul-warn-alert"}`}>
                {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "OUT" : "WARN"} #{p.number} {p.name} - {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "FOULED OUT" : "4 fouls"}
              </div>
            ))}
          </div>
        )}

        <div className="event-feed-header">
          <span className="event-feed-title">Game Log</span>
          <span className="event-feed-hint">Tap an event to edit or delete it</span>
        </div>

        <div className="event-feed">
          {allEvents.length === 0 && <p className="empty-feed">No events yet</p>}
          {allEvents.map(({ event, pending }) => {
            const d = describeEvent(event, homeTeamName, awayTeamName, allPlayers, pTotals, homeTeamId, awayTeamId);
            const eventStamp = `${event.period} ${formatClockFromSeconds(event.clockSecondsRemaining)}`;
            const sectionLabel = getEventSectionLabel(event);
            const teamBucket = getEventTeamBucket(event, homeTeamId, awayTeamId);
            const teamColor = teamBucket === "home" ? homeTeamColor : teamBucket === "away" ? awayTeamColor : undefined;
            const isLast = allEvents[allEvents.length - 1]?.event.id === event.id;
            return (
              <div
                key={event.id}
                className="feed-item-wrapper"
              >
                <button
                  type="button"
                  className={`feed-item feed-item-${teamBucket}${pending ? " feed-pending" : ""}`}
                  style={teamColor ? ({ ["--feed-team-color" as string]: teamColor }) : undefined}
                  onClick={() => openFeedEventEditor({ event, pending })}
                >
                  <span className="feed-stamp">{eventStamp}</span>
                  <span className="feed-main-row">
                    <span className="feed-section-tag">{sectionLabel}</span>
                    <span className={`feed-main ac-${d.accent}`}>{d.main}</span>
                    <span className="feed-item-action">Edit</span>
                  </span>
                  {d.detail && <span className="feed-detail">{d.detail}</span>}
                </button>
                {isLast && (
                  <button
                    className="feed-undo-btn"
                    title="Undo: Quick delete this event"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteEventRecord({ event, pending });
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="period-row">
          {periodLabels.map((lbl) => {
            const isOt = isOvertimePeriod(lbl);
            const isSkip = getPeriodOrder(lbl) > getPeriodOrder(period) + 1;
            return (
              <div key={lbl} className="period-chip">
                <button
                  className={`period-btn${period === lbl ? " period-on" : ""}${isSkip ? " period-btn-skip" : ""}`}
                  disabled={isSkip}
                  onClick={() => { void changePeriod(lbl); }}
                >{lbl}</button>
                {isOt && (
                  <button
                    className="period-delete-btn"
                    title={`Delete ${lbl}`}
                    onClick={async () => {
                      const ok = await requestConfirm({
                        title: `Delete ${lbl}?`,
                        message: "This removes all events in that overtime period.",
                        confirmLabel: `Delete ${lbl}`,
                        tone: "danger",
                      });
                      if (!ok) return;
                      void deleteOvertimePeriod(lbl);
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            );
          })}
          <button
            className="period-add-btn"
            onClick={addOvertimePeriod}
          >
            + OT
          </button>
        </div>
        {trackClock && <div className="clock-row">
          {(appData.gameSetup.clockVisible ?? true) && (
            <>
              <button
                className={`clock-inp clock-inp-display${appData.gameSetup.clockEnabled === false ? " clock-inp-disabled" : ""}`}
                disabled={appData.gameSetup.clockEnabled === false}
                onClick={() => {
                  if (appData.gameSetup.clockEnabled === false) return;
                  setClockPadDigits("");
                  setClockPadOpen(v => !v);
                }}>
                {clockPadOpen ? formatClockFromPadInput(clockPadDigits) : clockInput}
              </button>
              {clockPadOpen && (
                <div className="clock-numpad-overlay" onClick={() => setClockPadOpen(false)}>
                  <div className="clock-numpad" onClick={e => e.stopPropagation()}>
                    <div className="clock-numpad-preview">{formatClockFromPadInput(clockPadDigits)}</div>
                    <div className="clock-numpad-grid">
                      {([1,2,3,4,5,6,7,8,9,".",0,"DEL"] as (number|string)[]).map((k, i) => (
                        <button
                          key={i}
                          className="clock-numpad-key"
                          onClick={() => {
                            if (k === "DEL") {
                              setClockPadDigits(d => d.slice(0, -1));
                            } else if (k === ".") {
                              // only allow one dot, only when no minutes typed (sub-minute)
                              setClockPadDigits(d => {
                                if (d.includes(".")) return d;
                                return d + ".";
                              });
                            } else {
                              setClockPadDigits(d => {
                                const dotIdx = d.indexOf(".");
                                if (dotIdx !== -1) {
                                  // after dot: only 1 tenths digit allowed
                                  if (d.length > dotIdx + 1) return d;
                                  return d + String(k);
                                }
                                // before dot: max 4 digits (MMSS)
                                return (d + String(k)).slice(0, 4);
                              });
                            }
                          }}>
                          {k}
                        </button>
                      ))}
                    </div>
                    <div className="clock-numpad-actions">
                      <button className="clock-numpad-cancel" onClick={() => setClockPadOpen(false)}>Cancel</button>
                      <button className="clock-numpad-set" onClick={() => {
                        const formatted = formatClockFromPadInput(clockPadDigits);
                        setClockInput(formatted);
                        setClockPadOpen(false);
                      }}>Set</button>
                    </div>
                  </div>
                </div>
              )}
              <div className="clock-tools-row clock-tools-row-main">
                <button className={`clock-tool-btn ${clockRunning ? "clock-btn-stop" : "clock-btn-start"}`} onClick={() => setClockRunning((v) => !v)} disabled={appData.gameSetup.clockEnabled === false}>
                  {clockRunning ? "Stop" : "Start"}
                </button>
                <button className="clock-tool-btn clock-btn-reset" onClick={resetClockForPeriod} disabled={appData.gameSetup.clockEnabled === false}>Reset</button>
                <button className="clock-tool-btn clock-btn-minus" onClick={() => adjustClock(-1)} disabled={appData.gameSetup.clockEnabled === false}>-1s</button>
                <button className="clock-tool-btn clock-btn-plus" onClick={() => adjustClock(1)} disabled={appData.gameSetup.clockEnabled === false}>+1s</button>
              </div>
              <div className="clock-admin-row">
                <button className="clock-admin-toggle" onClick={() => setShowClockAdmin(v => !v)}>
                  {showClockAdmin ? "â–² Clock Settings" : "â–¼ Clock Settings"}
                </button>
                {showClockAdmin && (
                  <div className="clock-admin-controls">
                    <button
                      className={`clock-tool-btn clock-btn-visibility${(appData.gameSetup.clockVisible ?? true) ? " active" : ""}`}
                      onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockVisible: !(appData.gameSetup.clockVisible ?? true) } })}>
                      {(appData.gameSetup.clockVisible ?? true) ? "Hide Clock" : "Show Clock"}
                    </button>
                    <button
                      className={`clock-tool-btn clock-btn-enabled${(appData.gameSetup.clockEnabled ?? true) ? " active" : ""}`}
                      onClick={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockEnabled: !(appData.gameSetup.clockEnabled ?? true) } })}>
                      {(appData.gameSetup.clockEnabled ?? true) ? "Disable Clock" : "Enable Clock"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {trackPossession && <div>
            <div className="shot-timeout-title" style={{ marginBottom: "0.3rem" }}>Possession</div>
            <div className="possession-row">
            <button
              className={`possession-btn possession-btn-home ${possessionTeamId === homeTeamId ? "active" : ""}`}
              onClick={() => setPossession("home")}
              title={`Set possession: ${homeTeamName}`}>
              Home: {homeTeamName}
            </button>
            <button
              className={`possession-btn possession-btn-away ${possessionTeamId === awayTeamId ? "active" : ""}`}
              onClick={() => setPossession("away")}
              title={`Set possession: ${awayTeamName}`}>
              Away: {awayTeamName}
            </button>
          </div>
          </div>}
        </div>}
      </div>

      {/* RIGHT: Players + Stats */}
      <RosterPanel
        vcSideSetup={vcSideSetup}
        homePlayers={homePlayers}
        awayPlayers={awayPlayers}
        allEventObjs={allEventObjs}
        vcTeamId={vcTeamId}
        startingLineup={appData.gameSetup.startingLineup ?? []}
        pTotals={pTotals}
        showRosterPanel={showRosterPanel}
        setShowRosterPanel={setShowRosterPanel}
        activeRosterPlayerId={activeRosterPlayerId}
        setActiveRosterPlayerId={setActiveRosterPlayerId}
        setModal={setModal}
        handlePlayerQuickShot={handlePlayerQuickShot}
        handlePlayerQuickStat={handlePlayerQuickStat}
      />

      <div className="live-bottom-nav" role="navigation" aria-label="Live game actions">
        <button className="live-nav-btn live-nav-btn-undo" onClick={() => void undoLast()} title="Undo last event">
          Undo
          {pendingEvents.length > 0 && <span className="nav-pending-badge">{pendingEvents.length}</span>}
        </button>
        <button
          className="live-nav-btn live-nav-btn-secondary"
          title="Game summary"
          onClick={() => {
            setShowGameSummary(true);
          }}>
          Summary
        </button>
        <button className="live-nav-btn live-nav-btn-secondary" onClick={() => navigateView("settings")} title="Settings">Settings</button>
        <button className="live-nav-btn live-nav-btn-end" onClick={() => void endGame()}>
          End Game
        </button>
      </div>
    </div>
  );
}
