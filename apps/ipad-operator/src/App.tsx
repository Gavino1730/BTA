import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InlineNoticeBar, ConfirmDialogOverlay } from "./OperatorOverlays.js";
import { useFeedback, useInlineNotice, useConfirmDialog, useNetworkStatus, useWakeLock, useClockTick, useClockControls, useEventQueue, useCoachSync, useSocket, useGameActions, useEventEditor, usePeriodControl, getPeriodOrder, useGameFlow, DEFAULT_CONNECTION_SYNC_STATUS, useLiveGameDerived, useTeamSetup, useLineupSync } from "./hooks/index.js";
import {
  normalizeTeamColor,
} from "@bta/shared-schema";
import { io } from "socket.io-client";
import {
  DEFAULT_API,
  DEFAULT_HOME_TEAM_COLOR,
  DEFAULT_AWAY_TEAM_COLOR,
  DEFAULT_SCHOOL_ID,
} from "./constants.js";
import type {
  AppData,
  ChainPrompt,
  FeedbackTone,
  Modal,
  OperatorAlert,
} from "./types.js";
import type { SettingsView, TeamSide } from "./types.js";
import {
  getOperatorAlertAutoClearMs,
  defaultZoneForPoints,
} from "./helpers/labels.js";
import {
  clockToSec,
} from "./helpers/clock.js";
import {
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
import { sanitizeLineup, lineupsEqual } from "./helpers/lineup.js";
import {
  AccessBlockedView,
  FinishedGameView,
  PostGameView,
  PreGameView,
  SettingsViewRenderer,
} from "./OperatorPhaseViews.js";
import { LiveGameView } from "./LiveGameView.js";

function parseViewFromHash(hash: string): { view: "game" | "settings"; settingsView: SettingsView } {
  const h = hash.replace(/^#\/?/, "");
  if (h === "settings/game-setup") return { view: "settings", settingsView: "game-setup" };
  if (h === "settings/ipad-tips") return { view: "settings", settingsView: "ipad-tips" };
  if (h === "settings/sound") return { view: "settings", settingsView: "sound" };
  if (h.startsWith("settings")) return { view: "settings", settingsView: "menu" };
  return { view: "game", settingsView: "menu" };
}

function viewToHash(v: "game" | "settings", sv: SettingsView): string {
  if (v === "settings" && sv !== "menu") return `#settings/${sv}`;
  if (v === "settings") return "#settings";
  return "#game";
}

function inferFeedbackToneFromTarget(target: HTMLElement): FeedbackTone {
  const control = target.closest("button, [role='button'], .menu-card, .summary-player-row.clickable") as HTMLElement | null;
  if (!control) {
    return "tap";
  }
  const className = typeof control.className === "string" ? control.className.toLowerCase() : "";
  const text = (control.textContent ?? "").trim().toLowerCase();

  if (className.includes("modal-close") || className.includes("clock-numpad") || className.includes("chain-btn-skip")) {
    return "modal";
  }
  if (
    className.includes("delete") ||
    className.includes("danger") ||
    className.includes("undo") ||
    className.includes("-alert") ||
    /\b(delete|clear|undo|discard|remove|reset)\b/.test(text)
  ) {
    return "danger";
  }
  if (
    className.includes("save") ||
    className.includes("start") ||
    className.includes("confirm") ||
    className.includes("sync") ||
    /\b(save|start|sync|submit|set)\b/.test(text)
  ) {
    return "confirm";
  }
  if (
    className.includes("toggle") ||
    className.includes("tt-btn") ||
    className.includes("tab-btn") ||
    className.includes("period-btn")
  ) {
    return "toggle";
  }
  return "tap";
}

export function App() {
  // ---- App data (teams, game setup) ----
  const [appData, setAppData] = useState<AppData>(loadAppData);
  const { triggerFeedback, unlockFeedbackAudio } = useFeedback({
    enabled: appData.gameSetup.soundEnabled ?? true,
    profile: appData.gameSetup.soundProfile ?? "click",
    volume: appData.gameSetup.soundVolume ?? 70,
    hapticsEnabled: appData.gameSetup.hapticsEnabled ?? true,
  });
  const operatorId = useMemo(() => getOrCreateOperatorId(), []);
  const [accessBlockedMessage, setAccessBlockedMessage] = useState<string | null>(null);

  function persistData(next: AppData) {
    setAppData(next);
    saveAppData(next);
  }

  useEffect(() => {
    let cancelled = false;

    async function checkRoleAccess() {
      const token = appData.gameSetup.apiKey?.trim();
      if (!token) {
        if (!cancelled) {
          setAccessBlockedMessage(null);
        }
        return;
      }

      try {
        const apiUrl = normalizeUrlBase(appData.gameSetup.apiUrl || DEFAULT_API);
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        if (appData.gameSetup.schoolId?.trim()) {
          headers["x-school-id"] = appData.gameSetup.schoolId.trim();
        }
        const response = await fetch(`${apiUrl}/api/auth/session`, { headers });
        if (!response.ok) {
          return;
        }

        const payload = await response.json() as { user?: { role?: string } | null };
        const role = String(payload.user?.role ?? "").trim().toLowerCase();
        if (!cancelled) {
          if (role === "player") {
            setAccessBlockedMessage("Player accounts cannot use the Score Operator app. Use the coach dashboard for read-only views.");
            return;
          }

          setAccessBlockedMessage(null);
        }
      } catch {
        // Best-effort check only.
      }
    }

    void checkRoleAccess();
    return () => {
      cancelled = true;
    };
  }, [appData.gameSetup.apiKey, appData.gameSetup.apiUrl, appData.gameSetup.schoolId]);

  // ---- Navigation state ----
  const [view, setView] = useState<"game" | "settings">(() => parseViewFromHash(window.location.hash).view);
  const [settingsView, setSettingsView] = useState<SettingsView>(() => parseViewFromHash(window.location.hash).settingsView);
  const operatorAllowedSettingsViews = new Set<SettingsView>(["menu", "game-setup", "ipad-tips", "sound"]);

  if (accessBlockedMessage) {
    return <AccessBlockedView message={accessBlockedMessage} />;
  }

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

  useEffect(() => {
    function handleGlobalUiClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const control = target.closest("button, [role='button'], .menu-card, .summary-player-row.clickable") as (HTMLElement & { disabled?: boolean }) | null;
      if (!control || control.disabled) {
        return;
      }
      const tone = inferFeedbackToneFromTarget(target);
      const vibrateMs = tone === "confirm" ? 10 : tone === "danger" ? 14 : tone === "toggle" ? 6 : 0;
      triggerFeedback(tone, vibrateMs);
    }

    document.addEventListener("click", handleGlobalUiClick, true);
    return () => {
      document.removeEventListener("click", handleGlobalUiClick, true);
    };
  }, [triggerFeedback]);

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
  const [gamePhase, setGamePhase] = useState<"pre-game" | "live" | "post-game" | "finished">(() => {
    const saved = localStorage.getItem("operator-console:phase");
    if (saved === "live" || saved === "post-game" || saved === "pre-game" || saved === "finished") {
      return saved as "pre-game" | "live" | "post-game" | "finished";
    }
    // Legacy: if there are already events for this game, land in live view
    return loadPending(loadAppData().gameSetup.gameId).length > 0 ? "live" : "pre-game";
  });

  function persistPhase(phase: "pre-game" | "live" | "post-game" | "finished") {
    setGamePhase(phase);
    localStorage.setItem("operator-console:phase", phase);
  }

  const [showLineupSetup, setShowLineupSetup] = useState(false);
  const [selectedStarters, setSelectedStarters] = useState<Set<string>>(new Set());
  const [lineupLockedByLiveGame, setLineupLockedByLiveGame] = useState(false);
  const [lineupSyncStatus, setLineupSyncStatus] = useState("");
  const [connectionSyncStatus, setConnectionSyncStatus] = useState(DEFAULT_CONNECTION_SYNC_STATUS);
  const [connectedOperatorCount, setConnectedOperatorCount] = useState(0);
  const { syncFromCoachCode } = useCoachSync({ appData, setAppData, setConnectionSyncStatus, showInlineNotice });

  const handleGameSubmitted = useCallback(() => {
    setSubmitStatus("success");
    setSubmitMessage("Game has been submitted. This iPad is now in finished summary mode.");
  }, []);

  useLineupSync({
    gamePhase,
    appData,
    setAppData,
    setLineupLockedByLiveGame,
    setConnectionSyncStatus,
    setLineupSyncStatus,
    persistPhase,
  });

  // ---- Network / Socket ----
  useSocket({
    gameId,
    gamePhase,
    gameSetup: appData.gameSetup,
    socketRef,
    setAppData,
    setLiveAlerts,
    setDismissedAlertIds,
    setConnectionSyncStatus,
    setConnectedOperatorCount,
    persistPhase,
    onGameSubmitted: handleGameSubmitted,
    showInlineNotice,
  });

  // Auto-clear live alerts after their display window
  useEffect(() => {
    if (liveAlertTimerRef.current !== null) {
      window.clearTimeout(liveAlertTimerRef.current);
      liveAlertTimerRef.current = null;
    }
    const visibleAlerts = liveAlerts.filter((alert) => !dismissedAlertIds.has(alert.id));
    if (visibleAlerts.length === 0) { return; }
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

  // ---- Screen wake lock (keep iPad awake during live game) ----
  useWakeLock(gamePhase === "live");

  // ---- In-game roster state ----
  const [showRosterPanel, setShowRosterPanel] = useState(false);
  const [activeRosterPlayerId, setActiveRosterPlayerId] = useState<string | null>(null);
  const [showClockAdmin, setShowClockAdmin] = useState(false);

  // Ref for auto-save interval - always holds the latest values without re-registering the interval


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

  // ---- Clock tick ----
  useClockTick({
    gamePhase,
    clockRunning,
    clockEnabled: appData.gameSetup.clockEnabled ?? true,
    trackClock,
    clockInput,
    setClockInput,
    setClockRunning,
  });

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
    preGameNotes,
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

  const hasSchoolScope = Boolean(appData.gameSetup.schoolId?.trim());
  const hasOfflineQueue = !online && pendingEvents.length > 0;

  function handleQueueSyncPress() {
    if (!hasSchoolScope) {
      showInlineNotice("Waiting for school sync before submitting queued events. Open Settings > Game Setup and connect to coach.", "info", 3200);
      return;
    }
    void reconnectAndResubmit();
  }

  useEffect(() => {
    if (gamePhase !== "post-game" && gamePhase !== "finished") return;
    setPostGameNameInput(appData.gameSetup.gameId || "");
    setPostGameOpponentInput(appData.gameSetup.opponent || "");
    setPostGameDateInput(gameDate);
    setPostGameHomeScoreInput(String(scores.home));
    setPostGameAwayScoreInput(String(scores.away));
  }, [gamePhase, appData.gameSetup.gameId, appData.gameSetup.opponent, gameDate, scores.home, scores.away]);

  const {
    startGame, endAndResetGame, endGame, handleNewGame,
    applyPostGameEdits, resetGameStateFor,
    resetFromPostGame, discardFromPostGame, submitGameToRealtimeApi,
  } = useGameFlow({
    appData, setAppData, gameId, gameDate, setGameDate,
    allEventObjs, scores, homeTeam, awayTeam, vcTeamId, vcSideSetup,
    preGameNotes,
    postGameNameInput, postGameOpponentInput, postGameDateInput,
    postGameHomeScoreInput, postGameAwayScoreInput,
    persistData, persistPhase, resetTimeline,
    setSubmitStatus, setSubmitMessage,
    showInlineNotice, requestConfirm,
  });

  function hardResetOperatorSession() {
    clearOperatorLocalCache();
    window.location.reload();
  }

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
    setPossession,
    takeTimeout,
    confirmShot,
    confirmFreeThrow,
    confirmStat,
    confirmAssistScorer,
    confirmAssistPoints,
    confirmSubOut,
    confirmSubIn,
    handlePlayerQuickShot,
    handlePlayerQuickStat,
    recordTeamRebound,
  } = useGameActions({
    modal, setModal, setChainPrompt, vcSideSetup, opponentSide, sequence,
    possessionTeamId: possessionTeamId ?? "", setPossessionOverrideTeamId, base, resolveTeamId,
    postEvent, saveEditedEvent, isOpponentStatEnabled, setActiveRosterPlayerId,
    showInlineNotice, homeTeamName, awayTeamName, timeoutRemaining, inOvertimeNow,
  });

  const opponentHasRoster = (opponentSide === "home" ? homePlayers : awayPlayers).length > 0;

  const { handleClockInput, adjustClock, resetClockForPeriod } = useClockControls({
    clockEnabled: appData.gameSetup.clockEnabled ?? true,
    period,
    setClockInput,
    setClockRunning,
  });

  // ================================================================
  //  SETTINGS
  // ================================================================
  if (view === "settings") {
    return (
      <SettingsViewRenderer
        settingsView={settingsView}
        operatorAllowedSettingsViews={operatorAllowedSettingsViews}
        appData={appData}
        persistData={persistData}
        navigateView={navigateView}
        endAndResetGame={endAndResetGame}
      />
    );
  }

  // ================================================================
  //  GAME VIEW (3-column)
  // ================================================================

  // ---- PRE-GAME SCREEN ----
  if (gamePhase === "pre-game") {
    return (
      <PreGameView
        appData={appData}
        myTeam={myTeam}
        opponentName={opponentName}
        scoringTeamColor={vcSideSetup === "home" ? homeTeamColor : awayTeamColor}
        opponentTeamColor={opponentSide === "home" ? homeTeamColor : awayTeamColor}
        connectionSyncStatus={connectionSyncStatus}
        lineupSyncStatus={lineupSyncStatus}
        selectedStarters={selectedStarters}
        showLineupSetup={showLineupSetup}
        lineupLockedByLiveGame={lineupLockedByLiveGame}
        persistData={persistData}
        setConnectionSyncStatus={setConnectionSyncStatus}
        setSelectedStarters={setSelectedStarters}
        setShowLineupSetup={setShowLineupSetup}
        syncFromCoachCode={syncFromCoachCode}
        startGame={startGame}
        navigateView={navigateView}
        showInlineNotice={showInlineNotice}
        inlineNoticeNode={<InlineNoticeBar notice={inlineNotice} onDismiss={dismissInlineNotice} />}
        confirmDialogNode={<ConfirmDialogOverlay dialog={confirmDialog} onResolve={resolveConfirm} />}
      />
    );
  }

  // ---- POST-GAME SCREEN ----
  if (gamePhase === "post-game") {
    return (
      <PostGameView
        gameId={gameId}
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
        setPostGameNameInput={setPostGameNameInput}
        setPostGameDateInput={setPostGameDateInput}
        setPostGameOpponentInput={setPostGameOpponentInput}
        setPostGameHomeScoreInput={setPostGameHomeScoreInput}
        setPostGameAwayScoreInput={setPostGameAwayScoreInput}
        setSubmitStatus={setSubmitStatus}
        setSubmitMessage={setSubmitMessage}
        applyPostGameEdits={applyPostGameEdits}
        submitGameToRealtimeApi={submitGameToRealtimeApi}
        requestConfirm={requestConfirm}
        resetFromPostGame={resetFromPostGame}
        discardFromPostGame={discardFromPostGame}
        hardResetOperatorSession={hardResetOperatorSession}
        persistPhase={persistPhase}
        inlineNoticeNode={<InlineNoticeBar notice={inlineNotice} onDismiss={dismissInlineNotice} />}
        confirmDialogNode={<ConfirmDialogOverlay dialog={confirmDialog} onResolve={resolveConfirm} />}
      />
    );
  }

  if (gamePhase === "finished") {
    return (
      <FinishedGameView
        gameId={postGameNameInput || gameId}
        gameDate={postGameDateInput || gameDate}
        opponentName={postGameOpponentInput}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeScore={scores.home}
        awayScore={scores.away}
        submitMessage={submitMessage || "Game has been submitted."}
        hardResetOperatorSession={hardResetOperatorSession}
        inlineNoticeNode={<InlineNoticeBar notice={inlineNotice} onDismiss={dismissInlineNotice} />}
        confirmDialogNode={<ConfirmDialogOverlay dialog={confirmDialog} onResolve={resolveConfirm} />}
      />
    );
  }

  return (
    <LiveGameView
      homeTeamColor={homeTeamColor}
      awayTeamColor={awayTeamColor}
      showTutorial={showTutorial}
      onSetShowTutorial={setShowTutorial}
      inlineNotice={inlineNotice}
      onDismissInlineNotice={dismissInlineNotice}
      liveAlerts={liveAlerts}
      dismissedAlertIds={dismissedAlertIds}
      onDismissAlertId={setDismissedAlertIds}
      confirmDialog={confirmDialog}
      onResolveConfirm={resolveConfirm}
      modal={modal}
      modalTeam={{ vcSideSetup, opponentSide, homeTeamName, awayTeamName, homeTeamColor, awayTeamColor, homePlayers, awayPlayers }}
      modalGame={{ allEventObjs, pTotals, startingLineup: appData.gameSetup.startingLineup ?? [], overtimeCount, resolveTeamId, isOpponentStatEnabled }}
      modalCallbacks={{ setModal, confirmShot, confirmFreeThrow, confirmStat, confirmAssistScorer, confirmAssistPoints, confirmSubOut, confirmSubIn, saveEditedEvent, deleteEventRecord, requestConfirm, postEvent, base, sequence }}
      chainPrompt={chainPrompt}
      opponentHasRoster={opponentHasRoster}
      onDismissChain={dismissChain}
      onSetModal={setModal}
      onRecordTeamRebound={recordTeamRebound}
      showGameSummary={showGameSummary}
      onSetShowGameSummary={setShowGameSummary}
      gameSummary={{
        onPlayerQuickShot: handlePlayerQuickShot,
        onPlayerQuickStat: handlePlayerQuickStat,
        period, overtimeCount, clockInput, setClockInput,
        changePeriod, getPeriodOrder, gameMoment, setGameMoment,
        vcSideSetup, homeTeamName, awayTeamName, homeTeamAbbr, awayTeamAbbr,
        scores, homeTeamStats, awayTeamStats, periodTeamFouls,
        totalTimeoutsLeft, trackedPlayers, trackedTopScorer,
        foulAlerts, pTotals, allEventObjs,
        gameSetup: appData.gameSetup,
        gameId, gamePhase, homeTeamId, awayTeamId,
      }}
      pendingEventsCount={pendingEvents.length}
      hasSchoolScope={hasSchoolScope}
      hasOfflineQueue={hasOfflineQueue}
      online={online}
      onQueueSyncPress={handleQueueSyncPress}
      scoring={{ vcSideSetup, opponentSide, homeTeamName, awayTeamName, timeoutRemaining, inOvertimeNow, trackTimeouts, isOpponentStatEnabled, setModal, takeTimeout }}
      liveCenter={{
        connectionId: appData.gameSetup.connectionId,
        connectedOperatorCount, online, currentGameState,
        vcSideSetup, homeTeamName, awayTeamName, homeTeamColor, awayTeamColor,
        homeTeamId, awayTeamId, scores, periodTeamFouls, homeInBonus, awayInBonus,
        possessionTeamId, allEvents, allPlayers, pTotals, foulAlerts,
        period, overtimeCount, trackClock, trackPossession,
        clockVisible: appData.gameSetup.clockVisible ?? true,
        clockEnabled: appData.gameSetup.clockEnabled ?? true,
        clockInput, clockRunning, clockPadOpen, clockPadDigits, showClockAdmin,
        openFeedEventEditor, deleteEventRecord, changePeriod, addOvertimePeriod,
        deleteOvertimePeriod, getPeriodOrder, requestConfirm, setPossession,
        setClockInput, setClockRunning, setClockPadOpen, setClockPadDigits, setShowClockAdmin,
        resetClockForPeriod, adjustClock,
        onToggleClockVisible: () => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockVisible: !(appData.gameSetup.clockVisible ?? true) } }),
        onToggleClockEnabled: () => persistData({ ...appData, gameSetup: { ...appData.gameSetup, clockEnabled: !(appData.gameSetup.clockEnabled ?? true) } }),
      }}
      roster={{
        vcSideSetup, homePlayers, awayPlayers, allEventObjs, vcTeamId,
        startingLineup: appData.gameSetup.startingLineup ?? [],
        pTotals, showRosterPanel, setShowRosterPanel,
        activeRosterPlayerId, setActiveRosterPlayerId,
        setModal, handlePlayerQuickShot, handlePlayerQuickStat,
      }}
      onUndoLast={() => void undoLast()}
      onEndGame={() => void endGame()}
      onNavigateSettings={() => navigateView("settings")}
    />
  );
}
