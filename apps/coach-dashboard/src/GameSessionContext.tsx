import { type Dispatch, type SetStateAction, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  apiBase, apiKeyHeader, generateConnectionCode, normalizeConnectionCode,
  operatorBase, resolveActiveSchoolId,
} from "./platform.js";
import {
  useRosterManager, useCoachAi, useCoachSocket, useGameHydration,
  useNewGameForm, useBoxScore, useAiCards, useGameTeams, useDisplayHelpers,
  useGameMemos, useEndGame,
  type AggregatedTeam, type CanonicalSideIds, type RotationContext, type RosterLabels,
} from "./hooks/index.js";
import {
  type GameState, type BoxScoreFilter, type Insight,
  ACTIVE_GAME_KEY,
} from "./helpers/index.js";
import type {
  RosterPlayer, RosterTeam,
  AiChatMessage, CoachAiSettings, AiPromptPreview, AiSignalCard,
  BoxScoreTeamTotals, BoxScorePlayerLine,
  CoachInsightFocus,
} from "./helpers/index.js";
import type { LineupUnitStats } from "@bta/game-state";
import type { PlayerStats } from "@bta/game-state";

export interface AppConnectionInfo {
  deviceConnected: boolean;
  serverConnected: boolean;
  connectionId: string;
  operatorConsoleUrl: string;
}

export interface ConnectedOperatorInfo {
  deviceId: string | null;
  deviceName: string | null;
  gameId: string | null;
  lastSeenIso: string | null;
  connectedAtIso: string | null;
}

interface SetupNames {
  myTeamId: string;
  myTeamName: string;
  opponentName: string;
  vcSide: "home" | "away";
  homeColor: string;
  awayColor: string;
}

// Everything callers may need from the session
export interface GameSession {
  // Connection
  connectionId: string;
  setConnectionId: (id: string) => void;
  deviceId: string;
  operatorConsoleUrl: string;

  // Game identity
  gameId: string;
  setupNames: SetupNames;

  // Game data
  state: GameState | null;
  insights: Insight[];
  isLoading: boolean;
  serverConnected: boolean;
  deviceConnected: boolean;
  connectedOperatorCount: number;
  connectedOperators: ConnectedOperatorInfo[];
  dashboardStatus: string;

  // UI
  activePage: "live" | "ai";
  setActivePage: (page: "live" | "ai") => void;
  boxScoreFilter: BoxScoreFilter;
  setBoxScoreFilter: Dispatch<SetStateAction<BoxScoreFilter>>;

  // Actions
  clearActiveGame: (statusMessage: string) => void;

  // Roster
  rosterTeams: RosterTeam[];
  setRosterTeams: (teams: RosterTeam[]) => void;
  expandedTeamId: string | null;
  setExpandedTeamId: (id: string | null) => void;
  editingPlayerId: string | null;
  setEditingPlayerId: (id: string | null) => void;
  editPlayerDraft: RosterPlayer | null;
  setEditPlayerDraft: (draft: RosterPlayer | null) => void;
  showNewTeamForm: boolean;
  setShowNewTeamForm: (show: boolean) => void;
  newTeamName: string;
  setNewTeamName: (name: string) => void;
  newTeamAbbr: string;
  setNewTeamAbbr: (abbr: string) => void;
  newTeamColor: string;
  setNewTeamColor: (color: string) => void;
  addingPlayerForTeam: string | null;
  setAddingPlayerForTeam: (id: string | null) => void;
  newPlayerNum: string;
  setNewPlayerNum: (num: string) => void;
  newPlayerName: string;
  setNewPlayerName: (name: string) => void;
  newPlayerPos: string;
  setNewPlayerPos: (pos: string) => void;
  newPlayerHeight: string;
  setNewPlayerHeight: (h: string) => void;
  newPlayerGrade: string;
  setNewPlayerGrade: (g: string) => void;
  newPlayerRole: string;
  setNewPlayerRole: (r: string) => void;
  newPlayerNotes: string;
  setNewPlayerNotes: (n: string) => void;
  addTeam: () => void;
  removeTeam: (id: string) => void;
  updateTeamCoachStyle: (teamId: string, style: string) => void;
  updateTeamColor: (teamId: string, color: string) => void;
  addPlayer: (teamId: string) => void;
  removePlayer: (teamId: string, playerId: string) => void;
  saveEditedPlayer: (teamId: string) => void;
  exportRoster: () => void;
  importRoster: (file: File) => void;

  // New game form
  newGameOpponent: string;
  setNewGameOpponent: (v: string) => void;
  newGameMyTeamId: string;
  setNewGameMyTeamId: (v: string) => void;
  newGameVcSide: "home" | "away";
  setNewGameVcSide: (v: "home" | "away") => void;
  newGameOppColor: string;
  setNewGameOppColor: (v: string) => void;
  newGameStartingLineup: string[];
  setNewGameStartingLineup: Dispatch<SetStateAction<string[]>>;
  isLaunchingGame: boolean;
  launchGame: () => Promise<void>;

  // End game
  isEndingGame: boolean;
  isEndGamePromptOpen: boolean;
  endGameStatus: string;
  requestEndGameFromDashboard: () => void;
  cancelEndGamePrompt: () => void;
  discardGameFromDashboard: () => Promise<void>;
  endGameFromDashboard: () => Promise<void>;

  // AI
  isRefreshingAiInsights: boolean;
  aiRefreshError: string;
  aiSettings: CoachAiSettings;
  aiSettingsDraft: CoachAiSettings;
  setAiSettingsDraft: (s: CoachAiSettings) => void;
  aiSettingsStatus: string;
  promptPreview: AiPromptPreview | null;
  promptPreviewStatus: string;
  aiChatMessages: AiChatMessage[];
  setAiChatMessages: (msgs: AiChatMessage[]) => void;
  aiChatInput: string;
  setAiChatInput: (v: string) => void;
  aiChatStatus: string;
  isSendingAiChat: boolean;
  aiChatSuggestions: string[];
  setAiChatSuggestions: (v: string[]) => void;
  historicalPromptContext: string;
  saveAiSettings: () => Promise<void>;
  loadPromptPreview: () => Promise<void>;
  sendAiChat: (questionOverride?: string) => Promise<void>;
  toggleFocusInsight: (focus: CoachInsightFocus) => void;
  refreshAiBenchCalls: () => Promise<void>;

  // Derived game data
  canonicalSideIds: CanonicalSideIds;
  canonicalTeamId: (id: string) => string;
  rawTeamIds: string[];
  aggregatedTeams: Record<string, AggregatedTeam>;
  teams: string[];
  rosterLabels: RosterLabels;
  playersByTeamId: Record<string, RosterPlayer[]>;
  teamColorById: Record<string, string>;
  displayTeamName: (teamId: string) => string;
  displayPlayerName: (teamId: string, playerId: string) => string;
  getScoreboardLineup: (teamId: string) => { playerIds: string[]; isEstimated: boolean };
  prettifyInsightText: (text: string, relatedTeamId?: string | null, relatedPlayerId?: string | null) => string;
  leadersByTeam: Record<string, { scoringLeader?: PlayerStats; foulLeader?: PlayerStats }>;
  coachedTeamId: string;
  lineupUnitStats: LineupUnitStats[] | null;
  rotationContext: RotationContext | null;
  aiInsights: Insight[];
  rulesInsights: Insight[];
  hasGameStarted: boolean;
  boxScorePeriods: string[];
  filteredBoxScoreEvents: GameState["events"];
  boxScoreByTeam: Record<string, { totals: BoxScoreTeamTotals; players: Record<string, BoxScorePlayerLine> }>;
  aiSubSuggestionCards: AiSignalCard[];
  aiFoulAlertCards: AiSignalCard[];
  aiEfficiencyCards: AiSignalCard[];
  aiQuickQuestions: string[];
}

const GameSessionContext = createContext<GameSession | null>(null);

export function useGameSession(): GameSession {
  const ctx = useContext(GameSessionContext);
  if (!ctx) {
    throw new Error("useGameSession must be used inside <GameSessionProvider>");
  }
  return ctx;
}

interface GameSessionProviderProps {
  children: React.ReactNode;
  onConnectionChange?: (info: AppConnectionInfo) => void;
}

export function GameSessionProvider({ children, onConnectionChange }: GameSessionProviderProps) {
  const [setupNames, setSetupNames] = useState<SetupNames>(() => {
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
  const [isLoading, setIsLoading] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [connectedOperatorCount, setConnectedOperatorCount] = useState(0);
  const [connectedOperators, setConnectedOperators] = useState<ConnectedOperatorInfo[]>([]);
  const endedGameIdsRef = useRef<Set<string>>(new Set<string>(
    (() => { try { return JSON.parse(localStorage.getItem("coach-ended-game-ids") ?? "[]") as string[]; } catch { return []; } })()
  ));
  const [dashboardStatus, setDashboardStatus] = useState("Waiting for live game data");
  const [activePage, setActivePageState] = useState<"live" | "ai">(
    () => (sessionStorage.getItem("coach:live-tab") as "live" | "ai" | null) ?? "live"
  );
  const [boxScoreFilter, setBoxScoreFilter] = useState<BoxScoreFilter>([]);

  const setActivePage = useCallback((page: "live" | "ai") => {
    setActivePageState(page);
    sessionStorage.setItem("coach:live-tab", page);
  }, []);

  // AI hook
  const {
    isRefreshingAiInsights, aiRefreshError,
    aiSettings, aiSettingsDraft, setAiSettingsDraft, aiSettingsStatus,
    promptPreview, promptPreviewStatus,
    aiChatMessages, setAiChatMessages, aiChatInput, setAiChatInput,
    aiChatStatus, isSendingAiChat, aiChatSuggestions, setAiChatSuggestions,
    historicalPromptContext,
    saveAiSettings, loadPromptPreview, sendAiChat, toggleFocusInsight, resetAiState, refreshAiBenchCalls,
  } = useCoachAi({ gameId, setInsights, setDashboardStatus });

  const operatorConsoleUrl = useMemo(() => {
    const params = new URLSearchParams();
    const schoolId = resolveActiveSchoolId();
    if (connectionId) params.set("connectionId", connectionId);
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
    } catch { /* ignore storage issues */ }
  }, [gameId]);

  useEffect(() => {
    try { localStorage.setItem("coach-bound-device-id", deviceId); } catch { /* ignore */ }
  }, [deviceId]);

  useEffect(() => {
    try {
      if (connectionId) {
        localStorage.setItem("coach-bound-connection-id", connectionId);
      } else {
        localStorage.removeItem("coach-bound-connection-id");
      }
    } catch { /* ignore */ }
  }, [connectionId]);

  // Roster hook
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

  // New game form hook
  const {
    newGameOpponent, setNewGameOpponent,
    newGameMyTeamId, setNewGameMyTeamId,
    newGameVcSide, setNewGameVcSide,
    newGameOppColor, setNewGameOppColor,
    newGameStartingLineup, setNewGameStartingLineup,
    isLaunchingGame, launchGame, resetForm: resetNewGameForm,
  } = useNewGameForm({ rosterTeams, endedGameIdsRef, connectionId, setGameId, setSetupNames, setDashboardStatus });

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    if (params.get("connectionId") !== connectionId) {
      if (connectionId) { params.set("connectionId", connectionId); } else { params.delete("connectionId"); }
      changed = true;
    }
    if (params.get("gameId") !== gameId) {
      if (gameId) { params.set("gameId", gameId); } else { params.delete("gameId"); }
      changed = true;
    }
    if (changed) {
      window.history.replaceState({}, "", `?${params.toString()}`);
    }
  }, [connectionId, gameId]);

  const clearActiveGame = useCallback((statusMessage: string): void => {
    if (gameId) {
      endedGameIdsRef.current.add(gameId);
      try {
        const prev = JSON.parse(localStorage.getItem("coach-ended-game-ids") ?? "[]") as string[];
        const updated = Array.from(new Set([...prev, gameId])).slice(-20);
        localStorage.setItem("coach-ended-game-ids", JSON.stringify(updated));
      } catch { /* ignore */ }
    }
    setGameId("");
    setState(null);
    setInsights([]);
    resetAiState();
    resetNewGameForm();
    setBoxScoreFilter([]);
    setIsLoading(false);
    setActivePageState("live");
    sessionStorage.setItem("coach:live-tab", "live");
    setDashboardStatus(statusMessage);
  }, [gameId, resetAiState, resetNewGameForm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket hook
  useCoachSocket({
    connectionId, gameIdRef, endedGameIdsRef, clearActiveGame,
    setGameId, setState, setServerConnected, setDeviceConnected,
    setConnectedOperatorCount, setConnectedOperators,
    setDashboardStatus, setInsights, setRosterTeamsFromRemote,
  });

  // Hydration hook
  useGameHydration({
    gameId, connectionId, endedGameIdsRef, clearActiveGame,
    setGameId, setState, setInsights, setDeviceConnected,
    setIsLoading, setDashboardStatus, setSetupNames, resetAiState, setBoxScoreFilter,
  });

  // End game hook
  const {
    isEndingGame,
    isEndGamePromptOpen,
    endGameStatus,
    requestEndGameFromDashboard,
    cancelEndGamePrompt,
    discardGameFromDashboard,
    endGameFromDashboard,
  } = useEndGame({
    gameId, endedGameIdsRef, clearActiveGame, setDashboardStatus,
  });

  // Derived game data
  const { canonicalSideIds, canonicalTeamId, rawTeamIds, aggregatedTeams, teams } = useGameTeams(state, setupNames);

  const {
    rosterLabels, playersByTeamId, teamColorById,
    displayTeamName, displayPlayerName, getScoreboardLineup, prettifyInsightText,
  } = useDisplayHelpers({
    rosterTeams, setupNames, state, teams, rawTeamIds,
    aggregatedTeams, canonicalTeamId, canonicalSideIds,
  });

  const { leadersByTeam, coachedTeamId, lineupUnitStats, rotationContext } = useGameMemos({
    teams, aggregatedTeams, canonicalTeamId, canonicalSideIds, state, setupNames, rosterTeams,
  });

  const aiInsights = useMemo(
    () => insights.filter((insight) => insight.type === "ai_coaching"),
    [insights]
  );
  const rulesInsights = useMemo(
    () => insights.filter((insight) => insight.type !== "ai_coaching"),
    [insights]
  );
  const hasGameStarted = (state?.events.length ?? 0) > 0;

  // Load prompt preview when switching to AI tab
  useEffect(() => {
    if (activePage !== "ai" || !gameId) return;
    if (!promptPreview) void loadPromptPreview();
  }, [activePage, gameId, promptPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  const { boxScorePeriods, filteredBoxScoreEvents, boxScoreByTeam } = useBoxScore(
    state?.events ?? [], boxScoreFilter, canonicalTeamId, teams,
  );

  const { aiSubSuggestionCards, aiFoulAlertCards, aiEfficiencyCards, aiQuickQuestions } = useAiCards({
    aiInsights, rulesInsights, rotationContext, aggregatedTeams, coachedTeamId,
    aiChatSuggestions, displayPlayerName, prettifyInsightText,
  });

  const value: GameSession = {
    // Connection
    connectionId, setConnectionId, deviceId, operatorConsoleUrl,
    // Game identity
    gameId, setupNames,
    // Game data
    state, insights, isLoading, serverConnected, deviceConnected,
    connectedOperatorCount, connectedOperators, dashboardStatus,
    // UI
    activePage, setActivePage, boxScoreFilter, setBoxScoreFilter,
    // Actions
    clearActiveGame,
    // Roster
    rosterTeams, setRosterTeams, expandedTeamId, setExpandedTeamId,
    editingPlayerId, setEditingPlayerId, editPlayerDraft, setEditPlayerDraft,
    showNewTeamForm, setShowNewTeamForm, newTeamName, setNewTeamName,
    newTeamAbbr, setNewTeamAbbr, newTeamColor, setNewTeamColor,
    addingPlayerForTeam, setAddingPlayerForTeam,
    newPlayerNum, setNewPlayerNum, newPlayerName, setNewPlayerName,
    newPlayerPos, setNewPlayerPos, newPlayerHeight, setNewPlayerHeight,
    newPlayerGrade, setNewPlayerGrade, newPlayerRole, setNewPlayerRole,
    newPlayerNotes, setNewPlayerNotes,
    addTeam, removeTeam, updateTeamCoachStyle, updateTeamColor,
    addPlayer, removePlayer, saveEditedPlayer, exportRoster, importRoster,
    // New game form
    newGameOpponent, setNewGameOpponent, newGameMyTeamId, setNewGameMyTeamId,
    newGameVcSide, setNewGameVcSide, newGameOppColor, setNewGameOppColor,
    newGameStartingLineup, setNewGameStartingLineup, isLaunchingGame, launchGame,
    // End game
    isEndingGame,
    isEndGamePromptOpen,
    endGameStatus,
    requestEndGameFromDashboard,
    cancelEndGamePrompt,
    discardGameFromDashboard,
    endGameFromDashboard,
    // AI
    isRefreshingAiInsights, aiRefreshError, aiSettings,
    aiSettingsDraft, setAiSettingsDraft, aiSettingsStatus,
    promptPreview, promptPreviewStatus,
    aiChatMessages, setAiChatMessages, aiChatInput, setAiChatInput,
    aiChatStatus, isSendingAiChat, aiChatSuggestions, setAiChatSuggestions,
    historicalPromptContext,
    saveAiSettings, loadPromptPreview, sendAiChat, toggleFocusInsight, refreshAiBenchCalls,
    // Derived
    canonicalSideIds, canonicalTeamId, rawTeamIds, aggregatedTeams, teams,
    rosterLabels, playersByTeamId, teamColorById,
    displayTeamName, displayPlayerName, getScoreboardLineup, prettifyInsightText,
    leadersByTeam, coachedTeamId, lineupUnitStats, rotationContext,
    aiInsights, rulesInsights, hasGameStarted,
    boxScorePeriods, filteredBoxScoreEvents, boxScoreByTeam,
    aiSubSuggestionCards, aiFoulAlertCards, aiEfficiencyCards, aiQuickQuestions,
  };

  return (
    <GameSessionContext.Provider value={value}>
      {children}
    </GameSessionContext.Provider>
  );
}
