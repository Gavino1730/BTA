import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameSessionProvider } from "./GameSessionContext.js";
import { ForgotPasswordPage } from "./ForgotPasswordPage.js";
import { LivePage } from "./LivePage.js";
import { AiInsightsPage } from "./AiInsightsPage.js";
import { GamesPage } from "./GamesPage.js";
import { LoginPage } from "./LoginPage.js";
import { PlayersPage } from "./PlayersPage.js";
import {
  apiBase,
  apiKeyHeader,
  clearAuthSession,
  readStoredAuthSession,
} from "./platform.js";
import { ResetPasswordPage } from "./ResetPasswordPage.js";
import { canonicalizeCoachPath, resolveCoachRoute, type AppRoute } from "./routes.js";
import { SetupPage } from "./SetupPage.js";
import { SchoolOverviewPage } from "./SchoolOverviewPage.js";
import { StatsOverviewPage } from "./StatsOverviewPage.js";
import { TeamSettingsPage } from "./TeamSettingsPage.js";
import { TrendsPage } from "./TrendsPage.js";
import { TutorialOverlay } from "./TutorialOverlay.js";
import { BillingPage } from "./RouteShellPages.js";
import { fetchWorkspaceContext, saveWorkspaceContextPreference, type WorkspaceContext } from "./workspace.js";

function buildSetupPathFromInviteQuery(): string {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get("invite")?.trim() ?? "";
  const email = params.get("email")?.trim() ?? "";
  const schoolId = params.get("schoolId")?.trim() ?? "";
  if (!invite && !email && !schoolId) {
    return "/setup";
  }

  const next = new URLSearchParams();
  if (schoolId) {
    next.set("schoolId", schoolId);
  }
  if (invite) {
    next.set("invite", invite);
  }
  if (email) {
    next.set("email", email);
  }

  return `/setup?${next.toString()}`;
}

function buildContextUrl(pathname: string, input: {
  schoolId?: string;
  teamId?: string;
  contextType?: "school" | "team" | null;
}): string {
  const [basePath] = pathname.split("?");
  if (basePath === "/" || basePath === "/login" || basePath === "/forgot-password" || basePath === "/reset-password" || basePath === "/demo" || basePath === "/setup") {
    return pathname;
  }

  const params = new URLSearchParams();
  if (input.schoolId) {
    params.set("schoolId", input.schoolId);
  }
  if (input.contextType === "team" && input.teamId) {
    params.set("teamId", input.teamId);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function isPublicRoute(route: AppRoute): boolean {
  return route === "marketing"
    || route === "login"
    || route === "forgot-password"
    || route === "reset-password"
    || route === "setup"
    || route === "demo";
}

function isTeamRoute(route: AppRoute): boolean {
  return route === "live"
    || route === "stats-games"
    || route === "stats-players"
    || route === "stats-trends"
    || route === "stats-insights"
    || route === "stats-settings";
}

function isSchoolAdminContext(context: WorkspaceContext | null, schoolId: string | null): boolean {
  if (!context || !schoolId) {
    return false;
  }

  return context.schoolMemberships.some((membership) =>
    membership.schoolId === schoolId
      && (membership.role === "owner" || membership.role === "school_admin"),
  );
}

interface AuthSessionPayload {
  authenticated?: boolean;
  token?: string | null;
}

function StaticNavActions({
  onSignOut,
  onShowTutorial,
}: {
  onSignOut: () => void;
  onShowTutorial: () => void;
}) {
  return (
    <>
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
        title="Help and Tutorial"
        aria-label="Open help and tutorial"
        className="coach-nav-help-button"
      >
        ?
      </button>
    </>
  );
}

export function UnifiedCoachApp() {
  const initialAuthSession = useRef(readStoredAuthSession()).current;
  const [route, setRoute] = useState<AppRoute>(() => resolveCoachRoute(window.location.pathname));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => Boolean(initialAuthSession?.token));
  const [requiresSetup, setRequiresSetup] = useState<boolean | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activeContextType, setActiveContextType] = useState<"school" | "team" | null>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("coach:tutorial-complete"));

  const canManageSchool = useMemo(
    () => isSchoolAdminContext(workspaceContext, activeSchoolId),
    [workspaceContext, activeSchoolId],
  );

  const activeSchool = useMemo(
    () => workspaceContext?.schools.find((school) => school.schoolId === activeSchoolId) ?? null,
    [workspaceContext, activeSchoolId],
  );

  const activeTeams = useMemo(
    () => workspaceContext?.teams.filter((team) => team.schoolId === activeSchoolId) ?? [],
    [workspaceContext, activeSchoolId],
  );

  const currentTeam = useMemo(
    () => activeTeams.find((team) => team.id === activeTeamId) ?? null,
    [activeTeamId, activeTeams],
  );

  const applyResolvedContext = useCallback((context: WorkspaceContext) => {
    if (context.schools.length === 0) {
      setActiveSchoolId(null);
      setActiveTeamId(null);
      setActiveContextType(null);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const requestedSchoolId = urlParams.get("schoolId")?.trim() ?? "";
    const requestedTeamId = urlParams.get("teamId")?.trim() ?? "";
    const availableSchoolIds = new Set(context.schools.map((school) => school.schoolId));
    const resolvedSchoolId = availableSchoolIds.has(requestedSchoolId)
      ? requestedSchoolId
      : (context.profile?.lastSchoolId && availableSchoolIds.has(context.profile.lastSchoolId))
        ? context.profile.lastSchoolId
        : context.defaultContext.schoolId
          ? context.defaultContext.schoolId
          : context.schools[0]?.schoolId ?? null;

    const schoolTeams = context.teams.filter((team) => team.schoolId === resolvedSchoolId);
    const availableTeamIds = new Set(schoolTeams.map((team) => team.id));
    const resolvedTeamId = availableTeamIds.has(requestedTeamId)
      ? requestedTeamId
      : (context.profile?.lastTeamId && availableTeamIds.has(context.profile.lastTeamId))
        ? context.profile.lastTeamId
        : context.defaultContext.teamId && availableTeamIds.has(context.defaultContext.teamId)
          ? context.defaultContext.teamId
          : schoolTeams[0]?.id ?? null;

    const adminInSchool = context.schoolMemberships.some((membership) =>
      membership.schoolId === resolvedSchoolId
        && (membership.role === "owner" || membership.role === "school_admin"),
    );

    const nextContextType = adminInSchool && context.defaultContext.type === "school"
      ? "school"
      : resolvedTeamId
        ? "team"
        : adminInSchool
          ? "school"
          : null;

    setActiveSchoolId(resolvedSchoolId);
    setActiveTeamId(nextContextType === "team" ? resolvedTeamId : null);
    setActiveContextType(nextContextType);
  }, []);

  const syncWorkspaceState = useCallback(async () => {
    const sessionResponse = await fetch(`${apiBase}/api/auth/session`, { headers: apiKeyHeader() });
    const sessionPayload = sessionResponse.ok
      ? await sessionResponse.json() as AuthSessionPayload
      : null;

    if (sessionPayload !== null && !sessionPayload.authenticated) {
      clearAuthSession();
      setIsAuthenticated(false);
      setRequiresSetup(false);
      setWorkspaceContext(null);
      setActiveSchoolId(null);
      setActiveTeamId(null);
      setActiveContextType(null);
      return;
    }

    const storedSession = readStoredAuthSession();
    const authenticated = sessionPayload !== null
      ? Boolean(sessionPayload.authenticated && (sessionPayload.token || storedSession?.token))
      : Boolean(storedSession?.token);

    setIsAuthenticated(authenticated);
    if (!authenticated) {
      setRequiresSetup(false);
      setWorkspaceContext(null);
      return;
    }

    const context = await fetchWorkspaceContext();
    setWorkspaceContext(context);
    const needsSetup = context.schools.length === 0 || context.teams.length === 0;
    setRequiresSetup(needsSetup);
    applyResolvedContext(context);
  }, [applyResolvedContext]);

  useEffect(() => {
    const canonicalPath = canonicalizeCoachPath(window.location.pathname);
    if (canonicalPath !== window.location.pathname) {
      const nextUrl = buildContextUrl(canonicalPath, {
        schoolId: new URLSearchParams(window.location.search).get("schoolId")?.trim() ?? undefined,
        teamId: new URLSearchParams(window.location.search).get("teamId")?.trim() ?? undefined,
        contextType: new URLSearchParams(window.location.search).get("teamId") ? "team" : "school",
      });
      window.history.replaceState({}, "", nextUrl);
      setRoute(resolveCoachRoute(canonicalPath));
    }
  }, []);

  useEffect(() => {
    if (route === "marketing" || route === "demo" || route === "forgot-password" || route === "reset-password") {
      return;
    }

    void syncWorkspaceState().catch(() => {
      const storedSession = readStoredAuthSession();
      setIsAuthenticated(Boolean(storedSession?.token));
      setRequiresSetup(!Boolean(storedSession?.token));
    });
  }, [route, syncWorkspaceState]);

  useEffect(() => {
    if (!workspaceContext || !activeSchoolId) {
      return;
    }

    const nextUrl = buildContextUrl(window.location.pathname, {
      schoolId: activeSchoolId,
      teamId: activeContextType === "team" ? activeTeamId ?? undefined : undefined,
      contextType: activeContextType,
    });
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState({}, "", nextUrl);
      setRoute(resolveCoachRoute(window.location.pathname));
    }
  }, [activeContextType, activeSchoolId, activeTeamId, workspaceContext]);

  useEffect(() => {
    if (requiresSetup === null || isAuthenticated === null) {
      return;
    }

    if (!isAuthenticated && !isPublicRoute(route)) {
      window.history.replaceState({}, "", "/login");
      setRoute("login");
      return;
    }

    if (isAuthenticated && requiresSetup && route !== "setup") {
      window.history.replaceState({}, "", buildSetupPathFromInviteQuery());
      setRoute("setup");
      return;
    }

    if (isAuthenticated && !requiresSetup && (isPublicRoute(route) || route === "setup")) {
      const targetPath = activeContextType === "school" ? "/stats" : "/live";
      const nextUrl = buildContextUrl(targetPath, {
        schoolId: activeSchoolId ?? undefined,
        teamId: activeContextType === "team" ? activeTeamId ?? undefined : undefined,
        contextType: activeContextType,
      });
      window.history.replaceState({}, "", nextUrl);
      setRoute(resolveCoachRoute(targetPath));
      return;
    }

    if (activeContextType === "school" && isTeamRoute(route)) {
      const nextUrl = buildContextUrl("/stats", {
        schoolId: activeSchoolId ?? undefined,
        contextType: "school",
      });
      window.history.replaceState({}, "", nextUrl);
      setRoute("stats-overview");
    }
  }, [activeContextType, activeSchoolId, activeTeamId, isAuthenticated, requiresSetup, route]);

  useEffect(() => {
    function handlePopState() {
      const canonicalPath = canonicalizeCoachPath(window.location.pathname);
      if (canonicalPath !== window.location.pathname) {
        const nextUrl = buildContextUrl(canonicalPath, {
          schoolId: new URLSearchParams(window.location.search).get("schoolId")?.trim() ?? undefined,
          teamId: new URLSearchParams(window.location.search).get("teamId")?.trim() ?? undefined,
          contextType: new URLSearchParams(window.location.search).get("teamId") ? "team" : "school",
        });
        window.history.replaceState({}, "", nextUrl);
      }
      setRoute(resolveCoachRoute(canonicalPath));
      if (workspaceContext) {
        applyResolvedContext(workspaceContext);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [applyResolvedContext, workspaceContext]);

  const handleAuthSuccess = useCallback(async () => {
    await syncWorkspaceState();
  }, [syncWorkspaceState]);

  const persistContextPreference = useCallback((input: {
    schoolId: string;
    teamId?: string;
    contextType: "school" | "team";
  }) => {
    void saveWorkspaceContextPreference(input).catch(() => undefined);
  }, []);

  const switchToSchool = useCallback((schoolId: string) => {
    setActiveSchoolId(schoolId);
    setActiveTeamId(null);
    setActiveContextType("school");
    persistContextPreference({ schoolId, contextType: "school" });
    const nextUrl = buildContextUrl("/stats", { schoolId, contextType: "school" });
    window.history.pushState({}, "", nextUrl);
    setRoute("stats-overview");
  }, [persistContextPreference]);

  const switchToTeam = useCallback((schoolId: string, teamId: string) => {
    setActiveSchoolId(schoolId);
    setActiveTeamId(teamId);
    setActiveContextType("team");
    persistContextPreference({ schoolId, teamId, contextType: "team" });
  }, [persistContextPreference]);

  function navigate(nextPath: string) {
    let routePath = nextPath.split("?")[0] ?? nextPath;

    if (requiresSetup && !isAuthenticated && !isPublicRoute(resolveCoachRoute(routePath)) && routePath !== "/setup") {
      nextPath = "/login";
      routePath = "/login";
    }

    if (requiresSetup && isAuthenticated && routePath !== "/setup") {
      nextPath = "/setup";
      routePath = "/setup";
    }

    const nextUrl = buildContextUrl(nextPath, {
      schoolId: activeSchoolId ?? undefined,
      teamId: activeContextType === "team" ? activeTeamId ?? undefined : undefined,
      contextType: activeContextType,
    });

    if (`${window.location.pathname}${window.location.search}` === nextUrl) {
      return;
    }

    window.history.pushState({}, "", nextUrl);
    setRoute(resolveCoachRoute(routePath));
  }

  if (route === "marketing" || route === "demo") {
    return (
      <LoginPage
        onBackHome={() => navigate("/")}
        onCreateAccount={() => navigate(buildSetupPathFromInviteQuery())}
        onForgotPassword={() => navigate("/forgot-password")}
        onSuccess={() => void handleAuthSuccess()}
      />
    );
  }

  if (route === "login") {
    return (
      <LoginPage
        onBackHome={() => navigate("/")}
        onCreateAccount={() => navigate(buildSetupPathFromInviteQuery())}
        onForgotPassword={() => navigate("/forgot-password")}
        onSuccess={() => void handleAuthSuccess()}
      />
    );
  }

  if (route === "forgot-password") {
    return (
      <ForgotPasswordPage
        onBackHome={() => navigate("/")}
        onBackLogin={() => navigate("/login")}
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

  if (requiresSetup === null || isAuthenticated === null) {
    return (
      <div className="stats-page">
        <section className="stats-page-card">
          <p className="stats-page-status">Loading workspace...</p>
        </section>
      </div>
    );
  }

  if (route === "setup") {
    return (
      <SetupPage
        onComplete={() => {
          void handleAuthSuccess();
        }}
      />
    );
  }

  if (!workspaceContext || !activeSchoolId || (!activeContextType && !requiresSetup)) {
    return (
      <div className="stats-page">
        <section className="stats-page-card">
          <p className="stats-page-status">Loading workspace context...</p>
        </section>
      </div>
    );
  }

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

  const switcherOptions = [
    ...(canManageSchool && activeSchool ? [{
      label: `${activeSchool.name} Overview`,
      value: `school:${activeSchool.schoolId}`,
    }] : []),
    ...activeTeams.map((team) => ({
      label: team.displayName ?? team.name,
      value: `team:${team.id}`,
    })),
  ];

  const switcherValue = activeContextType === "school"
    ? `school:${activeSchoolId}`
    : activeTeamId
      ? `team:${activeTeamId}`
      : "";

  const gameShellKey = `${activeSchoolId}:${activeContextType}:${activeTeamId ?? "school"}`;

  return (
    <GameSessionProvider key={gameShellKey}>
      {showTutorial ? (
        <TutorialOverlay onDismiss={() => setShowTutorial(false)} />
      ) : null}
      <nav className="coach-navbar">
        <div className="coach-nav-container">
          <div className="coach-nav-actions">
            <select
              value={switcherValue}
              onChange={(event) => {
                const [type, id] = event.target.value.split(":");
                if (type === "school" && id) {
                  switchToSchool(id);
                  return;
                }
                const team = activeTeams.find((entry) => entry.id === id) ?? workspaceContext.teams.find((entry) => entry.id === id);
                if (team?.schoolId) {
                  switchToTeam(team.schoolId, team.id);
                  if (route === "stats-overview" || route === "billing") {
                    navigate("/live");
                  } else {
                    navigate(window.location.pathname);
                  }
                }
              }}
            >
              {switcherOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <ul className="coach-nav-links">
            {activeContextType === "school" ? (
              <>
                {navBtn("Overview", "stats-overview", "/stats")}
                {canManageSchool ? navBtn("Billing", "billing", "/billing") : null}
              </>
            ) : (
              <>
                {navBtn("Live", "live", "/live")}
                {navBtn("Overview", "stats-overview", "/stats")}
                {navBtn("Games", "stats-games", "/stats/games")}
                {navBtn("Players", "stats-players", "/stats/players")}
                {navBtn("Trends", "stats-trends", "/stats/trends")}
                {navBtn("AI Insights", "stats-insights", "/stats/insights")}
                {navBtn("Settings", "stats-settings", "/stats/settings")}
              </>
            )}
          </ul>

          <div className="coach-nav-actions">
            <StaticNavActions
              onSignOut={() => {
                clearAuthSession();
                setIsAuthenticated(false);
                setRequiresSetup(false);
                setWorkspaceContext(null);
                setActiveSchoolId(null);
                setActiveTeamId(null);
                setActiveContextType(null);
                window.history.replaceState({}, "", "/login");
                setRoute("login");
              }}
              onShowTutorial={() => setShowTutorial(true)}
            />
          </div>
        </div>
      </nav>

      {activeContextType === "school" ? (
        <>
          {route === "billing" ? (
            <BillingPage onNavigate={navigate} />
          ) : (
            <SchoolOverviewPage
              schoolId={activeSchoolId}
              canManageSchool={canManageSchool}
              onOpenTeam={(teamId) => {
                switchToTeam(activeSchoolId, teamId);
                navigate("/live");
              }}
            />
          )}
        </>
      ) : (
        <>
          {route === "live" && <LivePage />}
          {route === "stats-overview" && <StatsOverviewPage />}
          {route === "stats-games" && <GamesPage />}
          {route === "stats-players" && <PlayersPage />}
          {route === "stats-trends" && <TrendsPage />}
          {route === "stats-insights" && <AiInsightsPage />}
          {route === "stats-settings" && <TeamSettingsPage />}
          {!currentTeam && route === "billing" ? <BillingPage onNavigate={navigate} /> : null}
        </>
      )}
    </GameSessionProvider>
  );
}
