import { useEffect, useMemo, useRef, useState } from "react";
import { TutorialOverlay } from "./TutorialOverlay.js";
import { SetupGameCard } from "./SetupGameCard.js";
import { AiTabPanel } from "./AiTabPanel.js";
import { InsightsPanel } from "./InsightsPanel.js";
import { RotationPanel } from "./RotationPanel.js";
import { ScoreboardSection } from "./ScoreboardSection.js";
import { BoxScoreSection } from "./BoxScoreSection.js";
import { LineupUnitPanel } from "./LineupUnitPanel.js";
import { apiBase, apiKeyHeader, generateConnectionCode, normalizeConnectionCode, operatorBase, resolveActiveSchoolId } from "./platform.js";
import { useRosterManager, useCoachAi, useCoachSocket, useGameHydration, useNewGameForm, useBoxScore, useAiCards, useGameTeams, useDisplayHelpers, useGameMemos } from "./hooks/index.js";
import {
  type GameState, type BoxScoreFilter,
  ACTIVE_GAME_KEY,
  type Insight,
} from "./helpers/index.js";

export interface AppConnectionInfo {
  deviceConnected: boolean;
  serverConnected: boolean;
  connectionId: string;
  operatorConsoleUrl: string;
}

interface AppProps {
  onConnectionChange?: (info: AppConnectionInfo) => void;
  showTutorial?: boolean;
  onDismissTutorial?: () => void;
}

export function App({ onConnectionChange, showTutorial = false, onDismissTutorial }: AppProps = {}) {
  const [setupNames, setSetupNames] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      myTeamId: params.get("myTeamId") ?? "",
      myTeamName: params.get("myTeamName") ?? "",
      opponentName: params.get("opponentName") ?? "",
      vcSide: params.get("vcSide") === "away" ? "away" as const : "home" as const,
      homeColor: params.get("homeColor") ?? "",
      awayColor: params.get("awayColor") ?? "",
    };
  });

  const [deviceId, setDeviceId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("deviceId");
    if (fromUrl) {
      localStorage.setItem("coach-bound-device-id", fromUrl);
      return fromUrl;
    }
    return localStorage.getItem("coach-bound-device-id") ?? "device1";
  });
  const [connectionId, setConnectionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeConnectionCode(params.get("connectionId"));
    if (fromUrl) {
      localStorage.setItem("coach-bound-connection-id", fromUrl);
      return fromUrl;
    }
    return normalizeConnectionCode(localStorage.getItem("coach-bound-connection-id")) || generateConnectionCode();
  });

  useEffect(() => {
    const normalizedConnectionId = normalizeConnectionCode(connectionId);
    if (normalizedConnectionId !== connectionId) {
      setConnectionId(normalizedConnectionId || generateConnectionCode());
      return;
    }

    if (!normalizedConnectionId) {
      setConnectionId(generateConnectionCode());
    }
  }, [connectionId]);
  const [gameId, setGameId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    try {
      return params.get("gameId") ?? localStorage.getItem(ACTIVE_GAME_KEY) ?? "";
    } catch {
      return params.get("gameId") ?? "";
    }
  });
  const gameIdRef = useRef(gameId);

  const [state, setState] = useState<GameState | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isEndingGame, setIsEndingGame] = useState(false);
  const [endGameStatus, setEndGameStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const endedGameIdsRef = useRef<Set<string>>(new Set<string>(
    (() => { try { return JSON.parse(localStorage.getItem("coach-ended-game-ids") ?? "[]") as string[]; } catch { return []; } })()
  ));
  const [dashboardStatus, setDashboardStatus] = useState("Waiting for live game data");
  const [activePage, setActivePage] = useState<"live" | "ai">(() => (sessionStorage.getItem("coach:live-tab") as "live" | "ai" | null) ?? "live");
  const [boxScoreFilter, setBoxScoreFilter] = useState<BoxScoreFilter>([]);

  // AI settings, prompt preview, and chat managed by hook
  const {
    isRefreshingAiInsights,
    aiRefreshError,
    aiSettings,
    aiSettingsDraft, setAiSettingsDraft,
    aiSettingsStatus,
    promptPreview,
    promptPreviewStatus,
    aiChatMessages, setAiChatMessages,
    aiChatInput, setAiChatInput,
    aiChatStatus,
    isSendingAiChat,
    aiChatSuggestions, setAiChatSuggestions,
    historicalPromptContext,
    saveAiSettings, loadPromptPreview, sendAiChat, toggleFocusInsight, resetAiState, refreshAiBenchCalls,
  } = useCoachAi({ gameId, setInsights, setDashboardStatus });
  const operatorConsoleUrl = useMemo(() => {
    const params = new URLSearchParams();
    const schoolId = resolveActiveSchoolId();
    if (connectionId) {
      params.set("connectionId", connectionId);
    }
    if (schoolId) params.set("schoolId", schoolId);
    if (gameId) params.set("gameId", gameId);
    if (setupNames.myTeamId) params.set("myTeamId", setupNames.myTeamId);
    if (setupNames.myTeamName) params.set("myTeamName", setupNames.myTeamName);
    if (setupNames.opponentName) params.set("opponent", setupNames.opponentName);
    if (setupNames.vcSide) params.set("vcSide", setupNames.vcSide);
    if (setupNames.homeColor) params.set("homeColor", setupNames.homeColor);
    if (setupNames.awayColor) params.set("awayColor", setupNames.awayColor);
    return `${operatorBase.replace(/\/$/, "")}/?${params.toString()}`;
  }, [connectionId, gameId, setupNames]);

  useEffect(() => {
    onConnectionChange?.({ deviceConnected, serverConnected, connectionId, operatorConsoleUrl });
  }, [deviceConnected, serverConnected, connectionId, operatorConsoleUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    gameIdRef.current = gameId;
    try {
      if (gameId) {
        localStorage.setItem(ACTIVE_GAME_KEY, gameId);
      } else {
        localStorage.removeItem(ACTIVE_GAME_KEY);
      }
    } catch {
      // ignore storage issues
    }
  }, [gameId]);

  useEffect(() => {
    try {
      localStorage.setItem("coach-bound-device-id", deviceId);
    } catch {
      // ignore storage issues
    }
  }, [deviceId]);

  useEffect(() => {
    try {
      if (connectionId) {
        localStorage.setItem("coach-bound-connection-id", connectionId);
      } else {
        localStorage.removeItem("coach-bound-connection-id");
      }
    } catch {
      // ignore storage issues
    }
  }, [connectionId]);


  // Roster state and CRUD managed by hook
  const {
    rosterTeams, setRosterTeams, setRosterTeamsFromRemote,
    expandedTeamId, setExpandedTeamId,
    editingPlayerId, setEditingPlayerId,
    editPlayerDraft, setEditPlayerDraft,
    showNewTeamForm, setShowNewTeamForm,
    newTeamName, setNewTeamName,
    newTeamAbbr, setNewTeamAbbr,
    newTeamColor, setNewTeamColor,
    addingPlayerForTeam, setAddingPlayerForTeam,
    newPlayerNum, setNewPlayerNum,
    newPlayerName, setNewPlayerName,
    newPlayerPos, setNewPlayerPos,
    newPlayerHeight, setNewPlayerHeight,
    newPlayerGrade, setNewPlayerGrade,
    newPlayerRole, setNewPlayerRole,
    newPlayerNotes, setNewPlayerNotes,
    addTeam, removeTeam, updateTeamCoachStyle, updateTeamColor,
    addPlayer, removePlayer, saveEditedPlayer, exportRoster, importRoster,
  } = useRosterManager();

  const {
    newGameOpponent, setNewGameOpponent,
    newGameMyTeamId, setNewGameMyTeamId,
    newGameVcSide, setNewGameVcSide,
    newGameOppColor, setNewGameOppColor,
    newGameStartingLineup, setNewGameStartingLineup,
    isLaunchingGame,
    launchGame,
  } = useNewGameForm({ rosterTeams, endedGameIdsRef, setGameId, setSetupNames, setDashboardStatus });


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    if (params.get("connectionId") !== connectionId) {
      if (connectionId) {
        params.set("connectionId", connectionId);
      } else {
        params.delete("connectionId");
      }
      changed = true;
    }
    if (params.get("gameId") !== gameId) {
      if (gameId) {
        params.set("gameId", gameId);
      } else {
        params.delete("gameId");
      }
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, "", `?${params.toString()}`);
    }
  }, [connectionId, gameId]);

  function clearActiveGame(statusMessage: string): void {
    // Persist the outgoing game ID so reconcileGameId won't restore it on the
    // next page load (endedGameIdsRef is in-memory only; localStorage survives reloads).
    if (gameId) {
      endedGameIdsRef.current.add(gameId);
      try {
        const prev = JSON.parse(localStorage.getItem("coach-ended-game-ids") ?? "[]") as string[];
        const updated = Array.from(new Set([...prev, gameId])).slice(-20);
        localStorage.setItem("coach-ended-game-ids", JSON.stringify(updated));
      } catch {
        // ignore storage issues
      }
    }
    setGameId("");
    setState(null);
    setInsights([]);
    resetAiState();
    setBoxScoreFilter([]);
    setEndGameStatus("");
    setIsLoading(false);
    setActivePage("live");
    setDashboardStatus(statusMessage);
  }

  useCoachSocket({
    connectionId,
    gameIdRef,
    endedGameIdsRef,
    clearActiveGame,
    setGameId,
    setState,
    setServerConnected,
    setDeviceConnected,
    setDashboardStatus,
    setInsights,
    setRosterTeamsFromRemote,
  });

  useGameHydration({
    gameId,
    connectionId,
    endedGameIdsRef,
    clearActiveGame,
    setGameId,
    setState,
    setInsights,
    setDeviceConnected,
    setIsLoading,
    setDashboardStatus,
    setSetupNames,
    resetAiState,
    setBoxScoreFilter,
  });

  async function endGameFromDashboard(): Promise<void> {
    if (!gameId || isEndingGame) {
      return;
    }

    const endingGameId = gameId;
    const shouldEnd = window.confirm("End this game now? This will finalize it and return the dashboard to Start New Game.");
    if (!shouldEnd) {
      return;
    }

    setIsEndingGame(true);
    setEndGameStatus("Ending game...");
    setDashboardStatus("Ending game...");

    try {
      const response = await fetch(`${apiBase}/api/games/${endingGameId}/submit`, {
        method: "POST",
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
        const reason = payload.error ?? payload.message ?? `status ${response.status}`;
        if (response.status === 404) {
          // The dashboard can keep a stale gameId in local/session state after
          // restarts or manual data resets. Treat "not found" as already ended.
          endedGameIdsRef.current.add(endingGameId);
          clearActiveGame("Server no longer has this game. Cleared local session.");
          return;
        }
        const message = response.status === 403
          ? `Could not end game: ${reason}. Your account needs write permissions.`
          : response.status === 401
            ? `Could not end game: ${reason}. Please sign in again.`
            : `Could not end game: ${reason}.`;
        setEndGameStatus(message);
        setDashboardStatus(message);
        return;
      }

      endedGameIdsRef.current.add(endingGameId);
      clearActiveGame("Game ended. Start a new game when ready.");
    } catch {
      const message = "Could not reach realtime API to end game.";
      setEndGameStatus(message);
      setDashboardStatus(message);
    } finally {
      setIsEndingGame(false);
    }
  }

  const { canonicalSideIds, canonicalTeamId, rawTeamIds, aggregatedTeams, teams } = useGameTeams(
    state,
    setupNames,
  );

  const { rosterLabels, playersByTeamId, teamColorById, displayTeamName, displayPlayerName, getScoreboardLineup, prettifyInsightText } = useDisplayHelpers({
    rosterTeams,
    setupNames,
    state,
    teams,
    rawTeamIds,
    aggregatedTeams,
    canonicalTeamId,
    canonicalSideIds,
  });

  const { leadersByTeam, coachedTeamId, lineupUnitStats, rotationContext } = useGameMemos({
    teams,
    aggregatedTeams,
    canonicalTeamId,
    canonicalSideIds,
    state,
    setupNames,
    rosterTeams,
  });
  const aiInsights = useMemo(
    () => insights.filter((insight) => insight.type === "ai_coaching"),
    [insights]
  );

  const rulesInsights = useMemo(
    () => insights.filter((insight) => insight.type !== "ai_coaching"),
    [insights]
  );

  const isOpeningInsightWindow = useMemo(() => {
    if (!state) {
      return false;
    }

    const eventCount = state.events.length;
    return state.currentPeriod === "Q1" && eventCount < 10;
  }, [state]);

  const hasGameStarted = (state?.events.length ?? 0) > 0;

  useEffect(() => {
    if (activePage !== "ai" || !gameId) {
      return;
    }

    if (!promptPreview) {
      void loadPromptPreview();
    }
  }, [activePage, gameId, promptPreview]);

  const { boxScorePeriods, filteredBoxScoreEvents, boxScoreByTeam } = useBoxScore(
    state?.events ?? [],
    boxScoreFilter,
    canonicalTeamId,
    teams,
  );

  const { aiSubSuggestionCards, aiFoulAlertCards, aiEfficiencyCards, aiQuickQuestions } = useAiCards({
    aiInsights,
    rulesInsights,
    rotationContext,
    aggregatedTeams,
    coachedTeamId,
    aiChatSuggestions,
    displayPlayerName,
    prettifyInsightText,
  });

  return (
    <>
      {showTutorial && <TutorialOverlay onDismiss={() => onDismissTutorial?.()} />}
      <div className="page">
        <div className="live-subnav">
          <button className={activePage === "live" ? "nav-active" : ""} onClick={() => { setActivePage("live"); sessionStorage.setItem("coach:live-tab", "live"); }}>Scoreboard</button>
          <button className={activePage === "ai" ? "nav-active" : ""} onClick={() => { setActivePage("ai"); sessionStorage.setItem("coach:live-tab", "ai"); }}>AI Insights</button>
        </div>
        {!gameId && activePage === "ai" && (
          <div className="idle-screen">
            <div className="idle-screen-icon">||</div>
            <p className="idle-screen-title">No Active Game</p>
            <p className="idle-screen-sub">Start a game on the Live tab to enable AI insights.</p>
          </div>
        )}
        {!gameId && activePage === "live" && (
          <SetupGameCard
            rosterTeams={rosterTeams}
            newGameMyTeamId={newGameMyTeamId}
            setNewGameMyTeamId={setNewGameMyTeamId}
            newGameOpponent={newGameOpponent}
            setNewGameOpponent={setNewGameOpponent}
            newGameVcSide={newGameVcSide}
            setNewGameVcSide={setNewGameVcSide}
            newGameOppColor={newGameOppColor}
            setNewGameOppColor={setNewGameOppColor}
            newGameStartingLineup={newGameStartingLineup}
            setNewGameStartingLineup={setNewGameStartingLineup}
            isLaunchingGame={isLaunchingGame}
            launchGame={launchGame}
            dashboardStatus={dashboardStatus}
            connectionId={connectionId}
            setConnectionId={setConnectionId}
          />
        )}
        {gameId && activePage === "live" && (
          <>
            <section className="card settings-section-card">
              <div className="stats-page-card-head">
                <div>
                  <h3>Live Game Controls</h3>
                  <p className="settings-section-desc">Game ID: {gameId}</p>
                </div>
                <div className="settings-header-actions">
                  <button
                    type="button"
                    className="shell-nav-link danger-btn"
                    onClick={() => void endGameFromDashboard()}
                    disabled={isEndingGame}
                  >
                    {isEndingGame ? "Ending..." : "End Game"}
                  </button>
                  <button
                    type="button"
                    className="shell-nav-link"
                    onClick={() => void clearActiveGame("Disconnected.")}
                  >
                    Leave Session
                  </button>
                </div>
              </div>
              {endGameStatus ? <p className="settings-section-desc">{endGameStatus}</p> : null}
            </section>
            <ScoreboardSection
              isLoading={isLoading}
              dashboardStatus={dashboardStatus}
              teams={teams}
              aggregatedTeams={aggregatedTeams}
              canonicalTeamId={canonicalTeamId}
              teamColorById={teamColorById}
              getScoreboardLineup={getScoreboardLineup}
              displayTeamName={displayTeamName}
              displayPlayerName={displayPlayerName}
              leadersByTeam={leadersByTeam}
              canonicalSideIds={canonicalSideIds}
              currentPeriod={state?.currentPeriod}
            />
            <BoxScoreSection
              teams={teams}
              boxScorePeriods={boxScorePeriods}
              boxScoreFilter={boxScoreFilter}
              setBoxScoreFilter={setBoxScoreFilter}
              boxScoreByTeam={boxScoreByTeam}
              currentPeriod={state?.currentPeriod}
              displayTeamName={displayTeamName}
              displayPlayerName={displayPlayerName}
              rosterTeams={rosterTeams}
              canonicalTeamId={canonicalTeamId}
              myTeamId={setupNames.myTeamId}
              vcSide={setupNames.vcSide}
              stateHomeTeamId={state?.homeTeamId}
              stateAwayTeamId={state?.awayTeamId}
            />
            <LineupUnitPanel
              lineupUnitStats={lineupUnitStats}
              coachedTeamId={coachedTeamId}
              displayPlayerName={displayPlayerName}
            />
            <InsightsPanel
              gameId={gameId}
              hasGameStarted={hasGameStarted}
              insightsCount={insights.length}
              aiInsights={aiInsights}
              rulesInsights={rulesInsights}
              aiRefreshError={aiRefreshError}
              isRefreshingAiInsights={isRefreshingAiInsights}
              refreshAiBenchCalls={refreshAiBenchCalls}
              prettifyInsightText={prettifyInsightText}
            />
            <RotationPanel
              rotationContext={rotationContext}
              displayTeamName={displayTeamName}
              displayPlayerName={displayPlayerName}
            />
          </>
        )}
        {gameId && activePage === "ai" && (
          <AiTabPanel
            gameId={gameId}
            isRefreshingAiInsights={isRefreshingAiInsights}
            refreshAiBenchCalls={refreshAiBenchCalls}
            loadPromptPreview={loadPromptPreview}
            aiQuickQuestions={aiQuickQuestions}
            sendAiChat={sendAiChat}
            isSendingAiChat={isSendingAiChat}
            aiChatMessages={aiChatMessages}
            aiChatInput={aiChatInput}
            setAiChatInput={setAiChatInput}
            aiChatStatus={aiChatStatus}
            aiSubSuggestionCards={aiSubSuggestionCards}
            aiFoulAlertCards={aiFoulAlertCards}
            aiEfficiencyCards={aiEfficiencyCards}
            promptPreviewStatus={promptPreviewStatus}
            historicalPromptContext={historicalPromptContext}
          />
        )}
      </div>
    </>
  );
}
