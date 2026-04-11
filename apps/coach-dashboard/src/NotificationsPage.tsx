import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader, resolveActiveSchoolId } from "./platform.js";

interface GameSummary {
  gameId: string | number;
  date?: string;
  opponent?: string;
  result?: string;
  vc_score?: number;
  opp_score?: number;
}

interface LiveContextPayload {
  gameActive?: boolean;
  sessionId?: string;
  score?: { our?: number; opponent?: number };
  period?: number;
  clock?: string;
  teamName?: string;
  opponentName?: string;
  liveInsights?: string[];
}

interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  level: "info" | "warning" | "success";
  timestampLabel: string;
}

interface ApiNotificationItem {
  id?: string;
  category?: "system" | "membership" | "results";
  level?: "info" | "warning" | "success";
  title?: string;
  detail?: string;
  createdAtIso?: string;
}

type ReadStatusFilter = "all" | "unread";

interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  timestampLabel: string;
}

interface Props {
  onNavigate: (path: string) => void;
}

function readStorageKeyForSchool(): string {
  const schoolId = resolveActiveSchoolId();
  return `bta.notifications.read.${schoolId || "default"}`;
}

function readPersistedReadIds(storageKey: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string").slice(0, 500);
  } catch {
    return [];
  }
}

function persistReadIds(storageKey: string, ids: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids).slice(0, 500)));
}

function formatGameDate(value: string | undefined): string {
  if (!value) {
    return "Unknown date";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTimeFromGameDate(value: string | undefined): string {
  if (!value) {
    return "recently";
  }

  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) {
    return "recently";
  }

  const diffMs = Date.now() - ts;
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.floor(diffMs / dayMs));

  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  return `${days} days ago`;
}

function formatRelativeTimeFromIso(value: string | undefined): string {
  if (!value) {
    return "recently";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  return formatRelativeTimeFromGameDate(parsed.toISOString());
}

function sortGamesMostRecent(left: GameSummary, right: GameSummary): number {
  const leftTs = new Date(left.date ?? "").getTime();
  const rightTs = new Date(right.date ?? "").getTime();
  const leftSafe = Number.isNaN(leftTs) ? Number.NEGATIVE_INFINITY : leftTs;
  const rightSafe = Number.isNaN(rightTs) ? Number.NEGATIVE_INFINITY : rightTs;
  if (rightSafe !== leftSafe) {
    return rightSafe - leftSafe;
  }

  return String(right.gameId).localeCompare(String(left.gameId));
}

function buildNotificationItems(
  apiItems: ApiNotificationItem[],
  live: LiveContextPayload | null,
  games: GameSummary[],
): NotificationItem[] {
  const itemsById = new Map<string, NotificationItem>();

  for (const raw of apiItems) {
    const itemId = String(raw.id ?? "").trim();
    const title = String(raw.title ?? "").trim();
    if (!itemId || !title) {
      continue;
    }

    itemsById.set(itemId, {
      id: itemId,
      title,
      detail: String(raw.detail ?? "").trim() || "Notification update",
      level: raw.level === "success" || raw.level === "warning" ? raw.level : "info",
      timestampLabel: formatRelativeTimeFromIso(raw.createdAtIso),
    });
  }

  if (live?.gameActive && live.sessionId) {
    const our = Number(live.score?.our ?? 0);
    const opp = Number(live.score?.opponent ?? 0);
    const margin = our - opp;
    const closeGame = Math.abs(margin) <= 5;

    itemsById.set(`live-${live.sessionId}`, {
      id: `live-${live.sessionId}`,
      title: closeGame ? "Live game is in a close range" : "Live game is active",
      detail: `${live.teamName ?? "Our Team"} ${our} - ${opp} ${live.opponentName ?? "Opponent"}${live.clock ? `, ${live.clock}` : ""}${live.period ? ` (Q${live.period})` : ""}`,
      level: closeGame ? "warning" : "info",
      timestampLabel: "live",
    });

    for (const [index, insight] of (live.liveInsights ?? []).slice(0, 2).entries()) {
      itemsById.set(`live-insight-${index}`, {
        id: `live-insight-${index}`,
        title: "Live insight alert",
        detail: String(insight),
        level: "warning",
        timestampLabel: "live",
      });
    }
  }

  const recentGames = [...games].sort(sortGamesMostRecent).slice(0, 3);
  for (const game of recentGames) {
    const result = (game.result ?? "").toUpperCase();
    const level: NotificationItem["level"] = result === "W" ? "success" : result === "L" ? "warning" : "info";
    const margin = Number(game.vc_score ?? 0) - Number(game.opp_score ?? 0);
    const marginLabel = margin > 0 ? `+${margin}` : String(margin);

    itemsById.set(`game-${String(game.gameId)}`, {
      id: `game-${String(game.gameId)}`,
      title: `Final: ${result || "-"} vs ${game.opponent ?? "Opponent"}`,
      detail: `${Number(game.vc_score ?? 0)} - ${Number(game.opp_score ?? 0)} (${marginLabel}) on ${formatGameDate(game.date)}`,
      level,
      timestampLabel: formatRelativeTimeFromGameDate(game.date),
    });
  }

  return Array.from(itemsById.values());
}

function buildActivityItems(games: GameSummary[]): ActivityItem[] {
  return [...games]
    .sort(sortGamesMostRecent)
    .slice(0, 8)
    .map((game) => {
      const margin = Number(game.vc_score ?? 0) - Number(game.opp_score ?? 0);
      const marginLabel = margin > 0 ? `+${margin}` : String(margin);

      return {
        id: `activity-${String(game.gameId)}`,
        title: `${formatGameDate(game.date)} - ${game.opponent ?? "Opponent"}`,
        detail: `Result ${String(game.result ?? "-").toUpperCase()} | ${Number(game.vc_score ?? 0)} - ${Number(game.opp_score ?? 0)} | Margin ${marginLabel}`,
        timestampLabel: formatRelativeTimeFromGameDate(game.date),
      };
    });
}

export function NotificationsPage({ onNavigate }: Props) {
  const storageKey = useMemo(() => readStorageKeyForSchool(), []);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [liveContext, setLiveContext] = useState<LiveContextPayload | null>(null);
  const [apiNotificationItems, setApiNotificationItems] = useState<ApiNotificationItem[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [readStatusFilter, setReadStatusFilter] = useState<ReadStatusFilter>("all");
  const [retryKey, setRetryKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("Loading notifications...");

  useEffect(() => {
    setReadNotificationIds(readPersistedReadIds(storageKey));
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError("");
      setStatus("Loading notifications...");

      const [gamesResult, liveResult, notificationsResult] = await Promise.allSettled([
        fetch(`${apiBase}/api/games`, { headers: apiKeyHeader() }),
        fetch(`${apiBase}/api/live-context`, { headers: apiKeyHeader() }),
        fetch(`${apiBase}/api/notifications`, { headers: apiKeyHeader() }),
      ]);

      if (cancelled) {
        return;
      }

      if (gamesResult.status !== "fulfilled" || !gamesResult.value.ok) {
        setLoadError("Could not load notifications from the realtime API.");
        setStatus("Could not load notifications from the realtime API.");
        setIsLoading(false);
        return;
      }

      const gamesPayload = await gamesResult.value.json() as GameSummary[];
      setGames(Array.isArray(gamesPayload) ? gamesPayload : []);

      if (liveResult.status === "fulfilled" && liveResult.value.ok) {
        const livePayload = await liveResult.value.json() as LiveContextPayload;
        setLiveContext(livePayload ?? null);
      } else {
        setLiveContext(null);
      }

      if (notificationsResult.status === "fulfilled" && notificationsResult.value.ok) {
        const notificationsPayload = await notificationsResult.value.json() as { notifications?: ApiNotificationItem[] };
        setApiNotificationItems(Array.isArray(notificationsPayload.notifications) ? notificationsPayload.notifications : []);
      } else {
        setApiNotificationItems([]);
      }

      setStatus("Notifications and recent activity are synced.");
      setIsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const notificationItems = useMemo(() => buildNotificationItems(apiNotificationItems, liveContext, games), [apiNotificationItems, games, liveContext]);
  const readSet = useMemo(() => new Set(readNotificationIds), [readNotificationIds]);
  const unreadCount = useMemo(() => notificationItems.filter((item) => !readSet.has(item.id)).length, [notificationItems, readSet]);
  const visibleNotificationItems = useMemo(() => {
    if (readStatusFilter === "unread") {
      return notificationItems.filter((item) => !readSet.has(item.id));
    }
    return notificationItems;
  }, [notificationItems, readSet, readStatusFilter]);
  const activityItems = useMemo(() => buildActivityItems(games), [games]);

  function toggleRead(itemId: string) {
    setReadNotificationIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      persistReadIds(storageKey, next);
      return Array.from(next);
    });
  }

  function markAllVisibleAsRead() {
    setReadNotificationIds((current) => {
      const next = new Set(current);
      for (const item of visibleNotificationItems) {
        next.add(item.id);
      }
      persistReadIds(storageKey, next);
      return Array.from(next);
    });
  }

  function clearReadState() {
    setReadNotificationIds([]);
    persistReadIds(storageKey, new Set());
  }

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>Notifications</h1>
          <p className="stats-page-subtitle">Recent alerts and activity snapshots for game-day operations.</p>
        </div>
        {status && <p className="stats-page-status">{status}</p>}
      </section>

      {isLoading && (
        <section className="stats-page-card">
          <div className="loading-indicator">
            <div className="loading-spinner" />
            <p className="loading-text">Loading notifications and recent activity...</p>
          </div>
        </section>
      )}

      {!isLoading && loadError && (
        <section className="stats-page-card">
          <p className="stats-empty-copy">{loadError}</p>
          <button
            type="button"
            className="shell-nav-link"
            style={{ marginTop: "0.65rem" }}
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Retry
          </button>
        </section>
      )}

      {!isLoading && !loadError && (
        <>
          <section className="stats-page-grid two-column notifications-grid" style={{ marginBottom: "1rem" }}>
            <section className="stats-page-card notifications-alert-card">
              <div className="stats-page-card-head">
                <h3>Alert Center</h3>
                <span className="stats-page-status">{unreadCount} unread of {notificationItems.length}</span>
              </div>
              {notificationItems.length > 0 && (
                <section className="stats-filter-bar notifications-toolbar" style={{ marginTop: "0.2rem", marginBottom: "0.75rem" }}>
                  <label className="stats-filter-field short notifications-filter" style={{ minWidth: "180px" }}>
                    <span>View</span>
                    <select value={readStatusFilter} onChange={(event) => setReadStatusFilter(event.target.value as ReadStatusFilter)}>
                      <option value="all">All Notifications</option>
                      <option value="unread">Unread Only</option>
                    </select>
                  </label>
                  <div className="settings-form-footer notifications-actions" style={{ marginTop: "0.25rem", justifyContent: "flex-end", width: "100%" }}>
                    <button
                      type="button"
                      className="shell-nav-link shell-nav-link-active"
                      onClick={markAllVisibleAsRead}
                      disabled={visibleNotificationItems.length === 0}
                    >
                      Mark Visible as Read
                    </button>
                    <button
                      type="button"
                      className="shell-nav-link"
                      onClick={clearReadState}
                      disabled={readNotificationIds.length === 0}
                    >
                      Clear Read State
                    </button>
                  </div>
                </section>
              )}

              {visibleNotificationItems.length === 0 ? (
                <p className="stats-empty-copy">
                  {notificationItems.length > 0 && readStatusFilter === "unread"
                    ? "No unread alerts right now."
                    : "No alerts yet. Start a live game to generate operational notifications."}
                </p>
              ) : (
                <div className="stats-game-list notifications-list">
                  {visibleNotificationItems.map((item) => {
                    const isRead = readSet.has(item.id);
                    return (
                    <article key={item.id} className={`stats-game-row notification-row${isRead ? " notification-row-read" : ""}`}>
                      <div className="notification-main">
                        <strong className="notification-title">{item.title}</strong>
                        <span className="notification-detail">{item.detail}</span>
                      </div>
                      <div className="stats-game-score-block notification-side">
                        <span className={`notification-level-badge notification-level-${isRead ? "read" : item.level}`}>
                          {isRead ? "Read" : item.level.toUpperCase()}
                        </span>
                        <span className="notification-time">{item.timestampLabel}</span>
                        <button
                          type="button"
                          className="shell-nav-link notification-toggle-btn"
                          style={{ marginTop: "0.35rem" }}
                          onClick={() => toggleRead(item.id)}
                        >
                          {isRead ? "Mark Unread" : "Mark Read"}
                        </button>
                      </div>
                    </article>
                  );
                  })}
                </div>
              )}
            </section>

            <section className="stats-page-card notifications-activity-card">
              <div className="stats-page-card-head">
                <h3>Recent Activity</h3>
                <span className="stats-page-status">Last {activityItems.length}</span>
              </div>
              {activityItems.length === 0 ? (
                <>
                  <p className="stats-empty-copy">No recent activity yet.</p>
                  <button
                    type="button"
                    className="shell-nav-link"
                    style={{ marginTop: "0.65rem" }}
                    onClick={() => onNavigate("/live")}
                  >
                    Open Live Dashboard
                  </button>
                </>
              ) : (
                <div className="stats-game-list activity-list">
                  {activityItems.map((item) => (
                    <article key={item.id} className="stats-game-row activity-row">
                      <div className="activity-main">
                        <strong className="activity-title">{item.title}</strong>
                        <span className="activity-detail">{item.detail}</span>
                      </div>
                      <div className="stats-game-score-block activity-side">
                        <span className="activity-time">{item.timestampLabel}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </div>
  );
}
