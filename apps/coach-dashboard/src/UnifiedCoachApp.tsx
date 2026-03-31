import { useCallback, useEffect, useState } from "react";
import { App as LiveDashboardApp, type AppConnectionInfo } from "./App.js";
import { AiInsightsPage } from "./AiInsightsPage.js";
import { GamesPage } from "./GamesPage.js";
import { PlayersPage } from "./PlayersPage.js";
import { apiBase, apiKeyHeader } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute, type AppRoute } from "./routes.js";
import { SetupPage } from "./SetupPage.js";
import { StatsOverviewPage } from "./StatsOverviewPage.js";
import { TeamSettingsPage } from "./TeamSettingsPage.js";
import { TrendsPage } from "./TrendsPage.js";
import { TutorialOverlay } from "./TutorialOverlay.js";

export function UnifiedCoachApp() {
  const [route, setRoute] = useState<AppRoute>(() => resolveCoachRoute(window.location.pathname));
  const [requiresSetup, setRequiresSetup] = useState<boolean | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("coach:tutorial-complete"));
  const [connectionInfo, setConnectionInfo] = useState<AppConnectionInfo>({
    deviceConnected: false,
    serverConnected: false,
    connectionId: "",
    operatorConsoleUrl: "",
  });

  useEffect(() => {
    const canonicalPath = canonicalizeCoachPath(window.location.pathname);
    if (canonicalPath !== window.location.pathname) {
      window.history.replaceState({}, "", canonicalPath);
      setRoute(resolveCoachRoute(canonicalPath));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSetupState() {
      try {
        const response = await fetch(`${apiBase}/api/onboarding/state`, { headers: apiKeyHeader() });
        if (!response.ok) {
          throw new Error("Failed to load teams");
        }

        const payload = await response.json() as { completed?: boolean };
        if (!cancelled) {
          setRequiresSetup(!Boolean(payload.completed));
        }
      } catch {
        if (!cancelled) {
          setRequiresSetup(false);
        }
      }
    }

    void loadSetupState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (requiresSetup && route !== "setup") {
      window.history.replaceState({}, "", "/setup");
      setRoute("setup");
    }
  }, [requiresSetup, route]);

  useEffect(() => {
    function handlePopState() {
      const canonicalPath = canonicalizeCoachPath(window.location.pathname);
      if (canonicalPath !== window.location.pathname) {
        window.history.replaceState({}, "", canonicalPath);
      }
      setRoute(resolveCoachRoute(canonicalPath));
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleConnectionChange = useCallback((info: AppConnectionInfo) => {
    setConnectionInfo(info);
  }, []);

  function navigate(nextPath: string) {
    if (requiresSetup && nextPath !== "/setup") {
      nextPath = "/setup";
    }
    if (window.location.pathname === nextPath) {
      return;
    }
    window.history.pushState({}, "", nextPath);
    setRoute(resolveCoachRoute(nextPath));
  }

  if (requiresSetup === null) {
    return (
      <div className="stats-page">
        <section className="stats-page-card">
          <p className="stats-page-status">Loading workspace setup...</p>
        </section>
      </div>
    );
  }

  if (route === "setup") {
    return (
      <SetupPage
        onComplete={() => {
          setRequiresSetup(false);
          window.history.replaceState({}, "", "/live");
          setRoute("live");
        }}
      />
    );
  }

  const isLive = route === "live";

  function navBtn(label: string, targetRoute: AppRoute, path: string) {
    return (
      <li key={targetRoute}>
        <button
          type="button"
          className={route === targetRoute ? "nav-active" : ""}
          onClick={() => navigate(path)}
        >
          {label}
        </button>
      </li>
    );
  }

  return (
    <>
      {showTutorial && (
        <TutorialOverlay onDismiss={() => setShowTutorial(false)} />
      )}
      <nav className="coach-navbar">
        <div className="coach-nav-container">
          <div className="coach-nav-logo">Bench IQ</div>
          <ul className="coach-nav-links">
            {navBtn("Live", "live", "/live")}
            {navBtn("Overview", "stats-overview", "/stats")}
            {navBtn("Games", "stats-games", "/stats/games")}
            {navBtn("Players", "stats-players", "/stats/players")}
            {navBtn("Trends", "stats-trends", "/stats/trends")}
            {navBtn("AI Insights", "stats-insights", "/stats/insights")}
            {navBtn("Settings", "stats-settings", "/stats/settings")}
            {isLive && connectionInfo.operatorConsoleUrl && (
              <li>
                <a href={connectionInfo.operatorConsoleUrl} className="coach-nav-ext-link">
                  Score Operator
                </a>
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            title="Help &amp; Tutorial"
            style={{ background: "transparent", border: "1.5px solid #4f8cff", color: "#4f8cff", borderRadius: "50%", width: "28px", height: "28px", fontSize: "14px", fontWeight: 700, cursor: "pointer", flexShrink: 0, marginLeft: "8px", lineHeight: 1 }}
          >?</button>
          {isLive && (
            <div className={`connection-pill ${connectionInfo.deviceConnected ? "online" : "offline"}`} style={{ flexShrink: 0 }}>
              <span className="connection-pill-status">
                {connectionInfo.deviceConnected ? "Operator live" : connectionInfo.serverConnected ? "Waiting" : "Offline"}
              </span>
              <label className="connection-pill-editor" title="Operator device identifier">
                <span className="connection-pill-label">Connection</span>
                <input
                  className="connection-pill-input"
                  value={connectionInfo.connectionId}
                  readOnly
                  placeholder="conn-..."
                  aria-label="Connection ID"
                />
              </label>
            </div>
          )}
        </div>
      </nav>
      {isLive && (
        <LiveDashboardApp
          onConnectionChange={handleConnectionChange}
          showTutorial={false}
          onDismissTutorial={() => setShowTutorial(false)}
        />
      )}
      {route === "stats-overview" && <StatsOverviewPage />}
      {route === "stats-games" && <GamesPage />}
      {route === "stats-players" && <PlayersPage />}
      {route === "stats-trends" && <TrendsPage />}
      {route === "stats-insights" && <AiInsightsPage />}
      {route === "stats-settings" && <TeamSettingsPage />}
    </>
  );
}
