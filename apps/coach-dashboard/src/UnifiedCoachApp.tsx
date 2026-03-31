import { useEffect, useState } from "react";
import { App as LiveDashboardApp } from "./App.js";
import { AiInsightsPage } from "./AiInsightsPage.js";
import { GamesPage } from "./GamesPage.js";
import { PlayersPage } from "./PlayersPage.js";
import { apiBase, apiKeyHeader } from "./platform.js";
import { canonicalizeCoachPath, resolveCoachRoute, type AppRoute } from "./routes.js";
import { SetupPage } from "./SetupPage.js";
import { StatsOverviewPage } from "./StatsOverviewPage.js";
import { TeamSettingsPage } from "./TeamSettingsPage.js";
import { TrendsPage } from "./TrendsPage.js";

function RouteLink({ href, active, children, onNavigate }: { href: string; active: boolean; children: string; onNavigate: (href: string) => void }) {
  return (
    <button
      type="button"
      className={`shell-nav-link ${active ? "shell-nav-link-active" : ""}`}
      onClick={() => onNavigate(href)}
    >
      {children}
    </button>
  );
}

function StatsShell({ route, onNavigate }: { route: AppRoute; onNavigate: (href: string) => void }) {
  return (
    <div className="shell-page">
      <nav className="shell-nav">
        <div>
          <p className="shell-nav-eyebrow">Bench IQ</p>
          <h2>Coach Workspace</h2>
        </div>
        <div className="shell-nav-links">
          <RouteLink href="/live" active={route === "live"} onNavigate={onNavigate}>Live</RouteLink>
          <RouteLink href="/stats" active={route === "stats-overview"} onNavigate={onNavigate}>Overview</RouteLink>
          <RouteLink href="/stats/games" active={route === "stats-games"} onNavigate={onNavigate}>Games</RouteLink>
          <RouteLink href="/stats/players" active={route === "stats-players"} onNavigate={onNavigate}>Players</RouteLink>
          <RouteLink href="/stats/trends" active={route === "stats-trends"} onNavigate={onNavigate}>Trends</RouteLink>
          <RouteLink href="/stats/insights" active={route === "stats-insights"} onNavigate={onNavigate}>AI Insights</RouteLink>
          <RouteLink href="/stats/settings" active={route === "stats-settings"} onNavigate={onNavigate}>Settings</RouteLink>
        </div>
      </nav>

      {route === "stats-games" && <GamesPage />}
      {route === "stats-players" && <PlayersPage />}
      {route === "stats-trends" && <TrendsPage />}
      {route === "stats-insights" && <AiInsightsPage />}
      {route === "stats-settings" && <TeamSettingsPage />}
      {route === "stats-overview" && <StatsOverviewPage />}
    </div>
  );
}

export function UnifiedCoachApp() {
  const [route, setRoute] = useState<AppRoute>(() => resolveCoachRoute(window.location.pathname));
  const [requiresSetup, setRequiresSetup] = useState<boolean | null>(null);

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
      <div className="shell-page">
        <SetupPage
          onComplete={() => {
            setRequiresSetup(false);
            window.history.replaceState({}, "", "/live");
            setRoute("live");
          }}
        />
      </div>
    );
  }

  if (route === "live") {
    return <LiveDashboardApp />;
  }

  return <StatsShell route={route} onNavigate={navigate} />;
}
