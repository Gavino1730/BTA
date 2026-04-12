import { useCallback, useEffect, useRef, useState } from "react";
import { AccountPage } from "./AccountPage.js";
import { GameSessionProvider, useGameSession } from "./GameSessionContext.js";
import { LivePage } from "./LivePage.js";
import { AiInsightsPage } from "./AiInsightsPage.js";
import { ForgotPasswordPage } from "./ForgotPasswordPage.js";
import { ForbiddenPage, NotFoundPage, OfflinePage, ServerErrorPage, SessionExpiredPage, UnauthorizedPage } from "./ErrorStatePages.js";
import { GamesPage } from "./GamesPage.js";
import { LoginPage } from "./LoginPage.js";
import { NotificationsPage } from "./NotificationsPage.js";
import { PlayersPage } from "./PlayersPage.js";
import { apiBase, apiKeyHeader, clearAuthSession, decodeTokenExpiryMs, fetchBillingEntitlement, generateConnectionCode, marketingBase, normalizeConnectionCode, readStoredAuthSession, storeAuthSession, type BillingEntitlement } from "./platform.js";
import { AdminPage, BillingPage, CheckoutCancelPage, CheckoutSuccessPage, ContactPage, DataDeletionPage, DemoBookingPage, EmailVerificationPage, InviteAcceptancePage, SupportPage, UserSettingsPage } from "./RouteShellPages.js";
import { ResetPasswordPage } from "./ResetPasswordPage.js";
import { canonicalizeCoachPath, resolveCoachRoute, type AppRoute } from "./routes.js";
import { seoForRoute } from "./seo.js";
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

const PUBLIC_ROUTES: ReadonlySet<AppRoute> = new Set([
  "invite-accept",
  "email-verify",
  "login",
  "forgot-password",
  "reset-password",
  "support",
  "contact",
  "book-demo",
  "data-deletion",
  "not-found",
  "forbidden",
  "unauthorized",
  "server-error",
  "offline",
  "session-expired",
  "checkout-success",
  "checkout-cancel",
]);

function isPublicRoute(route: AppRoute): boolean {
  return PUBLIC_ROUTES.has(route);
}

const PAYWALL_EXEMPT_ROUTES: ReadonlySet<AppRoute> = new Set([
  "login",
  "invite-accept",
  "email-verify",
  "forgot-password",
  "reset-password",
  "support",
  "contact",
  "book-demo",
  "data-deletion",
  "not-found",
  "forbidden",
  "unauthorized",
  "server-error",
  "offline",
  "session-expired",
  "checkout-success",
  "checkout-cancel",
  "setup",
  "account",
  "billing",
]);

function isPaywallExemptRoute(route: AppRoute): boolean {
  return PAYWALL_EXEMPT_ROUTES.has(route);
}

function upsertMeta(selector: string, attrs: Record<string, string>, content: string) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    Object.entries(attrs).forEach(([key, value]) => element?.setAttribute(key, value));
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function buildAuthPath(path: "/login" | "/forgot-password", email?: string): string {
  const normalizedEmail = (email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    return path;
  }

  const params = new URLSearchParams({ email: normalizedEmail });
  return `${path}?${params.toString()}`;
}

interface AppFooterProps {
  onNavigate: (path: string) => void;
}

function AppFooter({ onNavigate }: AppFooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="coach-app-footer">
      <div className="coach-app-footer-inner">
        <span className="coach-app-footer-brand">BTA Courtside</span>
        <nav className="coach-app-footer-links" aria-label="App footer links">
          <button type="button" onClick={() => onNavigate("/live")}>Live</button>
          <button type="button" onClick={() => onNavigate("/stats")}>Overview</button>
          <button type="button" onClick={() => onNavigate("/stats/games")}>Games</button>
          <button type="button" onClick={() => onNavigate("/stats/players")}>Players</button>
          <button type="button" onClick={() => onNavigate("/notifications")}>Notifications</button>
          <button type="button" onClick={() => onNavigate("/account")}>Account</button>
          <button type="button" onClick={() => onNavigate("/settings")}>Settings</button>
          <button type="button" onClick={() => onNavigate("/billing")}>Billing</button>
          <button type="button" onClick={() => onNavigate("/admin")}>Admin</button>
        </nav>
        <span className="coach-app-footer-meta">© {currentYear} BTA Courtside · Preproduction</span>
      </div>
    </footer>
  );
}

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
  const [billingEntitlement, setBillingEntitlement] = useState<BillingEntitlement | null>(null);

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
    const seo = seoForRoute(route);
    const canonicalUrl = `${window.location.origin}${seo.path}`;
    const imageUrl = `${window.location.origin}${seo.imagePath}`;
    document.title = seo.title;

    upsertMeta("meta[name='description']", { name: "description" }, seo.description);
    upsertMeta("meta[name='robots']", { name: "robots" }, seo.robots);
    upsertMeta("meta[property='og:title']", { property: "og:title" }, seo.title);
    upsertMeta("meta[property='og:description']", { property: "og:description" }, seo.description);
    upsertMeta("meta[property='og:url']", { property: "og:url" }, canonicalUrl);
    upsertMeta("meta[property='og:image']", { property: "og:image" }, imageUrl);
    upsertMeta("meta[name='twitter:title']", { name: "twitter:title" }, seo.title);
    upsertMeta("meta[name='twitter:description']", { name: "twitter:description" }, seo.description);
    upsertMeta("meta[name='twitter:image']", { name: "twitter:image" }, imageUrl);

    let canonical = document.head.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);

    let structuredData = document.head.querySelector("script[data-bta-seo='jsonld']") as HTMLScriptElement | null;
    if (seo.structuredData) {
      if (!structuredData) {
        structuredData = document.createElement("script");
        structuredData.setAttribute("type", "application/ld+json");
        structuredData.setAttribute("data-bta-seo", "jsonld");
        document.head.appendChild(structuredData);
      }
      structuredData.text = JSON.stringify(seo.structuredData);
    } else if (structuredData) {
      structuredData.remove();
    }
  }, [route]);

  useEffect(() => {
    if (isPublicRoute(route)) {
      return;
    }

    let cancelled = false;

    async function loadSetupState() {
      try {
        const [sessionResponse, onboardingResponse, entitlement] = await Promise.all([
          fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/onboarding/state`, { headers: apiKeyHeader() }),
          fetchBillingEntitlement(),
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
          setBillingEntitlement(entitlement);
        }
      } catch {
        if (!cancelled) {
          const storedSession = readStoredAuthSession();
          setIsAuthenticated(Boolean(storedSession?.token));
          setCurrentRole(normalizeUserRole(storedSession?.role));
          setRequiresSetup(!Boolean(storedSession?.token));
          setBillingEntitlement(null);
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

    if (isPublicRoute(route) || route === "setup") {
      return;
    }

    const targetPath = isAuthenticated ? "/setup" : "/login";
    window.history.replaceState({}, "", targetPath);
    setRoute(resolveCoachRoute(targetPath));
  }, [isAuthenticated, requiresSetup, route]);

  useEffect(() => {
    if (!isAuthenticated || requiresSetup) {
      return;
    }

    if (!billingEntitlement?.paywallEnabled || billingEntitlement.accessActive) {
      return;
    }

    if (isPaywallExemptRoute(route)) {
      return;
    }

    window.history.replaceState({}, "", "/billing");
    setRoute("billing");
  }, [billingEntitlement, isAuthenticated, requiresSetup, route]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (route !== "login" && route !== "forgot-password" && route !== "reset-password") {
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
        navigate("/session-expired");
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

    if (route !== "live" && route !== "stats-settings" && route !== "org-settings" && route !== "setup") {
      return;
    }

    window.history.replaceState({}, "", "/stats");
    setRoute("stats-overview");
  }, [currentRole, isAuthenticated, requiresSetup, route]);

  function navigate(nextPath: string) {
    const publicPaths = new Set([
      "/",
      "/support",
      "/contact",
      "/book-demo",
      "/data-deletion",
      "/invite/accept",
      "/verify-email",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/404",
      "/403",
      "/unauthorized",
      "/500",
      "/offline",
      "/session-expired",
      "/checkout/success",
      "/checkout/cancel",
    ]);
    const targetUrl = new URL(nextPath, window.location.origin);
    const targetPathname = canonicalizeCoachPath(targetUrl.pathname);
    const normalizedNextPath = `${targetPathname}${targetUrl.search}`;
    const isPublicPath = publicPaths.has(targetPathname);

    if (requiresSetup && !isAuthenticated && !isPublicPath && targetPathname !== "/setup") {
      nextPath = "/login";
    } else {
      nextPath = normalizedNextPath;
    }

    if (requiresSetup && isAuthenticated && !isPublicPath && targetPathname !== "/setup") {
      nextPath = "/setup";
    }

    if (isAuthenticated && !requiresSetup && isPlayerRole(currentRole) && (targetPathname === "/live" || targetPathname === "/stats/settings" || targetPathname === "/org/settings" || targetPathname === "/setup")) {
      nextPath = "/stats";
    }

    const targetRoute = resolveCoachRoute(targetPathname);
    const paywallBlocks = Boolean(
      isAuthenticated
      && !requiresSetup
      && billingEntitlement?.paywallEnabled
      && !billingEntitlement.accessActive
      && !isPaywallExemptRoute(targetRoute)
    );

    if (paywallBlocks) {
      nextPath = "/billing";
    }

    const currentLocation = `${window.location.pathname}${window.location.search}`;
    if (currentLocation === nextPath) {
      return;
    }

    window.history.pushState({}, "", nextPath);
    setRoute(resolveCoachRoute(new URL(nextPath, window.location.origin).pathname));
  }
  if (route === "login") {
    return (
      <LoginPage
        onBackHome={() => { window.location.assign(marketingBase); }}
        onCreateAccount={() => navigate("/setup")}
        onForgotPassword={(email) => navigate(buildAuthPath("/forgot-password", email))}
        onAcceptInvite={() => navigate("/invite/accept")}
        onVerifyEmail={() => navigate("/verify-email")}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (route === "invite-accept") {
    return <InviteAcceptancePage onNavigate={navigate} />;
  }

  if (route === "email-verify") {
    return <EmailVerificationPage onNavigate={navigate} />;
  }

  if (route === "forgot-password") {
    return (
      <ForgotPasswordPage
        onBackHome={() => { window.location.assign(marketingBase); }}
        onBackLogin={(email) => navigate(buildAuthPath("/login", email))}
        onAcceptInvite={() => navigate("/invite/accept")}
        onVerifyEmail={() => navigate("/verify-email")}
      />
    );
  }

  if (route === "reset-password") {
    return (
      <ResetPasswordPage
        onBackForgot={() => navigate("/forgot-password")}
        onBackLogin={() => navigate("/login")}
      />
    );
  }

  if (route === "not-found") {
    return <NotFoundPage onNavigate={navigate} />;
  }

  if (route === "forbidden") {
    return <ForbiddenPage onNavigate={navigate} />;
  }

  if (route === "unauthorized") {
    return <UnauthorizedPage onNavigate={navigate} />;
  }

  if (route === "server-error") {
    return <ServerErrorPage onNavigate={navigate} />;
  }

  if (route === "offline") {
    return <OfflinePage onNavigate={navigate} />;
  }

  if (route === "session-expired") {
    return <SessionExpiredPage onNavigate={navigate} />;
  }

  if (route === "checkout-success") {
    return <CheckoutSuccessPage onNavigate={navigate} />;
  }

  if (route === "checkout-cancel") {
    return <CheckoutCancelPage onNavigate={navigate} />;
  }

  if (route === "support") {
    return <SupportPage onNavigate={navigate} />;
  }

  if (route === "contact") {
    return <ContactPage onNavigate={navigate} />;
  }

  if (route === "book-demo") {
    return <DemoBookingPage onNavigate={navigate} />;
  }

  if (route === "data-deletion") {
    return <DataDeletionPage onNavigate={navigate} />;
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
    const isActive = route === targetRoute || (targetRoute === "stats-settings" && route === "org-settings");

    return (
      <li key={targetRoute}>
        <button
          type="button"
          className={isActive ? "nav-active" : ""}
          onClick={() => navigate(path)}
        >
          {label}
        </button>
      </li>
    );
  }

  return (
    <GameSessionProvider>
      <div className="coach-app-shell">
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
              {navBtn("Notifications", "stats-notifications", "/notifications")}
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
        <main className="coach-app-main">
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
          {route === "stats-notifications" && <NotificationsPage onNavigate={navigate} />}
          {route === "stats-settings" && <TeamSettingsPage onNavigate={navigate} />}
          {route === "org-settings" && <TeamSettingsPage initialSection="profile" onNavigate={navigate} />}
          {route === "account" && (
            <AccountPage
              onSessionUpdated={(role) => setCurrentRole(normalizeUserRole(role))}
              onSignOutRequested={() => {
                clearAuthSession();
                setIsAuthenticated(false);
                setCurrentRole(null);
                setRequiresSetup(true);
                window.history.replaceState({}, "", "/login");
                setRoute("login");
              }}
            />
          )}
          {route === "billing" && <BillingPage onNavigate={navigate} />}
          {route === "admin" && <AdminPage onNavigate={navigate} />}
          {route === "settings" && <UserSettingsPage onNavigate={navigate} />}
        </main>
        <AppFooter onNavigate={navigate} />
      </div>
    </GameSessionProvider>
  );
}
