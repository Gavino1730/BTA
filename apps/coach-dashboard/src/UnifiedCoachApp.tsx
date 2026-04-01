import { useCallback, useEffect, useState } from "react";
import { App as LiveDashboardApp, type AppConnectionInfo } from "./App.js";
import { AiInsightsPage } from "./AiInsightsPage.js";
import { GamesPage } from "./GamesPage.js";
import { LoginPage } from "./LoginPage.js";
import { MarketingPage } from "./MarketingPage.js";
import { PlayersPage } from "./PlayersPage.js";
import { apiBase, apiKeyHeader, clearAuthSession, generateConnectionCode, normalizeConnectionCode, operatorBase, readStoredAuthSession, resolveActiveSchoolId } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute, type AppRoute } from "./routes.js";
import { SetupPage } from "./SetupPage.js";
import { StatsOverviewPage } from "./StatsOverviewPage.js";
import { TeamSettingsPage } from "./TeamSettingsPage.js";
import { TrendsPage } from "./TrendsPage.js";
import { TutorialOverlay } from "./TutorialOverlay.js";

function normalizeConnectionId(value: string | null | undefined): string {
  return normalizeConnectionCode(value);
}

function buildOperatorConsoleUrl(connectionId: string): string {
  const params = new URLSearchParams(window.location.search);
  const storedConnectionId = normalizeConnectionId(localStorage.getItem("coach-bound-connection-id"));
  const resolvedConnectionId = normalizeConnectionId(params.get("connectionId")) || connectionId || storedConnectionId;
  const schoolId = resolveActiveSchoolId();
  if (resolvedConnectionId) {
    params.set("connectionId", resolvedConnectionId);
  }
  if (schoolId) {
    params.set("schoolId", schoolId);
  } else {
    params.delete("schoolId");
  }
  return `${operatorBase.replace(/\/+$/, "")}/?${params.toString()}`;
}

export function UnifiedCoachApp() {
  const initialConnectionId = normalizeConnectionId(new URLSearchParams(window.location.search).get("connectionId")) || normalizeConnectionId(localStorage.getItem("coach-bound-connection-id")) || generateConnectionCode();
  const initialAuthSession = readStoredAuthSession();
  const [route, setRoute] = useState<AppRoute>(() => resolveCoachRoute(window.location.pathname));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => Boolean(initialAuthSession?.token));
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
    if (route === "marketing") {
      return;
    }

    let cancelled = false;

    async function loadSetupState() {
      try {
        const [sessionResponse, onboardingResponse] = await Promise.all([
          fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/onboarding/state`, { headers: apiKeyHeader() }),
        ]);

        const sessionPayload = sessionResponse.ok
          ? await sessionResponse.json() as { authenticated?: boolean }
          : { authenticated: false };
        const onboardingPayload = onboardingResponse.ok
          ? await onboardingResponse.json() as { completed?: boolean }
          : { completed: false };

        if (!sessionPayload.authenticated) {
          clearAuthSession();
        }

        if (!cancelled) {
          const authenticated = Boolean(sessionPayload.authenticated);
          setIsAuthenticated(authenticated);
          setRequiresSetup(!authenticated || !Boolean(onboardingPayload.completed));
        }
      } catch {
        if (!cancelled) {
          const storedSession = readStoredAuthSession();
          setIsAuthenticated(Boolean(storedSession?.token));
          setRequiresSetup(!Boolean(storedSession?.token));
        }
      }
    }

    void loadSetupState();
    return () => {
      cancelled = true;
    };
  }, [route]);

  useEffect(() => {
    if (!requiresSetup) {
      return;
    }

    if (route === "marketing" || route === "login" || route === "setup") {
      return;
    }

    const targetPath = isAuthenticated ? "/setup" : "/login";
    window.history.replaceState({}, "", targetPath);
    setRoute(resolveCoachRoute(targetPath));
  }, [isAuthenticated, requiresSetup, route]);

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
    const normalizedConnectionId = normalizeConnectionId(info.connectionId) || generateConnectionCode();
    setConnectionInfo({
      ...info,
      connectionId: normalizedConnectionId,
      operatorConsoleUrl: info.operatorConsoleUrl || buildOperatorConsoleUrl(normalizedConnectionId),
    });
  }, []);

  const handleAuthSuccess = useCallback((setupComplete: boolean) => {
    setIsAuthenticated(true);
    setRequiresSetup(!setupComplete);
    const nextPath = setupComplete ? "/live" : "/setup";
    window.history.replaceState({}, "", nextPath);
    setRoute(resolveCoachRoute(nextPath));
  }, []);

  function navigate(nextPath: string) {
    const isPublicPath = nextPath === "/" || nextPath === "/login";

    if (requiresSetup && !isAuthenticated && !isPublicPath && nextPath !== "/setup") {
      nextPath = "/login";
    }

    if (requiresSetup && isAuthenticated && !isPublicPath && nextPath !== "/setup") {
      nextPath = "/setup";
    }

    if (window.location.pathname === nextPath) {
      return;
    }
    window.history.pushState({}, "", nextPath);
    setRoute(resolveCoachRoute(nextPath));
  }

  if (route === "marketing") {
    return <MarketingPage onNavigate={navigate} isAuthenticated={Boolean(isAuthenticated)} />;
  }

  if (route === "login") {
    return (
      <LoginPage
        onBackHome={() => navigate("/")}
        onCreateAccount={() => navigate("/setup")}
        onSuccess={handleAuthSuccess}
      />
    );
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
          setIsAuthenticated(true);
          setRequiresSetup(false);
          window.history.replaceState({}, "", "/live");
          setRoute("live");
        }}
      />
    );
  }

  const isLive = route === "live";
  const operatorConsoleUrl = connectionInfo.operatorConsoleUrl || buildOperatorConsoleUrl(connectionInfo.connectionId);
  const currentAuthSession = readStoredAuthSession();

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
            {currentAuthSession?.email && (
              <span className="coach-nav-ext-link coach-nav-email-pill" title={currentAuthSession.email}>
                {currentAuthSession.email}
              </span>
            )}
            <button
              type="button"
              className="coach-nav-ext-link"
              onClick={() => {
                clearAuthSession();
                setIsAuthenticated(false);
                setRequiresSetup(true);
                window.history.replaceState({}, "", "/login");
                setRoute("login");
              }}
            >
              Sign Out
            </button>
            <button
              type="button"
              className="coach-nav-ext-link"
              onClick={() => {
                if (!connectionInfo.connectionId) {
                  return;
                }
                void navigator.clipboard?.writeText(connectionInfo.connectionId);
              }}
              title="Copy the 6-digit operator code"
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
              <label className="connection-pill-editor" title="Operator pairing code">
                <span className="connection-pill-label">Code</span>
                <input
                  className="connection-pill-input"
                  value={connectionInfo.connectionId}
                  readOnly
                  placeholder="6-digit code"
                  aria-label="Connection code"
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
