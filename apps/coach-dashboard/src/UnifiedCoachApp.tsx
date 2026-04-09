import { useCallback, useEffect, useRef, useState } from "react";
import { AccountPage } from "./AccountPage.js";
import { GameSessionProvider, useGameSession } from "./GameSessionContext.js";
import { LivePage } from "./LivePage.js";
import { AiInsightsPage } from "./AiInsightsPage.js";
import { GamesPage } from "./GamesPage.js";
import { LoginPage } from "./LoginPage.js";
import { DemoPage, MarketingPage } from "./MarketingPage.js";
import { PlayersPage } from "./PlayersPage.js";
import { apiBase, apiKeyHeader, clearAuthSession, decodeTokenExpiryMs, generateConnectionCode, normalizeConnectionCode, readStoredAuthSession, storeAuthSession } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute, type AppRoute } from "./routes.js";
import { SetupPage } from "./SetupPage.js";
import { StatsOverviewPage } from "./StatsOverviewPage.js";
import { TeamSettingsPage } from "./TeamSettingsPage.js";
import { TrendsPage } from "./TrendsPage.js";
import { TutorialOverlay } from "./TutorialOverlay.js";

function normalizeConnectionId(value: string | null | undefined): string {
  return normalizeConnectionCode(value);
}

function normalizeUserRole(role: string | null | undefined): string | null {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized || null;
}

function isPlayerRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "player";
}

const SESSION_WARNING_WINDOW_MS = 5 * 60 * 1000;

interface SessionCheckPayload {
  authenticated?: boolean;
  token?: string | null;
  user?: {
    email?: string;
    fullName?: string;
    role?: string;
    schoolId?: string;
    lastLoginAtIso?: string | null;
  } | null;
  onboarding?: {
    completed?: boolean;
  } | null;
}

interface ConnectedNavActionsProps {
  onSignOut: () => void;
  onOpenAccount: () => void;
  onShowTutorial: () => void;
  hideLiveTools?: boolean;
}

function ConnectedNavActions({ onSignOut, onOpenAccount, onShowTutorial, hideLiveTools = false }: ConnectedNavActionsProps) {
  const {
    connectionId,
    deviceConnected,
    serverConnected,
    operatorConsoleUrl,
    hasGameStarted,
  } = useGameSession();
  const [codeCopied, setCodeCopied] = useState(false);
  const scoreOperatorUrl = hasGameStarted
    ? operatorConsoleUrl
    : operatorConsoleUrl.split("?")[0] ?? operatorConsoleUrl;

  function handleCopyCode() {
    if (!connectionId) return;
    void navigator.clipboard?.writeText(connectionId).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  return (
    <>
      {!hideLiveTools && (
        <button
          type="button"
          className={`connection-pill ${deviceConnected ? "online" : "offline"}`}
          style={{ flexShrink: 0, cursor: "pointer" }}
          onClick={handleCopyCode}
          title={codeCopied ? "Copied!" : "Click to copy operator code"}
          aria-label={codeCopied ? "Code copied" : `Copy operator code ${connectionId}`}
        >
          <span className="connection-pill-dot" aria-hidden="true" />
          <span className="connection-pill-status">
            {codeCopied ? "Copied!" : deviceConnected ? "Live" : serverConnected ? "Waiting" : "Offline"}
          </span>
          {!codeCopied && (
            <>
              <span className="connection-pill-sep" aria-hidden="true">·</span>
              <span className="connection-pill-code">
                {connectionId}
              </span>
            </>
          )}
        </button>
      )}
      {!hideLiveTools && (
        <>
          <a href={scoreOperatorUrl} className="coach-nav-ext-link" target="_blank" rel="noreferrer">
            Score Operator
          </a>
        </>
      )}
      <button
        type="button"
        className="coach-nav-ext-link"
        onClick={onOpenAccount}
      >
        My Account
      </button>
      <button
        type="button"
        className="coach-nav-ext-link"
        onClick={onSignOut}
      >
        Sign Out
      </button>
      <button
        type="button"
        onClick={onShowTutorial}
        title="Help &amp; Tutorial"
        aria-label="Open help and tutorial"
        className="coach-nav-help-button"
      >?</button>
    </>
  );
}

export function UnifiedCoachApp() {
  // useRef for one-time initializers avoids re-running expensive localStorage
  // reads and generateConnectionCode() on every render.
  const initialConnectionId = useRef(
    normalizeConnectionId(new URLSearchParams(window.location.search).get("connectionId"))
    || normalizeConnectionId(localStorage.getItem("coach-bound-connection-id"))
    || generateConnectionCode()
  ).current;
  const initialAuthSession = useRef(readStoredAuthSession()).current;
  const [route, setRoute] = useState<AppRoute>(() => resolveCoachRoute(window.location.pathname));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => Boolean(initialAuthSession?.token));
  const [currentRole, setCurrentRole] = useState<string | null>(() => normalizeUserRole(initialAuthSession?.role));
  const [requiresSetup, setRequiresSetup] = useState<boolean | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("coach:tutorial-complete"));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [sessionRefreshStatus, setSessionRefreshStatus] = useState("");
  const [dismissedExpiryAtMs, setDismissedExpiryAtMs] = useState<number | null>(null);

  const currentSession = readStoredAuthSession();
  const sessionExpiryAtMs = decodeTokenExpiryMs(currentSession?.token);
  const msUntilExpiry = sessionExpiryAtMs === null ? null : sessionExpiryAtMs - nowMs;
  const showSessionExpiryWarning = Boolean(
    isAuthenticated
    && sessionExpiryAtMs !== null
    && msUntilExpiry !== null
    && msUntilExpiry <= SESSION_WARNING_WINDOW_MS
    && dismissedExpiryAtMs !== sessionExpiryAtMs,
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (dismissedExpiryAtMs !== null && dismissedExpiryAtMs !== sessionExpiryAtMs) {
      setDismissedExpiryAtMs(null);
    }
  }, [dismissedExpiryAtMs, sessionExpiryAtMs]);

  useEffect(() => {
    const canonicalPath = canonicalizeCoachPath(window.location.pathname);
    if (canonicalPath !== window.location.pathname) {
      window.history.replaceState({}, "", canonicalPath);
      setRoute(resolveCoachRoute(canonicalPath));
    }
  }, []);

  useEffect(() => {
    if (route === "marketing" || route === "demo") {
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
          ? await sessionResponse.json() as SessionCheckPayload
          : null;
        const onboardingPayload = onboardingResponse.ok
          ? await onboardingResponse.json() as { completed?: boolean }
          : { completed: false };

        // Only clear the stored session when the server explicitly confirms the
        // token is invalid (200 OK + authenticated: false).  Non-OK responses
        // (server errors, network not yet ready after iPad wakeup) should keep
        // the stored session so the user isn't forced to log in again.
        if (sessionPayload !== null && !sessionPayload.authenticated) {
          clearAuthSession();
        }

        if (!cancelled) {
          // If the server returned a non-OK response (sessionPayload is null),
          // fall back to the stored session token so the user stays logged in.
          const storedSession = sessionPayload === null ? readStoredAuthSession() : null;
          const authenticated = sessionPayload !== null
            ? Boolean(sessionPayload.authenticated)
            : Boolean(storedSession?.token);
          const sessionRole = sessionPayload?.user?.role ?? storedSession?.role ?? null;
          setIsAuthenticated(authenticated);
          setCurrentRole(normalizeUserRole(sessionRole));
          setRequiresSetup(!authenticated || !Boolean(onboardingPayload.completed));
        }
      } catch {
        if (!cancelled) {
          const storedSession = readStoredAuthSession();
          setIsAuthenticated(Boolean(storedSession?.token));
          setCurrentRole(normalizeUserRole(storedSession?.role));
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

    if (route === "marketing" || route === "login" || route === "setup" || route === "demo") {
      return;
    }

    const targetPath = isAuthenticated ? "/setup" : "/login";
    window.history.replaceState({}, "", targetPath);
    setRoute(resolveCoachRoute(targetPath));
  }, [isAuthenticated, requiresSetup, route]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (route !== "marketing" && route !== "login") {
      return;
    }

    const targetPath = requiresSetup ? "/setup" : "/live";
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

  const handleAuthSuccess = useCallback((setupComplete: boolean) => {
    const stored = readStoredAuthSession();
    setIsAuthenticated(true);
    setCurrentRole(normalizeUserRole(stored?.role));
    setRequiresSetup(!setupComplete);
    const nextPath = setupComplete ? "/live" : "/setup";
    window.history.replaceState({}, "", nextPath);
    setRoute(resolveCoachRoute(nextPath));
  }, []);

  async function handleStaySignedIn() {
    setRefreshingSession(true);
    setSessionRefreshStatus("Refreshing session...");
    try {
      const response = await fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() });
      if (!response.ok) {
        throw new Error("Session refresh failed.");
      }

      const payload = await response.json() as SessionCheckPayload;
      if (!payload.authenticated) {
        clearAuthSession();
        setSessionRefreshStatus("Session expired. Please sign in again.");
        navigate("/login");
        return;
      }

      if (payload.token && payload.user) {
        storeAuthSession({
          token: payload.token,
          email: payload.user.email,
          fullName: payload.user.fullName,
          role: payload.user.role,
          schoolId: payload.user.schoolId,
          lastLoginAtIso: payload.user.lastLoginAtIso ?? null,
        });
        setSessionRefreshStatus("Session extended.");
        setDismissedExpiryAtMs(null);
        setNowMs(Date.now());
        return;
      }

      setSessionRefreshStatus("Session checked. Sign in again soon to stay active.");
    } catch {
      setSessionRefreshStatus("Could not refresh session right now.");
    } finally {
      setRefreshingSession(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated || requiresSetup) {
      return;
    }

    if (!isPlayerRole(currentRole)) {
      return;
    }

    if (route !== "live" && route !== "stats-settings" && route !== "setup") {
      return;
    }

    window.history.replaceState({}, "", "/stats");
    setRoute("stats-overview");
  }, [currentRole, isAuthenticated, requiresSetup, route]);

  function navigate(nextPath: string) {
    const isPublicPath = nextPath === "/" || nextPath === "/login" || nextPath === "/demo";

    if (requiresSetup && !isAuthenticated && !isPublicPath && nextPath !== "/setup") {
      nextPath = "/login";
    }

    if (requiresSetup && isAuthenticated && !isPublicPath && nextPath !== "/setup") {
      nextPath = "/setup";
    }

    if (isAuthenticated && !requiresSetup && isPlayerRole(currentRole) && (nextPath === "/live" || nextPath === "/stats/settings" || nextPath === "/setup")) {
      nextPath = "/stats";
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

  if (route === "demo") {
    return <DemoPage onNavigate={navigate} />;
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
  const playerView = isPlayerRole(currentRole);

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
    <GameSessionProvider>
      {showTutorial && (
        <TutorialOverlay onDismiss={() => setShowTutorial(false)} />
      )}
      <nav className="coach-navbar">
        <div className="coach-nav-container">
          <ul className="coach-nav-links">
            {!playerView && navBtn("Live", "live", "/live")}
            {navBtn("Overview", "stats-overview", "/stats")}
            {navBtn("Games", "stats-games", "/stats/games")}
            {navBtn("Players", "stats-players", "/stats/players")}
            {navBtn("Trends", "stats-trends", "/stats/trends")}
            {navBtn("AI Insights", "stats-insights", "/stats/insights")}
            {!playerView && navBtn("Settings", "stats-settings", "/stats/settings")}
          </ul>
          <div className="coach-nav-actions">
            <ConnectedNavActions
              hideLiveTools={playerView}
              onOpenAccount={() => navigate("/account")}
              onSignOut={() => {
                clearAuthSession();
                setIsAuthenticated(false);
                setCurrentRole(null);
                setRequiresSetup(true);
                window.history.replaceState({}, "", "/login");
                setRoute("login");
              }}
              onShowTutorial={() => setShowTutorial(true)}
            />
          </div>
        </div>
      </nav>
      {showSessionExpiryWarning && (
        <section className="session-expiry-banner" role="status" aria-live="polite">
          <div className="session-expiry-banner-content">
            <p>
              {msUntilExpiry !== null && msUntilExpiry > 0
                ? `Session expires in ${Math.max(1, Math.ceil(msUntilExpiry / 60000))} minute${Math.ceil(msUntilExpiry / 60000) === 1 ? "" : "s"}.`
                : "Session expired. Sign in again to continue."}
            </p>
            <div className="session-expiry-actions">
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => void handleStaySignedIn()}
                disabled={refreshingSession}
              >
                {refreshingSession ? "Refreshing..." : "Stay Signed In"}
              </button>
              <button
                type="button"
                className="coach-nav-ext-link"
                onClick={() => navigate("/login")}
              >
                Sign In Again
              </button>
              <button
                type="button"
                className="coach-nav-ext-link"
                onClick={() => setDismissedExpiryAtMs(sessionExpiryAtMs)}
              >
                Dismiss
              </button>
            </div>
          </div>
          {sessionRefreshStatus && <p className="session-expiry-status">{sessionRefreshStatus}</p>}
        </section>
      )}
      {isLive && <LivePage />}
      {route === "stats-overview" && <StatsOverviewPage />}
      {route === "stats-games" && <GamesPage />}
      {route === "stats-players" && <PlayersPage />}
      {route === "stats-trends" && <TrendsPage />}
      {route === "stats-insights" && <AiInsightsPage />}
      {route === "stats-settings" && <TeamSettingsPage />}
      {route === "account" && <AccountPage onSessionUpdated={(role) => setCurrentRole(normalizeUserRole(role))} />}
    </GameSessionProvider>
  );
}
