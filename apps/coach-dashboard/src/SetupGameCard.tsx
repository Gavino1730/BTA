import { normalizeTeamColor } from "@bta/shared-schema";
import { generateConnectionCode } from "./platform.js";
import type { RosterTeam } from "./helpers/index.js";

interface Props {
  rosterTeams: RosterTeam[];
  newGameMyTeamId: string;
  setNewGameMyTeamId: (id: string) => void;
  newGameOpponent: string;
  setNewGameOpponent: (v: string) => void;
  newGameVcSide: "home" | "away";
  setNewGameVcSide: (v: "home" | "away") => void;
  newGameOppColor: string;
  setNewGameOppColor: (v: string) => void;
  newGameStartingLineup: string[];
  setNewGameStartingLineup: (updater: (prev: string[]) => string[]) => void;
  isLaunchingGame: boolean;
  launchGame: () => Promise<void>;
  dashboardStatus: string;
  connectionId: string;
  setConnectionId: (id: string) => void;
}

export function SetupGameCard({
  rosterTeams,
  newGameMyTeamId, setNewGameMyTeamId,
  newGameOpponent, setNewGameOpponent,
  newGameVcSide, setNewGameVcSide,
  newGameOppColor, setNewGameOppColor,
  newGameStartingLineup, setNewGameStartingLineup,
  isLaunchingGame,
  launchGame,
  dashboardStatus,
  connectionId,
  setConnectionId,
}: Props) {
  return (
    <section className="card settings-section-card">
      <div className="stats-page-card-head">
        <div>
          <h3>Start New Game</h3>
          <p className="settings-section-desc">Set up your game connection, then give the operator your pairing code to begin live tracking.</p>
        </div>
      </div>

      {/* Pairing code */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="stats-page-card-head" style={{ paddingBottom: "0.75rem" }}>
          <div>
            <h3 style={{ fontSize: "0.95rem" }}>Operator Pairing Code</h3>
            <p className="settings-section-desc">Have the iPad operator enter this code to sync setup.</p>
          </div>
          <div className="settings-header-actions">
            <button type="button" className="shell-nav-link" onClick={() => void navigator.clipboard?.writeText(connectionId)}>Copy Code</button>
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setConnectionId(generateConnectionCode())}>New Code</button>
          </div>
        </div>
        <div className="settings-pairing-display">
          <span className="settings-pairing-code">{connectionId}</span>
          <p className="settings-pairing-hint">Enter this code in the Score Operator app under <strong>Connect to Dashboard</strong>.</p>
        </div>
      </div>

      {/* Your Team + Side */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="settings-section-label">Your Team</p>
          {rosterTeams.length === 0 && (
            <p className="settings-section-desc">No teams yet — add one in <strong>Settings</strong> first.</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
            {rosterTeams.map(t => {
              const isSelected = newGameMyTeamId === t.id;
              const color = normalizeTeamColor(t.teamColor) ?? "#4f8cff";
              return (
                <button
                  key={t.id}
                  type="button"
                  className="shell-nav-link"
                  style={isSelected ? { borderColor: color, color, background: `${color}22` } : undefined}
                  onClick={() => {
                    setNewGameMyTeamId(t.id);
                    setNewGameStartingLineup(() => []);
                  }}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <p className="settings-section-label">Your Side</p>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
            <button type="button" className="shell-nav-link" onClick={() => setNewGameVcSide("home")} style={newGameVcSide === "home" ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(20,184,166,0.1)" } : undefined}>Home</button>
            <button type="button" className="shell-nav-link" onClick={() => setNewGameVcSide("away")} style={newGameVcSide === "away" ? { borderColor: "#f87171", color: "#f87171", background: "rgba(248,113,113,0.1)" } : undefined}>Away</button>
          </div>
        </div>
      </div>

      {/* Starting lineup */}
      <div style={{ marginBottom: "1rem" }}>
        <p className="settings-section-label">Starting Lineup (required)</p>
        <p className="settings-section-desc" style={{ marginTop: "0.35rem" }}>
          Select exactly 5 players for tip-off. Selected: {newGameStartingLineup.length}/5
        </p>
        {(() => {
          const selectedTeam = rosterTeams.find((team) => team.id === newGameMyTeamId);
          if (!newGameMyTeamId) {
            return <p className="settings-section-desc" style={{ marginTop: "0.5rem" }}>Pick your team first.</p>;
          }
          if (!selectedTeam || selectedTeam.players.length === 0) {
            return <p className="settings-section-desc" style={{ marginTop: "0.5rem" }}>No players on this roster yet. Add players in Settings.</p>;
          }

          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.6rem" }}>
              {selectedTeam.players.map((player) => {
                const isSelected = newGameStartingLineup.includes(player.id);
                const isDisabled = !isSelected && newGameStartingLineup.length >= 5;
                return (
                  <button
                    key={player.id}
                    type="button"
                    className="shell-nav-link"
                    disabled={isDisabled}
                    onClick={() => {
                      setNewGameStartingLineup((previous) => {
                        if (previous.includes(player.id)) {
                          return previous.filter((playerId) => playerId !== player.id);
                        }
                        if (previous.length >= 5) {
                          return previous;
                        }
                        return [...previous, player.id];
                      });
                    }}
                    style={isSelected
                      ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(20,184,166,0.1)" }
                      : undefined}
                    title={`${player.number} ${player.name}`}
                  >
                    #{player.number} {player.name}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Opponent */}
      <div style={{ marginBottom: "1rem" }}>
        <p className="settings-section-label">Opponent</p>
        <input
          value={newGameOpponent}
          onChange={e => setNewGameOpponent(e.target.value)}
          placeholder="e.g. Opponent"
          style={{ display: "block", width: "100%", marginTop: "0.5rem", minHeight: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "var(--text)", padding: "0.75rem 0.9rem", fontFamily: "inherit", fontSize: "inherit" }}
        />
      </div>

      {/* Opponent color */}
      <div style={{ marginBottom: "1.5rem" }}>
        <p className="settings-section-label">Opponent Jersey Color</p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "center" }}>
          {["#f87171","#f59e0b","#22c55e","#4f8cff","#a855f7","#14b8a6","#ffffff"].map(color => (
            <button
              key={color}
              type="button"
              className="setup-game-color-swatch"
              onClick={() => setNewGameOppColor(color)}
              style={{ background: color, borderColor: newGameOppColor === color ? "white" : "rgba(255,255,255,0.2)" }}
              title={color}
            />
          ))}
          <input type="color" className="setup-game-color-input" value={newGameOppColor} onChange={e => setNewGameOppColor(e.target.value)} />
        </div>
      </div>

      {/* Launch button */}
      <button
        type="button"
        className="shell-nav-link shell-nav-link-active"
        disabled={!newGameMyTeamId || !newGameOpponent.trim() || newGameStartingLineup.length !== 5 || isLaunchingGame}
        style={{ display: "block", width: "100%", textAlign: "center", padding: "0.75rem", fontSize: "1rem", fontWeight: 700, marginBottom: "1.5rem", borderRadius: 12, opacity: (!newGameMyTeamId || !newGameOpponent.trim() || newGameStartingLineup.length !== 5 || isLaunchingGame) ? 0.45 : 1 }}
        onClick={() => void launchGame()}
      >
        {isLaunchingGame ? "Starting..." : "Launch Game"}
      </button>
      {newGameStartingLineup.length !== 5 && (
        <p className="settings-section-desc" style={{ marginBottom: "1rem" }}>
          Select all 5 starters to launch the game.
        </p>
      )}
      <p className="settings-section-desc">{dashboardStatus}</p>
    </section>
  );
}
