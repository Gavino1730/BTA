import { useCallback, useEffect, useState } from "react";
import { App as LiveDashboardApp, type AppConnectionInfo } from "./App.js";
import { AiInsightsPage } from "./AiInsightsPage.js";
import { GamesPage } from "./GamesPage.js";
import { PlayersPage } from "./PlayersPage.js";
import { apiBase, apiKeyHeader, operatorBase } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute, type AppRoute } from "./routes.js";
import { SetupPage } from "./SetupPage.js";
import { StatsOverviewPage } from "./StatsOverviewPage.js";
import { TeamSettingsPage } from "./TeamSettingsPage.js";
import { TrendsPage } from "./TrendsPage.js";
import { TutorialOverlay } from "./TutorialOverlay.js";

function normalizeConnectionId(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function buildOperatorConsoleUrl(connectionId: string): string {
  const params = new URLSearchParams(window.location.search);
  const storedConnectionId = normalizeConnectionId(localStorage.getItem("coach-bound-connection-id"));
  const resolvedConnectionId = normalizeConnectionId(params.get("connectionId")) || connectionId || storedConnectionId;
  if (resolvedConnectionId) {
    params.set("connectionId", resolvedConnectionId);
  }
  return `${operatorBase.replace(/\/+$/, "")}/?${params.toString()}`;
}

export function UnifiedCoachApp() {
  const initialConnectionId = normalizeConnectionId(new URLSearchParams(window.location.search).get("connectionId")) || normalizeConnectionId(localStorage.getItem("coach-bound-connection-id"));
  const [route, setRoute] = useState<AppRoute>(() => resolveCoachRoute(window.location.pathname));
  const [requiresSetup, setRequiresSetup] = useState<boolean | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("coach:tutorial-complete"));
  const [connectionInfo, setConnectionInfo] = useState<AppConnectionInfo>({
    deviceConnected: false,
    serverConnected: false,
    connectionId: initialConnectionId,
    operatorConsoleUrl: buildOperatorConsoleUrl(initialConnectionId),
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
    setConnectionInfo({
      ...info,
      operatorConsoleUrl: info.operatorConsoleUrl || buildOperatorConsoleUrl(info.connectionId),
    });
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
  const operatorConsoleUrl = connectionInfo.operatorConsoleUrl || buildOperatorConsoleUrl(connectionInfo.connectionId);

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
          <ul className="coach-nav-links">
            {navBtn("Live", "live", "/live")}
            {navBtn("Overview", "stats-overview", "/stats")}
            {navBtn("Games", "stats-games", "/stats/games")}
            {navBtn("Players", "stats-players", "/stats/players")}
            {navBtn("Trends", "stats-trends", "/stats/trends")}
            {navBtn("AI Insights", "stats-insights", "/stats/insights")}
            {navBtn("Settings", "stats-settings", "/stats/settings")}
          </ul>
          <div className="coach-nav-actions">
            <a href={operatorConsoleUrl} className="coach-nav-ext-link">
              Score Operator
            </a>
            <button
              type="button"
              className="coach-nav-ext-link"
              onClick={() => {
                if (!connectionInfo.connectionId) {
                  return;
                }
                void navigator.clipboard?.writeText(connectionInfo.connectionId);
              }}
              title="Copy the operator connection code"
            >
              Copy Code
            </button>
            <button
              type="button"
              onClick={() => setShowTutorial(true)}
              title="Help &amp; Tutorial"
              aria-label="Open help and tutorial"
              className="coach-nav-help-button"
            >?</button>
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
          </div>
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
