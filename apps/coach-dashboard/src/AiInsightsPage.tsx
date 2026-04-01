import { useEffect, useMemo, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

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
}

function formatNumber(value: number | undefined, digits = 1): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : (0).toFixed(digits);
}

export function AiInsightsPage() {
  const [insights, setInsights] = useState<ComprehensiveInsightsPayload | null>(null);
  const [analysis, setAnalysis] = useState<SeasonAnalysis | null>(null);
  const [teamSummary, setTeamSummary] = useState("");
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [playerInsight, setPlayerInsight] = useState("");
  const [question, setQuestion] = useState("");
  const [chatReply, setChatReply] = useState("");
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading AI insights...");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading AI insights...");
      try {
        const [insightsRes, seasonRes, teamSummaryRes, playersRes] = await Promise.all([
          fetch(`${apiBase}/api/comprehensive-insights`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/season-analysis`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/ai/team-summary`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/players`, { headers: apiKeyHeader() }),
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

        if (!cancelled) {
          setInsights(insightsPayload);
          setAnalysis(seasonPayload);
          setTeamSummary(teamSummaryPayload.summary ?? "");
          const nextPlayers = Array.isArray(playersPayload) ? playersPayload : [];
          setPlayers(nextPlayers);
          if (!selectedPlayer && nextPlayers.length > 0) {
            setSelectedPlayer(nextPlayers[0].full_name ?? nextPlayers[0].name ?? "");
          }
          setStatus("AI summaries, recommendations, and analysis features are synced.");
        }
      } catch {
        if (!cancelled) {
          setStatus("Could not load AI insights from the realtime API.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayerInsight() {
      if (!selectedPlayer) {
        setPlayerInsight("");
        return;
      }

      try {
        const response = await fetch(`${apiBase}/api/ai/player-insights/${encodeURIComponent(selectedPlayer)}`, {
          headers: apiKeyHeader(),
        });
        if (!response.ok) {
          throw new Error("Player insight request failed");
        }

        const payload = await response.json() as { insights?: string };
        if (!cancelled) {
          setPlayerInsight(payload.insights ?? "No player-specific insight available yet.");
        }
      } catch {
        if (!cancelled) {
          setPlayerInsight("No player-specific insight available yet.");
        }
      }
    }

    void loadPlayerInsight();
    return () => {
      cancelled = true;
    };
  }, [selectedPlayer]);

  async function askAiQuestion(message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    setChatLoading(true);
    setStatus("Asking AI...");
    try {
      const response = await fetch(`${apiBase}/api/ai/chat`, {
        method: "POST",
        headers: apiKeyHeader(true),
        body: JSON.stringify({ message: trimmed, history: [] }),
      });

      if (!response.ok) {
        throw new Error("AI chat failed");
      }

      const payload = await response.json() as { reply?: string; suggestions?: string[] };
      setChatReply(payload.reply ?? "No answer available.");
      setChatSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
      setQuestion("");
      setStatus("AI answer ready.");
    } catch {
      setStatus("Could not get an AI answer right now.");
    } finally {
      setChatLoading(false);
    }
  }

  async function refreshSeasonSummary() {
    setStatus("Refreshing season analysis...");
    try {
      const response = await fetch(`${apiBase}/api/season-analysis?force=true`, { headers: apiKeyHeader() });
      if (!response.ok) {
        throw new Error("Refresh failed");
      }
      const payload = await response.json() as SeasonAnalysis;
      setAnalysis(payload);
      setStatus("Season analysis refreshed.");
    } catch {
      setStatus("Could not refresh the season analysis.");
    }
  }

  const playerSpotlights = useMemo(() => (insights?.player_insights ?? []).slice(0, 4), [insights]);
  const recentGameAnalysis = useMemo(() => {
    return [...(analysis?.per_game_analysis ?? [])].slice(-4).reverse();
  }, [analysis]);

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>AI Insights</h1>
          <p className="stats-page-subtitle">Season analysis, recommendations, player spotlights, and coach Q&amp;A are back in one place.</p>
        </div>
        <div style={{ display: "grid", gap: "0.5rem", justifyItems: "end" }}>
          <p className="stats-page-status">{status}</p>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => void refreshSeasonSummary()}>
            Refresh Analysis
          </button>
        </div>
      </section>

      <section className="stats-metric-grid">
        <div className="stats-metric-card accent-blue">
          <span className="stats-metric-label">Recent Record</span>
          <strong className="stats-metric-value">{insights?.team_trends?.recent_performance?.record ?? "0-0"}</strong>
          <span className="stats-metric-detail">Trend {insights?.team_trends?.recent_performance?.trend ?? "steady"}</span>
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

      <section className="stats-page-grid two-column" style={{ marginBottom: "1rem" }}>
        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Season Summary</h3>
            <span className="stats-page-status">{analysis?.generated_at ? new Date(analysis.generated_at).toLocaleDateString() : "Live"}</span>
          </div>
          <p className="stats-page-subcopy">{analysis?.season_summary ?? teamSummary ?? "No season summary available yet."}</p>
        </section>

        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Coaching Recommendations</h3>
          </div>
          {(insights?.recommendations ?? []).length === 0 ? (
            <p className="stats-empty-copy">No recommendations available yet.</p>
          ) : (
            <ul className="stats-list">
              {(insights?.recommendations ?? []).map((item, index) => (
                <li key={`recommendation-${index}`}>
                  <strong>{item.category ?? "Focus"} ({item.priority ?? "Info"})</strong> — {item.recommendation}
                  {item.reason ? <div className="stats-page-subcopy">{item.reason}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <section className="stats-page-grid two-column" style={{ marginBottom: "1rem" }}>
        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Ask the AI</h3>
            <span className="stats-page-status">Coach Q&amp;A</span>
          </div>
          <div style={{ display: "grid", gap: "0.65rem" }}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about lineups, trends, matchup concerns, or who is in form..."
              rows={4}
              style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "var(--text)", padding: "0.8rem", font: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button type="button" className="shell-nav-link shell-nav-link-active" disabled={chatLoading} onClick={() => void askAiQuestion(question)}>
                {chatLoading ? "Thinking…" : "Ask AI"}
              </button>
              {chatSuggestions.slice(0, 2).map((suggestion) => (
                <button key={suggestion} type="button" className="shell-nav-link" onClick={() => void askAiQuestion(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
            <p className="stats-page-subcopy">{chatReply || "Ask a question to get live coaching guidance from the season context."}</p>
          </div>
        </section>

        <section className="stats-page-card">
          <div className="stats-page-card-head">
            <h3>Player Spotlight</h3>
            <span className="stats-page-status">Individual insight</span>
          </div>
          <label className="stats-filter-field" style={{ marginBottom: "0.75rem" }}>
            <span>Select player</span>
            <select value={selectedPlayer} onChange={(event) => setSelectedPlayer(event.target.value)}>
              {players.map((player) => {
                const label = player.full_name ?? player.name ?? "Unknown Player";
                return <option key={label} value={label}>{label}</option>;
              })}
            </select>
          </label>
          <p className="stats-page-subcopy">{playerInsight || "Select a player to see AI notes."}</p>
        </section>
      </section>

      <section className="stats-page-grid two-column" style={{ marginBottom: "1rem" }}>
        {playerSpotlights.length === 0 ? (
          <section className="stats-page-card">
            <p className="stats-empty-copy">No player spotlight cards are available yet.</p>
          </section>
        ) : (
          playerSpotlights.map((entry) => (
            <section key={entry.name} className="stats-page-card">
              <div className="stats-page-card-head">
                <h3>{entry.name}</h3>
                <span className="stats-result-badge result-t">{entry.efficiency_grade ?? entry.role ?? "Info"}</span>
              </div>
              <p className="stats-page-subcopy"><strong>Strengths:</strong> {(entry.strengths ?? []).join(", ") || "No strengths listed yet."}</p>
              <p className="stats-page-subcopy"><strong>Focus:</strong> {(entry.areas_for_improvement ?? []).join(", ") || "No improvement notes yet."}</p>
            </section>
          ))
        )}
      </section>

      <section className="stats-page-card">
        <div className="stats-page-card-head">
          <h3>Recent Game Analysis</h3>
          <span className="stats-page-status">Per-game breakdowns</span>
        </div>
        {recentGameAnalysis.length === 0 ? (
          <p className="stats-empty-copy">No per-game analysis available yet.</p>
        ) : (
          <div className="stats-game-list">
            {recentGameAnalysis.map((entry, index) => (
              <div key={`${entry.game ?? index}`} className="stats-game-row" style={{ alignItems: "flex-start" }}>
                <div>
                  <strong>{entry.date || "No date"} — {entry.opponent || "Opponent"}</strong>
                  <span>{entry.analysis || "No game analysis available yet."}</span>
                </div>
                <div className="stats-game-score-block">
                  <strong>{entry.score || "—"}</strong>
                  <span>{entry.result || "-"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
