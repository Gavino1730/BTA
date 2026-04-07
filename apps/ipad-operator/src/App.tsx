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
import { LiveCenterPanel } from "./LiveCenterPanel.js";
import { InlineNoticeBar, AlertBanner, ConfirmDialogOverlay } from "./OperatorOverlays.js";
import { useFeedback, useInlineNotice, useConfirmDialog, useNetworkStatus, useWakeLock, useClockTick, useEventQueue, useCoachSync, useSocket, useGameActions, useEventEditor, usePeriodControl, getPeriodOrder, useGameFlow, buildRealtimeGameRegistrationPayload, DEFAULT_CONNECTION_SYNC_STATUS, useLiveGameDerived, useTeamSetup } from "./hooks/index.js";
import {
  getPeriodDefaultClock,
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
  Team,
} from "./types.js";
import type { SettingsView, TeamSide } from "./types.js";
import {
  getOperatorAlertAutoClearMs,
} from "./helpers/labels.js";
import {
  clockToSec,
  formatClockFromDigits,
  formatClockFromSeconds,
} from "./helpers/clock.js";
import {
  apiHeaders,
  apiKeyHeader,
  buildCoachViewUrl,
  generateGameId,
  isConnectionReadyForStart,
  normalizeConnectionId,
  normalizeUrlBase,
} from "./helpers/network.js";
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


  // ---- Team identities ----
  const {
    myTeam, vcSideSetup, homeTeam, awayTeam,
    opponentName, opponentTeamId,
    homeTeamId, awayTeamId, vcTeamId,
    homeTeamName, awayTeamName, homeTeamAbbr, awayTeamAbbr,
    homeTeamColor, awayTeamColor,
    trackClock, trackPossession, trackTimeouts, opponentSide,
    isOpponentStatEnabled,
    homePlayers, awayPlayers, allPlayers,
    resolveTeamId, normalizeEventTeamId,
  } = useTeamSetup(appData);

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
  const {
    allEvents, allEventObjs, scores, pTotals,
    homeTeamStats, awayTeamStats, periodTeamFouls,
    homeInBonus, awayInBonus, timeoutUsage, inOvertimeNow,
    timeoutRemaining, totalTimeoutsLeft, latestEvent,
    currentGameState, eventPossessionTeamId, possessionTeamId,
    possessionLabel, foulAlerts, trackedPlayers, trackedTopScorer,
    maxOtInEvents, furthestReachedPeriodOrder,
  } = useLiveGameDerived({
    submittedEvents, pendingEvents,
    homeTeamId, awayTeamId, homeTeamName, awayTeamName,
    homePlayers, awayPlayers, vcSideSetup,
    period, gamePhase, clockInput, clockRunning,
    trackClock, trackTimeouts, clockEnabled: appData.gameSetup.clockEnabled ?? true,
    dismissedTimeoutId, setDismissedTimeoutId,
    possessionOverrideTeamId,
  });

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
        inlineNoticeNode={<InlineNoticeBar notice={inlineNotice} onDismiss={dismissInlineNotice} />}
        confirmDialogNode={<ConfirmDialogOverlay dialog={confirmDialog} onResolve={resolveConfirm} />}
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
        inlineNoticeNode={<InlineNoticeBar notice={inlineNotice} onDismiss={dismissInlineNotice} />}
        confirmDialogNode={<ConfirmDialogOverlay dialog={confirmDialog} onResolve={resolveConfirm} />}
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
      <InlineNoticeBar notice={inlineNotice} onDismiss={dismissInlineNotice} />
      <AlertBanner alerts={liveAlerts} dismissedIds={dismissedAlertIds} onDismissId={setDismissedAlertIds} />
      <ConfirmDialogOverlay dialog={confirmDialog} onResolve={resolveConfirm} />
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
      <LiveCenterPanel
        connectionId={appData.gameSetup.connectionId}
        online={online}
        currentGameState={currentGameState}
        vcSideSetup={vcSideSetup}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeTeamColor={homeTeamColor}
        awayTeamColor={awayTeamColor}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
        scores={scores}
        periodTeamFouls={periodTeamFouls}
        homeInBonus={homeInBonus}
        awayInBonus={awayInBonus}
        possessionTeamId={possessionTeamId}
        allEvents={allEvents}
        allPlayers={allPlayers}
        pTotals={pTotals}
        foulAlerts={foulAlerts}
        period={period}
        overtimeCount={overtimeCount}
        trackClock={trackClock}
        trackPossession={trackPossession}
        clockVisible={appData.gameSetup.clockVisible ?? true}
        clockEnabled={appData.gameSetup.clockEnabled ?? true}
        clockInput={clockInput}
        clockRunning={clockRunning}
        clockPadOpen={clockPadOpen}
        clockPadDigits={clockPadDigits}
        showClockAdmin={showClockAdmin}
        openFeedEventEditor={openFeedEventEditor}
        deleteEventRecord={deleteEventRecord}
        changePeriod={changePeriod}
        addOvertimePeriod={addOvertimePeriod}
        deleteOvertimePeriod={deleteOvertimePeriod}
        getPeriodOrder={getPeriodOrder}
        requestConfirm={requestConfirm}
        setPossession={setPossession}
        setClockInput={setClockInput}
        setClockRunning={setClockRunning}
        setClockPadOpen={setClockPadOpen}
        setClockPadDigits={setClockPadDigits}
        setShowClockAdmin={setShowClockAdmin}
        resetClockForPeriod={resetClockForPeriod}
        adjustClock={adjustClock}
        onToggleClockVisible={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockVisible: !(appData.gameSetup.clockVisible ?? true) } })}
        onToggleClockEnabled={() => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockEnabled: !(appData.gameSetup.clockEnabled ?? true) } })}
      />

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
