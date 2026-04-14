import { useEffect, useMemo, useRef, useState } from "react";
import { apiBase, apiKeyHeader, resolveActiveSchoolId } from "./platform.js";

interface RecommendationEntry {
  category?: string;
  priority?: string;
  recommendation?: string;
  reason?: string;
}

interface PlayerInsightCard {
  name: string;
  role?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  efficiency_grade?: string;
}

interface ComprehensiveInsightsPayload {
  team_trends?: {
    recent_performance?: {
      record?: string;
      avg_score?: number;
      point_differential?: number;
      trend?: string;
    };
    scoring_trends?: {
      recent_avg?: number;
      early_avg?: number;
      improvement?: number;
      trend?: string;
    };
    defensive_trends?: {
      recent_avg_allowed?: number;
      early_avg_allowed?: number;
      improvement?: number;
      trend?: string;
    };
  };
  key_metrics?: {
    win_pct?: number;
    fg_pct?: number;
    fg3_pct?: number;
    apg?: number;
    tpg?: number;
  };
  recommendations?: RecommendationEntry[];
  player_insights?: PlayerInsightCard[];
}

interface SeasonGameAnalysisEntry {
  game?: string | number;
  opponent?: string;
  date?: string;
  score?: string;
  result?: string;
  analysis?: string;
  player_performances?: Array<{
    name?: string;
    pts?: number;
    indicator?: string;
  }>;
}

interface SeasonAnalysis {
  generated_at?: string;
  season_summary?: string;
  per_game_analysis?: SeasonGameAnalysisEntry[];
}

interface PlayerSummary {
  name?: string;
  full_name?: string;
  number?: string;
}

interface LiveContextPayload {
  gameActive?: boolean;
  sessionId?: string;
  score?: { our: number; opponent: number };
  period?: number;
  clock?: string;
  activeLineup?: string[];
  liveInsights?: string[];
  teamName?: string;
  opponentName?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€�/g, '"'],
  [/â€”/g, "-"],
  [/â€“/g, "-"],
  [/â€¦/g, "..."],
  [/â†‘/g, "+"],
  [/â†“/g, "-"],
  [/Â·/g, " - "],
  [/Â/g, ""],
];

function sanitizeText(value: string | null | undefined): string {
  if (!value) return "";

  return MOJIBAKE_REPLACEMENTS.reduce((text, [pattern, replacement]) => {
    return text.replace(pattern, replacement);
  }, value);
}

function sanitizeRecommendations(entries: RecommendationEntry[] | undefined): RecommendationEntry[] {
  return (entries ?? []).map((entry) => ({
    ...entry,
    category: sanitizeText(entry.category),
    priority: sanitizeText(entry.priority),
    recommendation: sanitizeText(entry.recommendation),
    reason: sanitizeText(entry.reason),
  }));
}

function sanitizePlayerInsights(entries: PlayerInsightCard[] | undefined): PlayerInsightCard[] {
  return (entries ?? []).map((entry) => ({
    ...entry,
    name: sanitizeText(entry.name),
    role: sanitizeText(entry.role),
    strengths: (entry.strengths ?? []).map((item) => sanitizeText(item)),
    areas_for_improvement: (entry.areas_for_improvement ?? []).map((item) => sanitizeText(item)),
    efficiency_grade: sanitizeText(entry.efficiency_grade),
  }));
}

function sanitizeInsightsPayload(payload: ComprehensiveInsightsPayload): ComprehensiveInsightsPayload {
  return {
    ...payload,
    team_trends: payload.team_trends ? {
      ...payload.team_trends,
      recent_performance: payload.team_trends.recent_performance ? {
        ...payload.team_trends.recent_performance,
        record: sanitizeText(payload.team_trends.recent_performance.record),
        trend: sanitizeText(payload.team_trends.recent_performance.trend),
      } : undefined,
      scoring_trends: payload.team_trends.scoring_trends ? {
        ...payload.team_trends.scoring_trends,
        trend: sanitizeText(payload.team_trends.scoring_trends.trend),
      } : undefined,
      defensive_trends: payload.team_trends.defensive_trends ? {
        ...payload.team_trends.defensive_trends,
        trend: sanitizeText(payload.team_trends.defensive_trends.trend),
      } : undefined,
    } : undefined,
    recommendations: sanitizeRecommendations(payload.recommendations),
    player_insights: sanitizePlayerInsights(payload.player_insights),
  };
}

function sanitizeSeasonAnalysis(payload: SeasonAnalysis): SeasonAnalysis {
  return {
    ...payload,
    season_summary: sanitizeText(payload.season_summary),
    per_game_analysis: (payload.per_game_analysis ?? []).map((entry) => ({
      ...entry,
      opponent: sanitizeText(entry.opponent),
      date: sanitizeText(entry.date),
      score: sanitizeText(entry.score),
      result: sanitizeText(entry.result),
      analysis: sanitizeText(entry.analysis),
      player_performances: (entry.player_performances ?? []).map((performance) => ({
        ...performance,
        name: sanitizeText(performance.name),
        indicator: sanitizeText(performance.indicator),
      })),
    })),
  };
}

function sanitizeLiveContext(payload: LiveContextPayload): LiveContextPayload {
  return {
    ...payload,
    clock: sanitizeText(payload.clock),
    activeLineup: (payload.activeLineup ?? []).map((name) => sanitizeText(name)),
    liveInsights: (payload.liveInsights ?? []).map((item) => sanitizeText(item)),
    teamName: sanitizeText(payload.teamName),
    opponentName: sanitizeText(payload.opponentName),
  };
}

function formatNumber(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : (0).toFixed(digits);
}

function playerDisplayLabel(player: PlayerSummary): string {
  const num = player.number ? `#${player.number} ` : "";
  return `${num}${player.full_name ?? player.name ?? "Unknown"}`;
}

export function AiInsightsPage() {
  const activeSchoolId = resolveActiveSchoolId();
  const [insights, setInsights] = useState<ComprehensiveInsightsPayload | null>(null);
  const [analysis, setAnalysis] = useState<SeasonAnalysis | null>(null);
  const [teamSummary, setTeamSummary] = useState("");
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [playerInsight, setPlayerInsight] = useState("");
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([]);
  const [liveContext, setLiveContext] = useState<LiveContextPayload | null>(null);
  const [preGameNotes, setPreGameNotes] = useState("");
  const [preGameNotesSaving, setPreGameNotesSaving] = useState(false);
  const [status, setStatus] = useState("Loading AI insights...");
  const [chatLoading, setChatLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeSchoolId) {
      setStatus("Waiting for school context before loading AI insights.");
      return;
    }

    let cancelled = false;

    async function load() {
      setStatus("Loading AI insights...");
      setLoadError(false);
      try {
        const [insightsRes, seasonRes, teamSummaryRes, playersRes, liveRes] = await Promise.all([
          fetch(`${apiBase}/api/comprehensive-insights`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/season-analysis`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/ai/team-summary`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/players`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/live-context`, { headers: apiKeyHeader() }).catch(() => null),
        ]);

        if (!insightsRes.ok || !seasonRes.ok || !teamSummaryRes.ok || !playersRes.ok) {
          throw new Error("Insights request failed");
        }

        const [insightsPayload, seasonPayload, teamSummaryPayload, playersPayload] = await Promise.all([
          insightsRes.json() as Promise<ComprehensiveInsightsPayload>,
          seasonRes.json() as Promise<SeasonAnalysis>,
          teamSummaryRes.json() as Promise<{ summary?: string }>,
          playersRes.json() as Promise<PlayerSummary[]>,
        ]);

        const livePayload = (liveRes?.ok
          ? (liveRes.json() as Promise<LiveContextPayload>)
          : Promise.resolve(null));

        const live = await livePayload;

        if (!cancelled) {
          setInsights(sanitizeInsightsPayload(insightsPayload));
          setAnalysis(sanitizeSeasonAnalysis(seasonPayload));
          setTeamSummary(sanitizeText(teamSummaryPayload.summary));
          const nextPlayers = Array.isArray(playersPayload) ? playersPayload : [];
          setPlayers(nextPlayers);
          if (!selectedPlayer && nextPlayers.length > 0) {
            setSelectedPlayer(playerDisplayLabel(nextPlayers[0]));
          }
          if (live) {
            setLiveContext(sanitizeLiveContext(live));
            if (live.sessionId) {
              // Fetch current pre-game notes for the live game
              fetch(`${apiBase}/api/games/${encodeURIComponent(live.sessionId)}/ai-context`, { headers: apiKeyHeader() })
                .then((r) => r.ok ? r.json() as Promise<{ preGameNotes?: string }> : null)
                .then((ctx) => { if (ctx?.preGameNotes) setPreGameNotes(sanitizeText(ctx.preGameNotes)); })
                .catch(() => {});
            }
          }
          setStatus("Ready.");
        }
      } catch {
        if (!cancelled) {
          setStatus("Could not load AI insights from the realtime API.");
          setLoadError(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId]);

  // Scroll chat to bottom when messages arrive
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    if (!activeSchoolId) {
      setPlayerInsight("");
      return;
    }

    let cancelled = false;

    async function loadPlayerInsight() {
      if (!selectedPlayer) {
        setPlayerInsight("");
        return;
      }
      // Strip leading "#5 " prefix for API call
      const nameForApi = selectedPlayer.replace(/^#\d+\s+/, "");
      try {
        const response = await fetch(`${apiBase}/api/ai/player-insights/${encodeURIComponent(nameForApi)}`, {
          headers: apiKeyHeader(),
        });
        if (!response.ok) throw new Error("Player insight request failed");
        const payload = await response.json() as { insights?: string };
        if (!cancelled) {
          setPlayerInsight(sanitizeText(payload.insights) || "No player insight available yet.");
        }
      } catch {
        if (!cancelled) {
          setPlayerInsight("No player insight available yet.");
        }
      }
    }

    void loadPlayerInsight();
    return () => { cancelled = true; };
  }, [activeSchoolId, selectedPlayer]);

  async function askAiQuestion(message: string) {
    const trimmed = message.trim();
    if (!trimmed || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextHistory = [...chatHistory, userMsg];
    setChatHistory(nextHistory);
    setQuestion("");
    setChatLoading(true);
    setChatSuggestions([]);

    try {
      const response = await fetch(`${apiBase}/api/ai/chat`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error("AI chat failed");

      const payload = await response.json() as { reply?: string; suggestions?: string[] };
      const reply = sanitizeText(payload.reply) || "No answer available.";
      setChatHistory((prev) => [...prev, { role: "assistant", content: reply }]);
      setChatSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions.map((item) => sanitizeText(item)) : []);
    } catch {
      setChatHistory((prev) => [...prev, { role: "assistant", content: "Could not get an answer right now. Try again shortly." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleChatKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void askAiQuestion(question);
    }
  }

  async function refreshSeasonSummary() {
    setStatus("Refreshing season analysis...");
    try {
      const response = await fetch(`${apiBase}/api/season-analysis?force=true`, { headers: apiKeyHeader() });
      if (!response.ok) throw new Error("Refresh failed");
      const payload = await response.json() as SeasonAnalysis;
      setAnalysis(sanitizeSeasonAnalysis(payload));
      setStatus("Season analysis refreshed.");
    } catch {
      setStatus("Could not refresh the season analysis.");
    }
  }

  const playerSpotlights = useMemo(() => (insights?.player_insights ?? []).slice(0, 4), [insights]);
  const recentGameAnalysis = useMemo(() => {
    return [...(analysis?.per_game_analysis ?? [])].slice(-4).reverse();
  }, [analysis]);

  const trendArrow = (trend?: string) => {
    if (!trend) return "";
    const t = trend.toLowerCase();
    if (t.includes("improv") || t.includes("up") || t.includes("increas")) return " +";
    if (t.includes("declin") || t.includes("down") || t.includes("decreas")) return " -";
    return "";
  };

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>AI Insights</h1>
          <p className="stats-page-subtitle">Season analysis, coaching recommendations, player spotlights, and live guidance.</p>
        </div>
        <div className="ai-hero-actions">
          <p className="stats-page-status">{status}</p>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => void refreshSeasonSummary()}>
            Refresh Analysis
          </button>
        </div>
      </section>

      {/* Live Game Banner */}
      {liveContext?.gameActive && (
        <section className="ai-live-banner">
          <div className="ai-live-banner-score">
            <span className="ai-live-badge">LIVE</span>
            <strong>{liveContext.teamName ?? "Us"} {liveContext.score?.our ?? 0}</strong>
            <span className="ai-live-vs">vs</span>
            <strong>{liveContext.score?.opponent ?? 0} {liveContext.opponentName ?? "Opponent"}</strong>
            <span className="ai-live-meta">Q{liveContext.period ?? 1}{liveContext.clock ? ` - ${liveContext.clock}` : ""}</span>
          </div>
          {(liveContext.activeLineup ?? []).length > 0 && (
            <div className="ai-live-lineup">
              <span className="ai-live-lineup-label">On court:</span>
              {(liveContext.activeLineup ?? []).map((name) => (
                <span key={name} className="ai-live-player-chip">{name}</span>
              ))}
            </div>
          )}
          {(liveContext.liveInsights ?? []).length > 0 && (
            <div className="ai-live-insights">
              {(liveContext.liveInsights ?? []).slice(0, 3).map((msg, i) => (
                <div key={i} className="ai-live-insight-item">{msg}</div>
              ))}
            </div>
          )}
          {liveContext.sessionId && (
            <div className="ai-live-pregame-notes">
              <label className="ai-live-notes-label" htmlFor="ai-live-notes-input">Match Notes (visible to AI)</label>
              <div className="ai-live-notes-row">
                <textarea
                  id="ai-live-notes-input"
                  className="ai-live-notes-textarea"
                  value={preGameNotes}
                  onChange={(e) => setPreGameNotes(e.target.value)}
                  placeholder="Opponent tendencies, mindset, key rotations..."
                  rows={2}
                />
                <button
                  type="button"
                  className="ai-live-notes-save-btn"
                  disabled={preGameNotesSaving}
                  onClick={() => {
                    if (!liveContext.sessionId) return;
                    setPreGameNotesSaving(true);
                    fetch(`${apiBase}/api/games/${encodeURIComponent(liveContext.sessionId)}/ai-context`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", ...apiKeyHeader() },
                      body: JSON.stringify({ preGameNotes: preGameNotes.trim() || "" }),
                    })
                      .catch(() => {})
                      .finally(() => setPreGameNotesSaving(false));
                  }}
                >
                  {preGameNotesSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Metric Cards */}
      <section className="stats-metric-grid">
        <div className="stats-metric-card accent-blue">
          <span className="stats-metric-label">Recent Record</span>
          <strong className="stats-metric-value">{sanitizeText(insights?.team_trends?.recent_performance?.record) || "-"}</strong>
          <span className="stats-metric-detail">Trend: {sanitizeText(insights?.team_trends?.recent_performance?.trend) || "steady"}{trendArrow(insights?.team_trends?.recent_performance?.trend)}</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Avg Score</span>
          <strong className="stats-metric-value">{formatNumber(insights?.team_trends?.recent_performance?.avg_score)}</strong>
          <span className="stats-metric-detail">Recent offense</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Point Diff</span>
          <strong className="stats-metric-value">{formatNumber(insights?.team_trends?.recent_performance?.point_differential)}</strong>
          <span className="stats-metric-detail">Last 5 games</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">FG%</span>
          <strong className="stats-metric-value">{formatNumber(insights?.key_metrics?.fg_pct)}%</strong>
          <span className="stats-metric-detail">3PT {formatNumber(insights?.key_metrics?.fg3_pct)}%</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Playmaking</span>
          <strong className="stats-metric-value">{formatNumber(insights?.key_metrics?.apg)}</strong>
          <span className="stats-metric-detail">Assists per game</span>
        </div>
        <div className="stats-metric-card">
          <span className="stats-metric-label">Turnovers</span>
          <strong className="stats-metric-value">{formatNumber(insights?.key_metrics?.tpg)}</strong>
          <span className="stats-metric-detail">Per game</span>
        </div>
      </section>

      {/* Season Summary + Recommendations */}
      <section className="stats-page-grid two-column ai-section-gap">
        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Season Summary</h3>
            <span className="stats-page-status">{analysis?.generated_at ? new Date(analysis.generated_at).toLocaleDateString() : "Live"}</span>
          </div>
          <p className="stats-page-subcopy">{sanitizeText(analysis?.season_summary) || sanitizeText(teamSummary) || "No season summary yet."}</p>
        </section>

        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Coaching Recommendations</h3>
          </div>
          {(insights?.recommendations ?? []).length === 0 ? (
            <p className="stats-empty-copy">No recommendations yet.</p>
          ) : (
            <ul className="stats-list">
              {(insights?.recommendations ?? []).map((item, index) => (
                <li key={`recommendation-${index}`}>
                  <strong>{sanitizeText(item.category) || "Focus"} - {sanitizeText(item.priority) || "Info"}</strong>: {sanitizeText(item.recommendation)}
                  {item.reason ? <div className="stats-page-subcopy ai-reason-copy">{sanitizeText(item.reason)}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      {/* Ask the AI (chat with history) */}
      <section className="stats-page-card ai-section-gap">
        <div className="stats-page-card-head">
          <h3>Ask the AI</h3>
          <span className="stats-page-status">Coach Q&amp;A - season + {liveContext?.gameActive ? "live game" : "roster"} context</span>
        </div>

        {chatHistory.length > 0 && (
          <div className="ai-chat-history">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`ai-chat-bubble ai-chat-bubble-${msg.role}`}>
                <span className="ai-chat-role">{msg.role === "user" ? "You" : "AI"}</span>
                <p className="ai-chat-content">{msg.content}</p>
              </div>
            ))}
            {chatLoading && (
              <div className="ai-chat-bubble ai-chat-bubble-assistant ai-chat-bubble-loading">
                <span className="ai-chat-role">AI</span>
                <p className="ai-chat-content">Thinking...</p>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
        )}

        <div className="ai-chat-input-area">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleChatKey}
            placeholder={chatHistory.length > 0 ? "Follow up..." : "Ask about lineups, trends, hot players, or defensive issues..."}
            rows={3}
            className="ai-chat-textarea"
            disabled={chatLoading}
          />
          <div className="ai-chat-actions">
            <button type="button" className="shell-nav-link shell-nav-link-active" disabled={chatLoading || !question.trim()} onClick={() => void askAiQuestion(question)}>
              {chatLoading ? "Thinking..." : "Ask AI"}
            </button>
            {chatHistory.length > 0 && (
              <button type="button" className="shell-nav-link" onClick={() => { setChatHistory([]); setChatSuggestions([]); }}>
                Clear
              </button>
            )}
          </div>
          {chatSuggestions.length > 0 && (
            <div className="ai-chat-suggestions">
              <span className="ai-chat-suggestions-label">Try asking:</span>
              {chatSuggestions.slice(0, 3).map((s) => (
                <button key={s} type="button" className="ai-chat-suggestion-chip" disabled={chatLoading} onClick={() => void askAiQuestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Player Spotlight */}
      <section className="stats-page-grid two-column ai-section-gap">
        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Player Spotlight</h3>
            <span className="stats-page-status">Individual insight</span>
          </div>
          <label className="stats-filter-field ai-player-select-field">
            <span>Select player</span>
            <select value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)}>
              {players.map((player) => {
                const label = playerDisplayLabel(player);
                return <option key={label} value={label}>{label}</option>;
              })}
            </select>
          </label>
          <p className="stats-page-subcopy">{playerInsight || "Select a player to view AI notes."}</p>
        </section>

        {playerSpotlights.length > 0 && (
          <section className="stats-page-card">
            <div className="stats-page-card-head">
              <h3>Player Cards</h3>
              <span className="stats-page-status">From season analysis</span>
            </div>
            <div className="ai-player-cards">
              {playerSpotlights.map((entry) => (
                <div key={entry.name} className="ai-player-card">
                  <div className="ai-player-card-head">
                    <strong>{sanitizeText(entry.name)}</strong>
                    <span className="stats-result-badge result-t">{sanitizeText(entry.efficiency_grade) || sanitizeText(entry.role) || "-"}</span>
                  </div>
                  {(entry.strengths ?? []).length > 0 && (
                    <p className="stats-page-subcopy"><strong>Strengths:</strong> {entry.strengths!.map((item) => sanitizeText(item)).join(", ")}</p>
                  )}
                  {(entry.areas_for_improvement ?? []).length > 0 && (
                    <p className="stats-page-subcopy"><strong>Focus:</strong> {entry.areas_for_improvement!.map((item) => sanitizeText(item)).join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </section>

      {/* Recent Game Analysis */}
      <section className="stats-page-card">
        <div className="stats-page-card-head">
          <h3>Recent Game Analysis</h3>
          <span className="stats-page-status">Per-game breakdowns</span>
        </div>
        {recentGameAnalysis.length === 0 ? (
          <p className="stats-empty-copy">No per-game analysis yet.</p>
        ) : (
          <div className="stats-game-list">
            {recentGameAnalysis.map((entry, index) => (
              <div key={`${entry.game ?? index}`} className="stats-game-row ai-game-analysis-row">
                <div>
                  <strong>{sanitizeText(entry.date) || "No date"} - {sanitizeText(entry.opponent) || "Opponent"}</strong>
                  <span>{sanitizeText(entry.analysis) || "No game analysis yet."}</span>
                  {(entry.player_performances ?? []).length > 0 && (
                    <div className="ai-perf-chips">
                      {entry.player_performances!.slice(0, 4).map((p, pi) => (
                        <span key={pi} className="ai-perf-chip">
                          {sanitizeText(p.name) || "?"} {p.pts != null ? `${p.pts}pts` : ""} {sanitizeText(p.indicator)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="stats-game-score-block">
                  <strong>{sanitizeText(entry.score) || "-"}</strong>
                  <span>{sanitizeText(entry.result) || "-"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {loadError && (
        <p className="stats-empty-copy ai-tip-copy">
          Tip: Make sure the realtime API is running and your API key is set.
        </p>
      )}
    </div>
  );
}


interface RecommendationEntry {
  category?: string;
  priority?: string;
  recommendation?: string;
  reason?: string;
}

interface PlayerInsightCard {
  name: string;
  role?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  efficiency_grade?: string;
}

interface ComprehensiveInsightsPayload {
  team_trends?: {
    recent_performance?: {
      record?: string;
      avg_score?: number;
      point_differential?: number;
      trend?: string;
    };
    scoring_trends?: {
      recent_avg?: number;
      early_avg?: number;
      improvement?: number;
      trend?: string;
    };
    defensive_trends?: {
      recent_avg_allowed?: number;
      early_avg_allowed?: number;
      improvement?: number;
      trend?: string;
    };
  };
  key_metrics?: {
    win_pct?: number;
    fg_pct?: number;
    fg3_pct?: number;
    apg?: number;
    tpg?: number;
  };
  recommendations?: RecommendationEntry[];
  player_insights?: PlayerInsightCard[];
}
