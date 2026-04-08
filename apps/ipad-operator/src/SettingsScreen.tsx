import { useState } from "react";
import { normalizeTeamColor } from "@bta/shared-schema";
import {
  DEFAULT_API,
  DEFAULT_HOME_TEAM_COLOR,
  DEFAULT_AWAY_TEAM_COLOR,
  DEFAULT_STATS_DASHBOARD,
} from "./constants.js";
import type {
  AppData,
  GameSetup,
  OpponentTrackStat,
  SettingsView,
  Team,
} from "./types.js";
import { TEAM_COLOR_OPTIONS } from "./types.js";
import {
  normalizeConnectionId,
  normalizeOpponentTrackStats,
} from "./helpers/network.js";

export interface SettingsScreenProps {
  appData: AppData;
  settingsView: SettingsView;
  onPersist: (d: AppData) => void;
  onNav: (v: SettingsView) => void;
  onBack: () => void;
  onStartGame: () => void | Promise<void>;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C", ""];

export function SettingsScreen({ appData, settingsView, onPersist, onNav, onBack, onStartGame }: SettingsScreenProps) {
  // ---- Game setup local state ----
  const [gsGameId, setGsGameId] = useState(appData.gameSetup.gameId);
  const [gsConnectionId, setGsConnectionId] = useState(normalizeConnectionId(appData.gameSetup.connectionId));
  const [gsMyTeamId, setGsMyTeamId] = useState(appData.gameSetup.myTeamId);
  const [gsApiUrl, setGsApiUrl] = useState(appData.gameSetup.apiUrl ?? DEFAULT_API);
  const [gsApiKey, setGsApiKey] = useState(appData.gameSetup.apiKey ?? "");
  const [gsOpponent, setGsOpponent] = useState(appData.gameSetup.opponent ?? "");
  const [gsVcSide, setGsVcSide] = useState<"home" | "away">(appData.gameSetup.vcSide ?? "home");
  const [gsDashboardUrl, setGsDashboardUrl] = useState(appData.gameSetup.dashboardUrl ?? DEFAULT_STATS_DASHBOARD);
  const [gsClockVisible, setGsClockVisible] = useState(appData.gameSetup.clockVisible ?? true);
  const [gsClockEnabled, setGsClockEnabled] = useState(appData.gameSetup.clockEnabled ?? true);
  const [gsTrackClock, setGsTrackClock] = useState(appData.gameSetup.trackClock ?? true);
  const [gsTrackPossession, setGsTrackPossession] = useState(appData.gameSetup.trackPossession ?? true);
  const [gsTrackTimeouts, setGsTrackTimeouts] = useState(appData.gameSetup.trackTimeouts ?? true);
  const [gsOpponentTrackStats, setGsOpponentTrackStats] = useState<OpponentTrackStat[]>(
    normalizeOpponentTrackStats(appData.gameSetup.opponentTrackStats)
  );
  const [gsHomeTeamColor, setGsHomeTeamColor] = useState(normalizeTeamColor(appData.gameSetup.homeTeamColor) ?? DEFAULT_HOME_TEAM_COLOR);
  const [gsAwayTeamColor, setGsAwayTeamColor] = useState(normalizeTeamColor(appData.gameSetup.awayTeamColor) ?? DEFAULT_AWAY_TEAM_COLOR);
  const gsMyTeam = appData.teams.find(t => t.id === gsMyTeamId);

  const gsMyTeamName = gsMyTeam?.name ?? "Your Team";
  const gsOpponentName = gsOpponent.trim() || "Opponent";
  const gsHomeSideLabel = gsVcSide === "home"
    ? `${gsMyTeamName} (home)`
    : `${gsOpponentName} (home)`;
  const gsAwaySideLabel = gsVcSide === "away"
    ? `${gsMyTeamName} (away)`
    : `${gsOpponentName} (away)`;

  function applyTrackedTeamColor(
    gameSetup: GameSetup,
    teams: Team[],
    myTeamId: string
  ): GameSetup {
    const selectedTeam = teams.find((team) => team.id === myTeamId);
    if (!selectedTeam?.teamColor) {
      return { ...gameSetup, myTeamId };
    }

    const normalizedColor = normalizeTeamColor(selectedTeam.teamColor) ?? DEFAULT_HOME_TEAM_COLOR;
    return gameSetup.vcSide === "home"
      ? { ...gameSetup, myTeamId, homeTeamColor: normalizedColor }
      : { ...gameSetup, myTeamId, awayTeamColor: normalizedColor };
  }

  function toggleOpponentTrackStat(stat: OpponentTrackStat) {
    setGsOpponentTrackStats((current) => {
      if (current.includes(stat)) {
        const next = current.filter((item) => item !== stat);
        return next.length > 0 ? next : current;
      }
      return [...current, stat];
    });
  }

  function saveGameSetup() {
    const normalizedConnectionId = normalizeConnectionId(gsConnectionId || appData.gameSetup.connectionId);
    const connectionChanged = normalizedConnectionId !== normalizeConnectionId(appData.gameSetup.connectionId);
    setGsConnectionId(normalizedConnectionId);
    onPersist({
      ...appData,
      gameSetup: applyTrackedTeamColor(
        {
          gameId: gsGameId.trim() || "game-1",
          connectionId: normalizedConnectionId || undefined,
          syncedConnectionId: connectionChanged ? undefined : appData.gameSetup.syncedConnectionId,
          myTeamId: gsMyTeamId,
          apiUrl: gsApiUrl.trim() || DEFAULT_API,
          apiKey: gsApiKey.trim() || undefined,
          schoolId: appData.gameSetup.schoolId,
          opponent: gsOpponent.trim(),
          vcSide: gsVcSide,
          dashboardUrl: gsDashboardUrl.trim(),
          clockVisible: gsClockVisible,
          clockEnabled: gsClockEnabled,
          trackClock: gsTrackClock,
          trackPossession: gsTrackPossession,
          trackTimeouts: gsTrackTimeouts,
          opponentTrackStats: normalizeOpponentTrackStats(gsOpponentTrackStats),
          homeTeamColor: normalizeTeamColor(gsHomeTeamColor) ?? DEFAULT_HOME_TEAM_COLOR,
          awayTeamColor: normalizeTeamColor(gsAwayTeamColor) ?? DEFAULT_AWAY_TEAM_COLOR,
          statsGameId: appData.gameSetup.statsGameId,
          startingLineup: appData.gameSetup.startingLineup,
        },
        appData.teams,
        gsMyTeamId,
      ),
    });
  }

  // ================================================================
  //  RENDER: Game setup
  // ================================================================
  if (settingsView === "game-setup") {
    const setupErrors: string[] = [];
    if (!gsMyTeamId) setupErrors.push("Select your team");
    if (!gsOpponent.trim()) setupErrors.push("Enter the opponent name");
    const trackingBadges = [
      gsTrackClock ? "Clock" : null,
      gsTrackPossession ? "Possession" : null,
      gsTrackTimeouts ? "Timeouts" : null,
    ].filter(Boolean);

    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("menu")}>{"<- Back"}</button>
          <h2>Game Setup</h2>
          <button className="save-btn" onClick={() => { saveGameSetup(); onNav("menu"); }}>Save</button>
        </header>

        <section className="settings-section settings-hero-section">
          <div className="settings-overview">
            <div className="settings-overview-copy">
              <h3>Current setup</h3>
              <div className="settings-overview-title">{gsMyTeamName} vs {gsOpponentName}</div>
              <p className="dim-text">
                {gsVcSide === "home" ? "VC is home" : "VC is away"} • Game ID {gsGameId.trim() || "game-1"}
              </p>
            </div>
            <div className="settings-overview-meta">
              <span className="settings-badge">{gsConnectionId ? `Linked • ${gsConnectionId}` : "Not linked yet"}</span>
              <span className="settings-badge">{trackingBadges.length > 0 ? trackingBadges.join(" • ") : "Manual stats only"}</span>
            </div>
          </div>
        </section>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Game ID</h3>
            <input value={gsGameId} onChange={e => setGsGameId(e.target.value)} placeholder="game-1" />
          </section>

          <section className="settings-section">
            <h3>Connection Code</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Paste the coach's 6-digit code to link roster and live sync.</p>
            <input value={gsConnectionId} onChange={e => setGsConnectionId(normalizeConnectionId(e.target.value))} placeholder="482913" />
          </section>
        </div>

        <section className="settings-section">
          <h3>Your Team</h3>
          {appData.teams.length === 0 && <p className="dim-text">No teams are available yet. Complete team setup from the coach workspace.</p>}
          <div className="team-picker">
            {appData.teams.map(t => {
              const isSelected = gsMyTeamId === t.id;
              const displayColor = t.teamColor ?? DEFAULT_HOME_TEAM_COLOR;
              const normalizedColor = normalizeTeamColor(displayColor) ?? DEFAULT_HOME_TEAM_COLOR;
              return (
                <button key={t.id}
                  className="team-pick-btn"
                  style={isSelected ? {
                    background: `color-mix(in srgb, ${normalizedColor} 12%, rgba(255,255,255,0.04))`,
                    borderColor: normalizedColor,
                  } : undefined}
                  onClick={() => {
                    setGsMyTeamId(t.id);
                    if (t.teamColor) {
                      const nextColor = normalizeTeamColor(t.teamColor) ?? DEFAULT_HOME_TEAM_COLOR;
                      if (gsVcSide === "home") {
                        setGsHomeTeamColor(nextColor);
                      } else {
                        setGsAwayTeamColor(nextColor);
                      }
                    }
                  }}>
                  <span className="tp-abbr" style={{ borderColor: normalizedColor, color: normalizedColor }}>{t.abbreviation}</span>
                  <span className="tp-name">{t.name}</span>
                  <span className="tp-count">{t.players.length}p</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Opponent Name</h3>
            <input
              placeholder="e.g. Opponent"
              value={gsOpponent}
              onChange={e => setGsOpponent(e.target.value)}
            />
          </section>

          <section className="settings-section">
            <h3>Your Side</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Are you playing home or away?</p>
            <div className="team-toggle">
              <button className={`tt-btn${gsVcSide === "home" ? " tt-teal" : ""}`} onClick={() => setGsVcSide("home")}>{gsHomeSideLabel}</button>
              <button className={`tt-btn${gsVcSide === "away" ? " tt-red" : ""}`}  onClick={() => setGsVcSide("away")}>{gsAwaySideLabel}</button>
            </div>
          </section>
        </div>

        <section className="settings-section">
          <h3>Opponent Color</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Pick the opponent's jersey color to make scorekeeping faster.</p>
          <div className="team-color-rows">
            <div className="team-color-row">
              <span className="team-color-label">{gsVcSide === "home" ? gsAwaySideLabel : gsHomeSideLabel}</span>
              <div className="team-color-swatches">
                {TEAM_COLOR_OPTIONS.map((color) => {
                  const currentColor = gsVcSide === "home" ? gsAwayTeamColor : gsHomeTeamColor;
                  return (
                    <button
                      key={`opp-${color}`}
                      type="button"
                      className={`team-color-swatch${currentColor === color ? " selected" : ""}`}
                      style={{ background: color }}
                      onClick={() => gsVcSide === "home" ? setGsAwayTeamColor(color) : setGsHomeTeamColor(color)}
                      title={`Opponent color ${color}`}
                    />
                  );
                })}
              </div>
              {gsVcSide === "home"
                ? <input className="team-color-input" type="color" aria-label="Custom opponent color" value={gsAwayTeamColor} onChange={e => setGsAwayTeamColor(normalizeTeamColor(e.target.value) ?? DEFAULT_AWAY_TEAM_COLOR)} />
                : <input className="team-color-input" type="color" aria-label="Custom opponent color" value={gsHomeTeamColor} onChange={e => setGsHomeTeamColor(normalizeTeamColor(e.target.value) ?? DEFAULT_HOME_TEAM_COLOR)} />
              }
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Opponent Stats To Track</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Choose which opponent stats can be recorded.</p>
          <div className="team-toggle">
            <button className={`tt-btn${gsOpponentTrackStats.includes("points") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("points")}>Points</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("free_throws") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("free_throws")}>Free Throws</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("def_reb") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("def_reb")}>Def Reb</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("off_reb") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("off_reb")}>Off Reb</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("turnover") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("turnover")}>Turnover</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("steal") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("steal")}>Steal</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("assist") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("assist")}>Assist</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("block") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("block")}>Block</button>
            <button className={`tt-btn${gsOpponentTrackStats.includes("foul") ? " tt-teal" : ""}`} onClick={() => toggleOpponentTrackStat("foul")}>Foul</button>
          </div>
        </section>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Tracking Toggles</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Choose what the operator tracks during the game.</p>
            <div className="team-toggle">
              <button className={`tt-btn${gsTrackTimeouts ? " tt-teal" : ""}`} onClick={() => setGsTrackTimeouts(!gsTrackTimeouts)}>
                Timeouts {gsTrackTimeouts ? "On" : "Off"}
              </button>
              <button className={`tt-btn${gsTrackPossession ? " tt-teal" : ""}`} onClick={() => setGsTrackPossession(!gsTrackPossession)}>
                Possession {gsTrackPossession ? "On" : "Off"}
              </button>
              <button className={`tt-btn${gsTrackClock ? " tt-teal" : ""}`} onClick={() => setGsTrackClock(!gsTrackClock)}>
                Game Clock {gsTrackClock ? "Tracked" : "Off"}
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Clock Panel</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>These only affect the operator screen controls when game clock tracking is on.</p>
            <div className="team-toggle">
              <button className={`tt-btn${gsClockVisible ? " tt-teal" : ""}`} onClick={() => setGsClockVisible(!gsClockVisible)}>{gsClockVisible ? "Panel Visible" : "Panel Hidden"}</button>
              <button className={`tt-btn${gsClockEnabled ? " tt-teal" : ""}`} onClick={() => setGsClockEnabled(!gsClockEnabled)}>{gsClockEnabled ? "Controls Unlocked" : "Controls Locked"}</button>
            </div>
          </section>
        </div>

        <div className="settings-grid-2">
          <section className="settings-section">
            <h3>Realtime API URL</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Use the laptop's local IP on game day (example: http://192.168.1.5:4000).</p>
            <input
              placeholder={DEFAULT_API}
              value={gsApiUrl}
              onChange={e => setGsApiUrl(e.target.value)}
            />
          </section>

          <section className="settings-section">
            <h3>Legacy Stats Export URL</h3>
            <p className="dim-text" style={{ marginBottom: 8 }}>Optional separate post-game export endpoint. If you only use the coach dashboard, leave this on the same host as the Realtime API.</p>
            <input
              placeholder="http://localhost:4000"
              value={gsDashboardUrl}
              onChange={e => setGsDashboardUrl(e.target.value)}
            />
          </section>
        </div>

        <section className="settings-section">
          <h3>API Key</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>API key or login token from the coach dashboard. Leave blank during local development.</p>
          <input
            type="password"
            placeholder="Leave blank to disable auth"
            value={gsApiKey}
            onChange={e => setGsApiKey(e.target.value)}
          />
        </section>

        <section className="settings-section">
          {setupErrors.length > 0 && (
            <ul className="setup-errors">
              {setupErrors.map(err => <li key={err}>{err}</li>)}
            </ul>
          )}
          <div className="settings-actions">
            <button
              className="save-btn"
              disabled={setupErrors.length > 0}
              onClick={() => { if (setupErrors.length === 0) { saveGameSetup(); onNav("menu"); } }}>
              Save Game Setup
            </button>
          </div>
        </section>

      </div>
    );
  }

  // ================================================================
  //  RENDER: Settings menu (default)
  // ================================================================
  const myTeamForMenu = appData.teams.find(t => t.id === appData.gameSetup.myTeamId);
  const vcSideForMenu = appData.gameSetup.vcSide ?? "home";
  const menuSideLabel = vcSideForMenu === "home" ? "home" : "away";

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={onBack}>{"<- Game"}</button>
        <h2>Settings</h2>
        <div style={{ width: 64 }} />
      </header>

      <section className="settings-section">
        <h3>Game</h3>
        <div className="menu-card" onClick={() => onNav("game-setup")}>
          <div className="menu-card-info">
            <span className="menu-card-title">Game Setup</span>
            <span className="menu-card-sub">
              {myTeamForMenu
                ? `${myTeamForMenu.name} (${menuSideLabel}) vs ${appData.gameSetup.opponent || "TBD"} | ${appData.gameSetup.gameId}`
                : "No team selected"}
            </span>
          </div>
          <span className="menu-chev">&gt;</span>
        </div>
      </section>

      <section className="settings-section">
        <h3>Device Setup</h3>
        <div className="menu-card" onClick={() => onNav("ipad-tips")}>
          <div className="menu-card-info">
            <span className="menu-card-title">iPad Setup Tips</span>
            <span className="menu-card-sub">Home screen, auto-lock, DND, rotation lock &amp; more</span>
          </div>
          <span className="menu-chev">&gt;</span>
        </div>
      </section>

      <section className="settings-section">
        <h3 style={{color:'#f87171'}}>Danger Zone</h3>
        <div
          className="menu-card"
          style={{border:'1px solid #7f1d1d'}}
          onClick={() => {
            if (!confirm('Clear all local data on this device? Game events, roster, and settings saved here will be erased.')) return;
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            window.location.reload();
          }}
        >
          <div className="menu-card-info">
            <span className="menu-card-title" style={{color:'#f87171'}}>Clear Local Data</span>
            <span className="menu-card-sub">Erase all data stored on this device</span>
          </div>
          <span className="menu-chev">&gt;</span>
        </div>
      </section>
    </div>
  );
}
