import { useEffect, useState } from "react";
import { apiBase, apiKeyHeader } from "./platform.js";

interface InsightEntry {
  title?: string;
  heading?: string;
  insight?: string;
  summary?: string;
  description?: string;
  confidence?: number;
  priority?: string;
  category?: string;
}

interface SeasonAnalysis {
  summary?: string;
  key_findings?: string[];
  recommendations?: string[];
}

function getInsightText(entry: InsightEntry): string {
  return entry.insight ?? entry.summary ?? entry.description ?? "No detail available.";
}

export function AiInsightsPage() {
  const [insights, setInsights] = useState<InsightEntry[]>([]);
  const [analysis, setAnalysis] = useState<SeasonAnalysis | null>(null);
  const [status, setStatus] = useState("Loading AI insights...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading AI insights...");
      try {
        const [insightsRes, seasonRes] = await Promise.all([
          fetch(`${apiBase}/api/comprehensive-insights`, { headers: apiKeyHeader() }),
          fetch(`${apiBase}/api/season-analysis`, { headers: apiKeyHeader() }),
        ]);

        if (!insightsRes.ok || !seasonRes.ok) {
          throw new Error("Insights request failed");
        }

        const insightsPayload = await insightsRes.json() as unknown;
        const seasonPayload = await seasonRes.json() as SeasonAnalysis;

        if (!cancelled) {
          const parsedInsights = Array.isArray(insightsPayload)
            ? insightsPayload as InsightEntry[]
            : Array.isArray((insightsPayload as { insights?: InsightEntry[] })?.insights)
              ? (insightsPayload as { insights: InsightEntry[] }).insights
              : [];

          setInsights(parsedInsights);
          setAnalysis(seasonPayload);
          setStatus("AI insights synced.");
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

  return (
    <div className="stats-page">
      <section className="stats-page-hero compact">
        <div>
          <h1>AI Insights</h1>
          <p className="stats-page-subtitle">Rules-based analysis and season recommendations in one place.</p>
        </div>
        <p className="stats-page-status">{status}</p>
      </section>

      <section className="stats-page-card">
        <div className="stats-page-card-head">
          <h3>Season Summary</h3>
        </div>
        <p className="stats-page-subcopy">{analysis?.summary ?? "No season summary available yet."}</p>
        <div className="stats-page-grid two-column">
          <div>
            <h4>Key Findings</h4>
            {(analysis?.key_findings ?? []).length === 0 ? (
              <p className="stats-empty-copy">No findings available.</p>
            ) : (
              <ul className="stats-list">
                {(analysis?.key_findings ?? []).map((item, index) => (
                  <li key={`finding-${index}`}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4>Recommendations</h4>
            {(analysis?.recommendations ?? []).length === 0 ? (
              <p className="stats-empty-copy">No recommendations available.</p>
            ) : (
              <ul className="stats-list">
                {(analysis?.recommendations ?? []).map((item, index) => (
                  <li key={`recommendation-${index}`}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="stats-page-grid two-column">
        {insights.length === 0 ? (
          <section className="stats-page-card">
            <p className="stats-empty-copy">No live AI insight cards are available yet.</p>
          </section>
        ) : (
          insights.map((entry, index) => (
            <section key={`insight-${index}`} className="stats-page-card">
              <div className="stats-page-card-head">
                <h3>{entry.title ?? entry.heading ?? `Insight ${index + 1}`}</h3>
                <span className="stats-result-badge result-t">{entry.priority ?? entry.category ?? "info"}</span>
              </div>
              <p className="stats-page-subcopy">{getInsightText(entry)}</p>
              <p className="stats-page-subcopy">Confidence {Number(entry.confidence ?? 0).toFixed(0)}%</p>
            </section>
          ))
        )}
      </section>
    </div>
  );
}
