import type { ReactNode } from "react";
import { normalizeConnectionId, isConnectionReadyForStart } from "./helpers/network.js";
import { DEFAULT_CONNECTION_SYNC_STATUS } from "./hooks/index.js";
import type { AppData, Team, SettingsView } from "./types.js";

export interface PreGameScreenProps {
  appData: AppData;
  myTeam: Team | undefined;
  opponentName: string;
  connectionSyncStatus: string;
  lineupSyncStatus: string;
  selectedStarters: Set<string>;
  showLineupSetup: boolean;
  lineupLockedByLiveGame: boolean;
  onPersist: (next: AppData) => void;
  onSetConnectionSyncStatus: (status: string) => void;
  onSetSelectedStarters: (next: Set<string>) => void;
  onSetShowLineupSetup: (open: boolean) => void;
  onSyncFromCoachCode: (code?: string, opts?: { silent: boolean }) => void;
  onStartGame: () => Promise<void>;
  onNavigate: (view: "settings", sub: SettingsView) => void;
  showInlineNotice: (msg: string, tone: "success" | "warning" | "error", ms?: number) => void;
  inlineNoticeNode: ReactNode;
  confirmDialogNode: ReactNode;
}

export function PreGameScreen({
  appData,
  myTeam,
  opponentName,
  connectionSyncStatus,
  lineupSyncStatus,
  selectedStarters,
  showLineupSetup,
  lineupLockedByLiveGame,
  onPersist,
  onSetConnectionSyncStatus,
  onSetSelectedStarters,
  onSetShowLineupSetup,
  onSyncFromCoachCode,
  onStartGame,
  onNavigate,
  showInlineNotice,
  inlineNoticeNode,
  confirmDialogNode,
}: PreGameScreenProps) {
  const savedLineup = appData.gameSetup.startingLineup ?? [];
  const lineupIsSet = savedLineup.length > 0;
  const hasConnectionId = !!normalizeConnectionId(appData.gameSetup.connectionId);
  const hasSyncedConnection = isConnectionReadyForStart(appData.gameSetup);
  const canStart = hasSyncedConnection && !!appData.gameSetup.myTeamId;
  const lineupLockedMessage = lineupLockedByLiveGame
    ? "Lineup is locked because this game is already live on another device."
    : "";
  const myTeamDisplay = myTeam?.name ?? null;

  const handleStarterToggle = (playerId: string) => {
    const next = new Set(selectedStarters);
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      if (next.size >= 5) return;
      next.add(playerId);
    }
    onSetSelectedStarters(next);
  };

  const handleSaveLineup = () => {
    if (lineupLockedByLiveGame) {
      showInlineNotice("Lineup is locked. This game has already started.", "warning", 4000);
      return;
    }
    onPersist({
      ...appData,
      gameSetup: {
        ...appData.gameSetup,
        startingLineup: Array.from(selectedStarters),
      },
    });
    onSetShowLineupSetup(false);
  };

  return (
    <div className="pregame-screen">
      {inlineNoticeNode}
      {confirmDialogNode}
      <div className="pregame-card">
        <div className="pregame-header">
          <span className="pregame-eyebrow">Operator Console</span>
          <h1 className="pregame-title">Ready to Track</h1>
        </div>

        <div className="pregame-device-id">
          <div className="pregame-device-field">
            <label className="pregame-device-label">Connection Code</label>
            <input
              className="pregame-device-input"
              value={appData.gameSetup.connectionId ?? ""}
              onChange={(event) => {
                const nextConnectionId = normalizeConnectionId(event.target.value);
                const nextConnectionChanged = nextConnectionId !== normalizeConnectionId(appData.gameSetup.connectionId);
                onSetConnectionSyncStatus(nextConnectionId
                  ? `Connection code ${nextConnectionId} saved locally. Syncing coach setup...`
                  : DEFAULT_CONNECTION_SYNC_STATUS);
                onPersist({
                  ...appData,
                  gameSetup: {
                    ...appData.gameSetup,
                    connectionId: nextConnectionId || undefined,
                    syncedConnectionId: nextConnectionChanged ? undefined : appData.gameSetup.syncedConnectionId,
                    myTeamId: nextConnectionChanged ? "" : appData.gameSetup.myTeamId,
                    opponent: nextConnectionChanged ? "" : appData.gameSetup.opponent,
                    startingLineup: nextConnectionChanged ? [] : appData.gameSetup.startingLineup,
                  },
                });
              }}
              placeholder="Enter 6-digit coach code"
              aria-label="Connection code"
            />
          </div>
          <button
            type="button"
            className="pregame-device-copy-btn"
            onClick={() => {
              onSyncFromCoachCode(undefined, { silent: false });
            }}
            title="Pull roster and game setup from the coach dashboard"
          >
            Sync Now
          </button>
        </div>
        <p className="pregame-settings-hint">{connectionSyncStatus}</p>
        {lineupSyncStatus && (
          <p className="pregame-error">{lineupSyncStatus}</p>
        )}

        <div className="pregame-opponent-row">
          <div className="pregame-team my-team">
            {myTeamDisplay ?? <span className="pregame-no-team">No team</span>}
          </div>
          <div className="pregame-vs">vs</div>
          <div className="pregame-team opp-team">
            {opponentName
              ? <span>{opponentName}</span>
              : <span className="pregame-no-team">Opponent TBD</span>}
          </div>
        </div>

        {!hasConnectionId && (
          <p className="pregame-error">Enter the coach connection code above to sync your team and game setup.</p>
        )}

        {myTeam && !showLineupSetup && (
          <button
            className={`pregame-lineup-btn${lineupIsSet ? " lineup-is-set" : ""}${!lineupIsSet ? " lineup-required" : ""}`}
            disabled={lineupLockedByLiveGame}
            onClick={() => {
              if (lineupLockedByLiveGame) return;
              onSetSelectedStarters(new Set(savedLineup));
              onSetShowLineupSetup(true);
            }}>
            {lineupIsSet
              ? `Edit Starting Lineup (${savedLineup.length}/5)`
              : "Set Starting Lineup"}
          </button>
        )}

        {lineupLockedByLiveGame && (
          <p className="pregame-settings-hint">{lineupLockedMessage}</p>
        )}

        {showLineupSetup && myTeam && (
          <div className="pregame-lineup-setup">
            <div className="lineup-setup-head">
              <div>
                <h3 className="lineup-setup-title">Select Starting Lineup</h3>
                <p className="lineup-setup-subtitle">Choose 5 players to begin the game.</p>
              </div>
              <button
                type="button"
                className="lineup-cancel-btn"
                onClick={() => onSetShowLineupSetup(false)}
              >
                Close
              </button>
            </div>
            <div className="lineup-setup-status">{selectedStarters.size}/5 selected</div>
            <div className="lineup-player-grid">
              {myTeam.players.map(p => (
                <button
                  key={p.id}
                  className={`lineup-player-btn${selectedStarters.has(p.id) ? " lineup-player-selected" : ""}`}
                  onClick={() => handleStarterToggle(p.id)}
                  disabled={lineupLockedByLiveGame || (selectedStarters.size >= 5 && !selectedStarters.has(p.id))}>
                  <span className="lineup-player-num">#{p.number}</span>
                  <span className="lineup-player-name">{p.name}</span>
                  {selectedStarters.has(p.id) && <span className="lineup-player-badge">*</span>}
                </button>
              ))}
            </div>
            <div className="lineup-setup-actions">
              <button className="lineup-clear-btn" disabled={lineupLockedByLiveGame} onClick={() => onSetSelectedStarters(new Set())}>
                Clear
              </button>
              <button className="lineup-save-btn" disabled={lineupLockedByLiveGame} onClick={handleSaveLineup}>
                Save Lineup ({selectedStarters.size}/5)
              </button>
            </div>
          </div>
        )}

        <button
          className="pregame-start-btn"
          disabled={!canStart}
          onClick={async () => {
            await onStartGame();
          }}>
          Start Game
        </button>

        <div className="pregame-settings-callout">
          <button
            className="pregame-settings-link"
            onClick={() => onNavigate("settings", "game-setup")}>
            Open Advanced Settings
          </button>
          <p className="pregame-settings-hint">API URL, clock, and opponent tracking options.</p>
        </div>
      </div>
    </div>
  );
}
