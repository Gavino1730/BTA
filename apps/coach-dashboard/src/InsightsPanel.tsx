import {
  formatInsightTypeLabel,
  formatInsightAge,
  getRuleInsightImportanceClass,
  getRuleBadgeImportanceClass,
  type Insight,
} from "./helpers/index.js";

const URGENT_TYPES = [
  "sub_suggestion",
  "timeout_suggestion",
  "foul_warning",
  "foul_trouble",
  "team_foul_warning",
  "ot_awareness",
  "depth_warning",
];

interface Props {
  gameId: string;
  hasGameStarted: boolean;
  insightsCount: number;
  aiInsights: Insight[];
  rulesInsights: Insight[];
  aiRefreshError: string;
  aiHealthMessage: string;
  isRefreshingAiInsights: boolean;
  refreshAiBenchCalls: () => Promise<void>;
  prettifyInsightText: (text: string, relatedTeamId?: string | null, relatedPlayerId?: string | null) => string;
}

export function InsightsPanel({
  gameId,
  hasGameStarted,
  insightsCount,
  aiInsights,
  rulesInsights,
  aiRefreshError,
  aiHealthMessage,
  isRefreshingAiInsights,
  refreshAiBenchCalls,
  prettifyInsightText,
}: Props) {
  const urgentInsights = rulesInsights.filter(i => URGENT_TYPES.includes(i.type));
  const systemInsights = rulesInsights.filter(i => !URGENT_TYPES.includes(i.type));

  return (
    <section className="card">
      <h2>Live Insights</h2>
      {!hasGameStarted ? (
        <p className="insight-context-note">Game has not started yet. Insights will appear once play begins.</p>
      ) : null}

      {hasGameStarted && insightsCount === 0 ? (
        <p className="insight-context-note">No live calls yet. Capture a few more possessions.</p>
      ) : null}

      {aiInsights.length > 0 || (hasGameStarted && gameId) || aiRefreshError ? (
        <>
          <div className="insight-subhead-row">
            <h3 className="insight-subhead">AI Bench Calls</h3>
            <button
              className="secondary insight-refresh-button"
              onClick={() => void refreshAiBenchCalls()}
              disabled={!gameId || isRefreshingAiInsights}
            >
              {isRefreshingAiInsights ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {aiRefreshError ? <p className="insight-context-note insight-context-note-error">{aiRefreshError}</p> : null}
          {!aiRefreshError && aiHealthMessage ? <p className="insight-context-note insight-context-note-warning">{aiHealthMessage}</p> : null}
          {aiInsights.length > 0 ? (
            <div className="insight-list">
              {aiInsights.map((insight) => (
                <article key={insight.id} className="insight-item insight-item-ai">
                  <div className="insight-title-row">
                    <h3>{formatInsightTypeLabel(insight.type)}</h3>
                    <div className="insight-title-meta">
                      <span className="insight-badge insight-badge-ai">AI</span>
                      <span className="insight-age">{formatInsightAge(insight.createdAtIso)}</span>
                    </div>
                  </div>
                  <p>{prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId)}</p>
                  <small>{prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId)}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="insight-context-note">Refresh AI bench calls to load the latest suggestions.</p>
          )}
        </>
      ) : null}

      {urgentInsights.length > 0 ? (
        <>
          <h3 className="insight-subhead insight-subhead-urgent">
            <span>Urgent Coaching Calls</span>
            <span className="insight-count-badge insight-count-badge-urgent">{urgentInsights.length}</span>
          </h3>
          <div className="insight-list-stack">
            {urgentInsights.map((insight) => (
              <article key={insight.id} className={`insight-item ${getRuleInsightImportanceClass(insight)}`}>
                <div className="insight-title-row">
                  <h3>{formatInsightTypeLabel(insight.type)}</h3>
                  <div className="insight-title-meta">
                    <span className={`insight-badge insight-badge-rules ${getRuleBadgeImportanceClass(insight)}`}>RULE</span>
                    <span className="insight-age">{formatInsightAge(insight.createdAtIso)}</span>
                  </div>
                </div>
                <p>{prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId)}</p>
                <small>{prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId)}</small>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {systemInsights.length > 0 ? (
        <>
          <h3 className="insight-subhead insight-subhead-important">System Alerts</h3>
          <div className="insight-list">
            {systemInsights.slice(0, 5).map((insight) => (
              <article key={insight.id} className={`insight-item ${getRuleInsightImportanceClass(insight)}`}>
                <div className="insight-title-row">
                  <h3>{formatInsightTypeLabel(insight.type)}</h3>
                  <div className="insight-title-meta">
                    <span className={`insight-badge insight-badge-rules ${getRuleBadgeImportanceClass(insight)}`}>RULE</span>
                    <span className="insight-age">{formatInsightAge(insight.createdAtIso)}</span>
                  </div>
                </div>
                <p>{prettifyInsightText(insight.message, insight.relatedTeamId, insight.relatedPlayerId)}</p>
                <small>{prettifyInsightText(insight.explanation, insight.relatedTeamId, insight.relatedPlayerId)}</small>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
