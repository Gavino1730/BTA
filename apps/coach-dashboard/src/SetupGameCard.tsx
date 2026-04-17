import { normalizeTeamColor } from "@bta/shared-schema";
import { EmptyState } from "./EmptyState.js";
import { generateConnectionCode } from "./platform.js";
import type { RosterTeam } from "./helpers/index.js";

const JERSEY_COLORS = [
  { label: "Red", value: "#f87171" },
  { label: "Orange", value: "#f59e0b" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#4f8cff" },
  { label: "Violet", value: "#a855f7" },
  { label: "Teal", value: "#14b8a6" },
  { label: "White", value: "#ffffff" },
] as const;

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
  const selectedTeam = rosterTeams.find((team) => team.id === newGameMyTeamId);
  const canLaunch = !!newGameMyTeamId && !!newGameOpponent.trim() && newGameStartingLineup.length === 5 && !isLaunchingGame;
  const selectedJersey = JERSEY_COLORS.find((entry) => entry.value.toLowerCase() === newGameOppColor.toLowerCase());
  const selectedTeamColor = normalizeTeamColor(selectedTeam?.teamColor) ?? "#4f8cff";
  const selectedStarters = (selectedTeam?.players ?? []).filter((player) => newGameStartingLineup.includes(player.id));
  const readinessItems = [
    {
      label: "Team selected",
      complete: !!selectedTeam,
      detail: selectedTeam?.displayName ?? selectedTeam?.name ?? "Choose a team workspace",
    },
    {
      label: "Opponent named",
      complete: !!newGameOpponent.trim(),
      detail: newGameOpponent.trim() || "Add the opponent school/team",
    },
    {
      label: "Five starters locked",
      complete: newGameStartingLineup.length === 5,
      detail: `${newGameStartingLineup.length}/5 starters selected`,
    },
    {
      label: "Pairing code ready",
      complete: !!connectionId.trim(),
      detail: connectionId.trim() || "Generate a connection code",
    },
  ];
  const readyCount = readinessItems.filter((item) => item.complete).length;
  const launchMessage = newGameStartingLineup.length !== 5
    ? "Select all 5 starters to launch the game."
    : "Lineup locked. Launch when ready.";

  return (
    <section className="card settings-section-card setup-game-shell">
      <div className="stats-page-card-head setup-game-head">
        <div className="setup-game-head-copy">
          <p className="setup-game-kicker">Game Control</p>
          <h3>Start New Game</h3>
          <p className="settings-section-desc setup-game-head-desc">Set up your game connection, then hand your operator the pairing code to begin live tracking.</p>
        </div>
        <div className="setup-game-head-status">
          <span className={`team-workspace-chip ${canLaunch ? "is-primary" : ""}`}>
            {canLaunch ? "Ready to launch" : `${readyCount}/4 setup checks complete`}
          </span>
        </div>
      </div>

      <div className="setup-pairing-hero">
        <div className="setup-pairing-copy">
          <p className="setup-game-section-label">Operator Pairing Code</p>
          <p className="settings-section-desc">Have the iPad operator enter this to sync setup.</p>
          <p className="settings-pairing-hint">Enter this code in the Score Operator app under <strong>Connect to Dashboard</strong>.</p>
          <div className="setup-inline-notes">
            <span className="team-workspace-chip is-primary">Operator enters code on iPad</span>
            <span className="team-workspace-chip">Regenerate if you switch devices</span>
          </div>
        </div>
        <div className="setup-pairing-code-wrap">
          <span className="settings-pairing-code setup-pairing-code-hero">{connectionId}</span>
        </div>
        <div className="settings-header-actions setup-pairing-actions">
          <button type="button" className="shell-nav-link" onClick={() => void navigator.clipboard?.writeText(connectionId)}>Copy Code</button>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => setConnectionId(generateConnectionCode())}>New Code</button>
        </div>
      </div>

      <div className="setup-game-grid">
        <section className="setup-game-panel setup-game-panel-primary">
          <div className="setup-subsection-card">
            <p className="setup-game-section-label">Your Team</p>
            {rosterTeams.length === 0 && (
              <EmptyState
                title="No team available yet"
                message="Create a team and roster before starting live tracking."
              />
            )}
            {rosterTeams.length > 0 ? (
              <div className="setup-team-pill-grid">
                {rosterTeams.map((team) => {
                  const isSelected = newGameMyTeamId === team.id;
                  const color = normalizeTeamColor(team.teamColor) ?? "#4f8cff";
                  return (
                    <button
                      key={team.id}
                      type="button"
                      className="shell-nav-link setup-team-pill"
                      style={isSelected ? { borderColor: color, background: `${color}22` } : undefined}
                      onClick={() => {
                        setNewGameMyTeamId(team.id);
                        setNewGameStartingLineup(() => []);
                      }}
                    >
                      <span className="setup-team-pill-title">{team.displayName ?? team.name}</span>
                      <span className="setup-team-pill-meta">{team.players.length} players</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="setup-lineup-wrap setup-subsection-card">
            <div className="setup-lineup-head">
              <p className="setup-game-section-label">Starting Lineup</p>
              <span className="setup-lineup-count">{newGameStartingLineup.length}/5</span>
            </div>
            <p className="settings-section-desc">Select exactly 5 players for tip-off.</p>

            {!newGameMyTeamId ? (
              <EmptyState
                title="Pick a team first"
                message="The starting lineup becomes available after you choose the active team."
              />
            ) : !selectedTeam || selectedTeam.players.length === 0 ? (
              <EmptyState
                title="No players on this roster"
                message="Add players in team settings before launching live tracking."
              />
            ) : (
              <>
                <div className="setup-lineup-selected">
                  {selectedStarters.length > 0 ? (
                    selectedStarters.map((player) => (
                      <span key={player.id} className="team-workspace-chip is-primary">
                        #{player.number} {player.name}
                      </span>
                    ))
                  ) : (
                    <p className="settings-section-desc setup-lineup-helper">No starters selected yet.</p>
                  )}
                </div>
                <div className="setup-lineup-grid">
                  {selectedTeam.players.map((player) => {
                    const isSelected = newGameStartingLineup.includes(player.id);
                    const isDisabled = !isSelected && newGameStartingLineup.length >= 5;
                    return (
                      <button
                        key={player.id}
                        type="button"
                        className="shell-nav-link setup-lineup-pill"
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
                        style={isSelected ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(20,184,166,0.12)" } : undefined}
                        title={`${player.number} ${player.name}`}
                      >
                        <span className="setup-lineup-pill-number">#{player.number}</span>
                        <span className="setup-lineup-pill-name">{player.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="setup-game-panel setup-game-panel-side">
          <div className="setup-preview-card">
            <div className="setup-preview-head">
              <div>
                <p className="setup-game-section-label">Game Preview</p>
                <h4 className="setup-preview-title">{selectedTeam?.displayName ?? selectedTeam?.name ?? "Select team"} vs {newGameOpponent.trim() || "Opponent"}</h4>
              </div>
              <span className={`team-workspace-chip ${canLaunch ? "is-primary" : ""}`}>
                {newGameVcSide === "home" ? "Home" : "Away"}
              </span>
            </div>
            <div className="setup-preview-grid">
              {readinessItems.map((item) => (
                <div key={item.label} className={`setup-preview-item${item.complete ? " is-complete" : ""}`}>
                  <span className="setup-preview-item-label">{item.label}</span>
                  <strong className="setup-preview-item-value">{item.detail}</strong>
                </div>
              ))}
            </div>
            <div className="setup-preview-colors">
              <div className="setup-preview-color-card">
                <span className="setup-preview-color-label">Your color</span>
                <div className="setup-preview-color-swatch-row">
                  <span className="setup-preview-color-dot" style={{ background: selectedTeamColor }} />
                  <strong>{selectedTeamColor.toUpperCase()}</strong>
                </div>
              </div>
              <div className="setup-preview-color-card">
                <span className="setup-preview-color-label">Opponent jersey</span>
                <div className="setup-preview-color-swatch-row">
                  <span className="setup-preview-color-dot" style={{ background: newGameOppColor }} />
                  <strong>{selectedJersey?.label ?? newGameOppColor.toUpperCase()}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="setup-subsection-card">
            <p className="setup-game-section-label">Your Side</p>
            <div className="setup-side-toggle" role="group" aria-label="Choose your side">
              <button
                type="button"
                className="shell-nav-link setup-side-pill"
                onClick={() => setNewGameVcSide("home")}
                style={newGameVcSide === "home" ? { borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(20,184,166,0.12)" } : undefined}
              >
                Home
              </button>
              <button
                type="button"
                className="shell-nav-link setup-side-pill"
                onClick={() => setNewGameVcSide("away")}
                style={newGameVcSide === "away" ? { borderColor: "#f87171", color: "#f87171", background: "rgba(248,113,113,0.12)" } : undefined}
              >
                Away
              </button>
            </div>
          </div>

          <div className="setup-subsection-card">
            <p className="setup-game-section-label">Opponent</p>
            <input
              value={newGameOpponent}
              onChange={(event) => setNewGameOpponent(event.target.value)}
              placeholder="e.g. Opponent"
              className="setup-game-input"
            />
          </div>

          <div className="setup-subsection-card">
            <div className="setup-jersey-row">
              <p className="setup-game-section-label">Opponent Jersey</p>
              <div className="setup-jersey-preview-pill">
                <span className="setup-jersey-preview-dot" style={{ background: newGameOppColor }} />
                <span>{selectedJersey?.label ?? "Custom"}</span>
              </div>
            </div>
            <div className="setup-jersey-grid" role="listbox" aria-label="Choose opponent jersey color">
              {JERSEY_COLORS.map(({ label, value }) => {
                const isSelected = newGameOppColor.toLowerCase() === value.toLowerCase();
                return (
                  <div key={value} className="setup-jersey-option">
                    <button
                      type="button"
                      className="setup-game-color-swatch setup-jersey-swatch"
                      aria-pressed={isSelected}
                      onClick={() => setNewGameOppColor(value)}
                      style={{ background: value, borderColor: isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.22)" }}
                      title={label}
                    />
                    <span className="setup-jersey-swatch-label">{label}</span>
                  </div>
                );
              })}
              <label className="setup-jersey-custom" title="Custom jersey color">
                <span>Custom</span>
                <input
                  type="color"
                  className="setup-game-color-input"
                  value={newGameOppColor}
                  onChange={(event) => setNewGameOppColor(event.target.value)}
                />
              </label>
            </div>
          </div>
        </section>
      </div>

      <div className="setup-launch-panel">
        <div className="setup-game-launch-wrap">
          <p className="settings-section-desc setup-launch-help">{launchMessage}</p>
          <p className="settings-section-desc setup-status-copy">{dashboardStatus}</p>
        </div>

        <button
          type="button"
          className="setup-launch-btn"
          disabled={!canLaunch}
          onClick={() => void launchGame()}
        >
          {isLaunchingGame ? "Starting..." : "Launch Live Game"}
        </button>
      </div>
    </section>
  );
}
