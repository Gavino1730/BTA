import { useState } from "react";
import { DEFAULT_API, DEFAULT_COACH_DASHBOARD } from "./constants.js";
import type { AppData, SettingsView } from "./types.js";
import { normalizeConnectionId } from "./helpers/network.js";

const COACH_DASHBOARD_OVERRIDE_KEY = "operator-console:coach-dashboard-url";

function normalizeSchoolScope(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

export interface SettingsScreenProps {
  appData: AppData;
  settingsView: SettingsView;
  onPersist: (d: AppData) => void;
  onNav: (v: SettingsView) => void;
  onBack: () => void;
  onStartGame: () => void | Promise<void>;
}

export function SettingsScreen({ appData, settingsView, onPersist, onNav, onBack, onStartGame }: SettingsScreenProps) {
  // ---- Game setup local state ----
  const [gsConnectionId, setGsConnectionId] = useState(normalizeConnectionId(appData.gameSetup.connectionId));
  const [gsApiUrl, setGsApiUrl] = useState(appData.gameSetup.apiUrl ?? DEFAULT_API);
  const [gsApiKey, setGsApiKey] = useState(appData.gameSetup.apiKey ?? "");
  const [gsSchoolId, setGsSchoolId] = useState(appData.gameSetup.schoolId ?? "");
  const [gsCoachDashboardUrl, setGsCoachDashboardUrl] = useState(() => {
    try {
      return localStorage.getItem(COACH_DASHBOARD_OVERRIDE_KEY) ?? DEFAULT_COACH_DASHBOARD;
    } catch {
      return DEFAULT_COACH_DASHBOARD;
    }
  });
  const [gsSoundEnabled, setGsSoundEnabled] = useState(appData.gameSetup.soundEnabled ?? true);
  const [gsSoundProfile, setGsSoundProfile] = useState(appData.gameSetup.soundProfile ?? "click");
  const [gsSoundVolume, setGsSoundVolume] = useState(appData.gameSetup.soundVolume ?? 70);
  const [gsHapticsEnabled, setGsHapticsEnabled] = useState(appData.gameSetup.hapticsEnabled ?? true);
  const [gsDeviceName, setGsDeviceName] = useState(appData.gameSetup.deviceName ?? "");

  function saveGameSetup() {
    const normalizedConnectionId = normalizeConnectionId(gsConnectionId || appData.gameSetup.connectionId);
    const connectionChanged = normalizedConnectionId !== normalizeConnectionId(appData.gameSetup.connectionId);
    setGsConnectionId(normalizedConnectionId);
    const normalizedSchoolId = normalizeSchoolScope(gsSchoolId);
    const normalizedCoachDashboardUrl = gsCoachDashboardUrl.trim();
    try {
      if (!normalizedCoachDashboardUrl || normalizedCoachDashboardUrl === DEFAULT_COACH_DASHBOARD) {
        localStorage.removeItem(COACH_DASHBOARD_OVERRIDE_KEY);
      } else {
        localStorage.setItem(COACH_DASHBOARD_OVERRIDE_KEY, normalizedCoachDashboardUrl);
      }
    } catch {
      // Best effort persistence only.
    }

    onPersist({
      ...appData,
      gameSetup: {
        ...appData.gameSetup,
        connectionId: normalizedConnectionId || undefined,
        syncedConnectionId: connectionChanged ? undefined : appData.gameSetup.syncedConnectionId,
        apiUrl: gsApiUrl.trim() || DEFAULT_API,
        apiKey: gsApiKey.trim() || undefined,
        schoolId: normalizedSchoolId || undefined,
        soundEnabled: gsSoundEnabled,
        soundProfile: gsSoundProfile,
        soundVolume: Math.max(0, Math.min(100, Math.round(gsSoundVolume))),
        hapticsEnabled: gsHapticsEnabled,
        deviceName: gsDeviceName.trim() || undefined,
      },
    });
  }

  // ================================================================
  //  RENDER: Game setup
  // ================================================================
  if (settingsView === "game-setup") {
    const myTeam = appData.teams.find((team) => team.id === appData.gameSetup.myTeamId);
    const opponentName = appData.gameSetup.opponent?.trim() || "Opponent";
    const gameId = appData.gameSetup.gameId?.trim() || "game-1";
    const sideLabel = appData.gameSetup.vcSide === "away" ? "away" : "home";

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
              <h3>Coach-controlled game setup</h3>
              <div className="settings-overview-title">{myTeam?.name ?? "Your Team"} ({sideLabel}) vs {opponentName}</div>
              <p className="dim-text">
                Game ID {gameId}
              </p>
            </div>
            <div className="settings-overview-meta">
              <span className="settings-badge">{gsConnectionId ? `Linked • ${gsConnectionId}` : "Not linked yet"}</span>
              <span className="settings-badge">Set team, side, lineup, and colors on coach dashboard</span>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Device Name</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>A label for this device shown to the coach on the Manage Operators screen.</p>
          <input
            placeholder="e.g. iPad 1, Scorer's Table"
            value={gsDeviceName}
            onChange={e => setGsDeviceName(e.target.value)}
          />
        </section>

        <section className="settings-section">
          <h3>Connection Code</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Paste the coach's 6-digit code to link roster and live sync.</p>
          <input value={gsConnectionId} onChange={e => setGsConnectionId(normalizeConnectionId(e.target.value))} placeholder="482913" />
        </section>

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
          <h3>School Scope (optional)</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>
            Set only if your deployment requires explicit tenant scope before sync. Leave blank when coach link sync provides it.
          </p>
          <input
            placeholder="e.g. your-school-id"
            value={gsSchoolId}
            onChange={e => setGsSchoolId(normalizeSchoolScope(e.target.value))}
          />
        </section>

        <section className="settings-section">
          <h3>Coach Dashboard URL</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>
            Used when opening coach views from this iPad. Override for custom domains or staging.
          </p>
          <input
            placeholder={DEFAULT_COACH_DASHBOARD}
            value={gsCoachDashboardUrl}
            onChange={e => setGsCoachDashboardUrl(e.target.value)}
          />
        </section>

        <section className="settings-section">
          <h3>API Key</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>
            Prefer Connection Code + Sync Now on Ready to Track.
            Use this field only as a manual fallback with your deployment BTA_API_KEY or a valid bta.* operator token.
            Leave blank during local development.
          </p>
          <input
            type="password"
            placeholder="Leave blank to disable auth"
            value={gsApiKey}
            onChange={e => setGsApiKey(e.target.value)}
          />
        </section>

        <section className="settings-section">
          <div className="settings-actions">
            <button
              className="save-btn"
              onClick={() => { saveGameSetup(); onNav("menu"); }}>
              Save Operator Setup
            </button>
          </div>
        </section>

      </div>
    );
  }

  if (settingsView === "sound") {
    return (
      <div className="settings-page">
        <header className="settings-header">
          <button className="back-btn" onClick={() => onNav("menu")}>{"<- Back"}</button>
          <h2>Sound & Haptics</h2>
          <button className="save-btn" onClick={() => { saveGameSetup(); onNav("menu"); }}>Save</button>
        </header>

        <section className="settings-section settings-hero-section">
          <div className="settings-overview">
            <div className="settings-overview-copy">
              <h3>Operator touch feedback</h3>
              <div className="settings-overview-title">Click-style controls</div>
              <p className="dim-text">Set sound profile, level, and haptics for all buttons and popups.</p>
            </div>
            <div className="settings-overview-meta">
              <span className="settings-badge">Sound {gsSoundEnabled ? "On" : "Off"}</span>
              <span className="settings-badge">{gsSoundProfile} • {Math.round(gsSoundVolume)}%</span>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Sound</h3>
          <div className="team-toggle" style={{ marginBottom: 12 }}>
            <button className={`tt-btn${gsSoundEnabled ? " tt-teal" : ""}`} onClick={() => setGsSoundEnabled((v) => !v)}>
              {gsSoundEnabled ? "Sound On" : "Sound Off"}
            </button>
          </div>
          <label className="dim-text" htmlFor="sound-volume" style={{ display: "block", marginBottom: 8 }}>
            Volume: {Math.round(gsSoundVolume)}%
          </label>
          <input
            id="sound-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={gsSoundVolume}
            onChange={(event) => setGsSoundVolume(Number(event.target.value))}
            disabled={!gsSoundEnabled}
          />
        </section>

        <section className="settings-section">
          <h3>Click Profile</h3>
          <p className="dim-text" style={{ marginBottom: 8 }}>Choose how tap feedback sounds across buttons and popups.</p>
          <div className="team-toggle">
            <button className={`tt-btn${gsSoundProfile === "soft" ? " tt-teal" : ""}`} onClick={() => setGsSoundProfile("soft")} disabled={!gsSoundEnabled}>Soft Click</button>
            <button className={`tt-btn${gsSoundProfile === "click" ? " tt-teal" : ""}`} onClick={() => setGsSoundProfile("click")} disabled={!gsSoundEnabled}>Click</button>
            <button className={`tt-btn${gsSoundProfile === "sharp" ? " tt-teal" : ""}`} onClick={() => setGsSoundProfile("sharp")} disabled={!gsSoundEnabled}>Sharp Click</button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Haptics</h3>
          <div className="team-toggle">
            <button className={`tt-btn${gsHapticsEnabled ? " tt-teal" : ""}`} onClick={() => setGsHapticsEnabled((v) => !v)}>
              {gsHapticsEnabled ? "Vibration On" : "Vibration Off"}
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
        <div className="menu-card" onClick={() => onNav("sound")}>
          <div className="menu-card-info">
            <span className="menu-card-title">Sound &amp; Haptics</span>
            <span className="menu-card-sub">{appData.gameSetup.soundEnabled ?? true ? "On" : "Off"} • {(appData.gameSetup.soundProfile ?? "click")} • {Math.round(appData.gameSetup.soundVolume ?? 70)}%</span>
          </div>
          <span className="menu-chev">&gt;</span>
        </div>
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
