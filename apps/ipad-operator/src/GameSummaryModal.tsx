import { useEffect, useMemo, useState } from "react";
import type { GameEvent } from "@bta/shared-schema";
import { formatClockFromPadInput } from "./helpers/clock.js";
import { computePlayerTotals } from "./helpers/events.js";
import { apiKeyHeader } from "./helpers/network.js";
import { formatPct, playerNameFromId } from "./helpers/players.js";
import type { Player, RunningTotals, SharedLiveInsight } from "./types.js";
import type { TeamSide } from "./types.js";
import { DEFAULT_API } from "./constants.js";

/** Inferred return type of computeTeamStats */
type TeamStats = {
  fg: number; fga: number; fg3: number; fg3a: number; ft: number; fta: number;
  oreb: number; dreb: number; reb: number; asst: number; to: number; stl: number; blk: number; fouls: number;
};

export interface GameSummaryModalProps {
  onClose: () => void;

  // Period / clock
  period: string;
  overtimeCount: number;
  clockInput: string;
  setClockInput: (v: string) => void;
  changePeriod: (p: string) => Promise<void>;
  getPeriodOrder: (label: string) => number;

  // Game moment
  gameMoment: string;
  setGameMoment: (v: string) => void;

  // Teams
  vcSideSetup: TeamSide;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;

  // Scores & stats
  scores: { home: number; away: number };
  homeTeamStats: TeamStats;
  awayTeamStats: TeamStats;
  periodTeamFouls: { home: number; away: number };
  totalTimeoutsLeft: { home: number; away: number };

  // Players
  trackedPlayers: Player[];
  trackedTopScorer: { name: string; points: number } | undefined;
  foulAlerts: Player[];
  pTotals: Record<string, RunningTotals>;
  allEventObjs: GameEvent[];

  // API config for AI fetches
  gameSetup: { apiUrl?: string; apiKey?: string; schoolId?: string };
  gameId: string;
  gamePhase: string;
  homeTeamId: string;
  awayTeamId: string;
}

function getGameMomentOptions(period: string): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = [
    { value: "start-of-game", label: "Start of Game" },
  ];
  const totalQuarters = Math.max(4, (period?.replace("OT", "") ? 4 : 0));
  for (let i = 1; i <= totalQuarters; i++) {
    opts.push({ value: `start-of-q${i}`, label: `Start of Q${i}` });
  }
  opts.push({ value: "halftime", label: "Halftime" });
  for (let i = 1; i <= totalQuarters; i++) {
    opts.push({ value: `end-of-q${i}`, label: `End of Q${i}` });
  }
  const ot = parseInt(period?.replace("OT", "") || "0", 10);
  if (ot > 0) {
    for (let i = 1; i <= ot; i++) {
      opts.push({ value: `ot${i}`, label: `OT${i}` });
    }
  }
  opts.push({ value: "timeout", label: "Timeout" });
  opts.push({ value: "end-of-game", label: "End of Game" });
  return opts;
}

export function GameSummaryModal(props: GameSummaryModalProps) {
  const {
    onClose, period, overtimeCount, clockInput, setClockInput, changePeriod, getPeriodOrder,
    gameMoment, setGameMoment, vcSideSetup, homeTeamName, awayTeamName, homeTeamAbbr, awayTeamAbbr,
    scores, homeTeamStats, awayTeamStats, periodTeamFouls, totalTimeoutsLeft,
    trackedPlayers, trackedTopScorer, foulAlerts, pTotals, allEventObjs,
    gameSetup, gameId, gamePhase, homeTeamId, awayTeamId,
  } = props;

  // ── Local state (resets each time modal opens) ──
  const [summaryTab, setSummaryTab] = useState<"teams" | "players">("teams");
  const [summaryPeriodFilter, setSummaryPeriodFilter] = useState<string[]>([]);
  const [summaryClockPadOpen, setSummaryClockPadOpen] = useState(false);
  const [summaryClockPadDigits, setSummaryClockPadDigits] = useState("");
  const [summaryAiInsights, setSummaryAiInsights] = useState<string[] | null>(null);
  const [summaryAiLoading, setSummaryAiLoading] = useState(false);
  const [summaryPlayerAiInsights, setSummaryPlayerAiInsights] = useState<string[] | null>(null);
  const [summaryPlayerAiLoading, setSummaryPlayerAiLoading] = useState(false);

  const activeSummaryInsights = summaryAiInsights ?? [];

  const summaryBoxScoreTotals = useMemo(() => {
    if (summaryPeriodFilter.length === 0) return pTotals;
    const filterSet = new Set(summaryPeriodFilter);
    const filtered = allEventObjs.filter(e => filterSet.has(e.period));
    return computePlayerTotals(filtered);
  }, [summaryPeriodFilter, allEventObjs, pTotals]);

  const periodLabels = [
    "Q1", "Q2", "Q3", "Q4",
    ...Array.from({ length: overtimeCount }, (_, index) => `OT${index + 1}`),
  ];

  // ── AI fetch ──

  async function fetchOpenAiSummaryInsights() {
    const apiUrl = gameSetup.apiUrl?.trim() || DEFAULT_API;
    const totalScore = scores.home + scores.away;
    if (gamePhase !== "live" || (period === "Q1" && totalScore === 0 && allEventObjs.length < 5)) {
      setSummaryAiInsights(null);
      return;
    }
    setSummaryAiLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/games/${gameId}/insights`, {
        method: "GET",
        headers: { ...apiKeyHeader(gameSetup) },
      });
      if (!res.ok) { setSummaryAiInsights(null); return; }
      const insights = await res.json() as SharedLiveInsight[];
      if (!Array.isArray(insights) || insights.length === 0) { setSummaryAiInsights(null); return; }
      const lines = insights
        .filter((insight) => insight.type === "ai_coaching" || insight.confidence !== "low")
        .slice(0, 7)
        .map((insight) => {
          const base = insight.message?.trim() || insight.explanation?.trim() || "No insight text available.";
          const why = insight.explanation?.trim() || "";
          return why && !base.includes(why) ? `${base} - ${why}` : base;
        });
      setSummaryAiInsights(lines.length > 0 ? lines : null);
    } catch {
      setSummaryAiInsights(null);
    } finally {
      setSummaryAiLoading(false);
    }
  }

  async function fetchPlayerAiInsights() {
    if (trackedPlayers.length === 0) return;
    const trackedSide: TeamSide = vcSideSetup;
    const apiUrl = gameSetup.apiUrl?.trim() || DEFAULT_API;
    const trackedTeamId = trackedSide === "home" ? homeTeamId : awayTeamId;
    const totalScore = scores.home + scores.away;
    if (gamePhase !== "live" || (period === "Q1" && totalScore === 0 && allEventObjs.length < 5)) {
      setSummaryPlayerAiInsights(null);
      return;
    }
    setSummaryPlayerAiLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/games/${gameId}/insights`, {
        method: "GET",
        headers: { ...apiKeyHeader(gameSetup) },
      });
      if (!res.ok) { setSummaryPlayerAiInsights(null); return; }
      const insights = await res.json() as SharedLiveInsight[];
      if (!Array.isArray(insights) || insights.length === 0) { setSummaryPlayerAiInsights(null); return; }
      const playerLines = insights
        .filter((insight) => {
          if (!insight.relatedTeamId || insight.relatedTeamId !== trackedTeamId) return false;
          return insight.type === "hot_hand"
            || insight.type === "foul_trouble"
            || insight.type === "foul_warning"
            || insight.type === "sub_suggestion"
            || (insight.type === "ai_coaching" && Boolean(insight.relatedPlayerId));
        })
        .slice(0, 7)
        .map((insight) => {
          const playerName = playerNameFromId(insight.relatedPlayerId, trackedPlayers);
          const core = insight.message?.trim() || insight.explanation?.trim() || "No player guidance available.";
          return insight.relatedPlayerId ? `${playerName}: ${core}` : core;
        });
      setSummaryPlayerAiInsights(playerLines.length > 0 ? playerLines : null);
    } catch {
      setSummaryPlayerAiInsights(null);
    } finally {
      setSummaryPlayerAiLoading(false);
    }
  }

  // Auto-fetch team insights on mount
  useEffect(() => { void fetchOpenAiSummaryInsights(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal summary-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header summary-header">
          <div className="summary-header-main">
            <span className="modal-title">Game Summary</span>
            {/* Scoreboard strip: editable quarter + clock + live scores */}
            <div className="summary-top-strip">
              <div className="summary-top-item">
                <span className="summary-top-label">Qtr</span>
                <select
                  className="summary-top-value"
                  value={period}
                  onChange={e => { void changePeriod(e.target.value); }}
                  style={{ background: "transparent", color: "inherit", border: "none", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer" }}
                >
                  {periodLabels.map(lbl => (
                    <option key={lbl} value={lbl} disabled={getPeriodOrder(lbl) > getPeriodOrder(period) + 1} style={{ background: "#302f68" }}>{lbl}</option>
                  ))}
                </select>
              </div>
              <div className="summary-top-item">
                <span className="summary-top-label">Clock</span>
                <button
                  className="summary-top-clock-input summary-top-clock clock-inp-display"
                  onClick={() => { setSummaryClockPadDigits(""); setSummaryClockPadOpen(v => !v); }}>
                  {summaryClockPadOpen ? formatClockFromPadInput(summaryClockPadDigits) : clockInput}
                </button>
                {summaryClockPadOpen && (
                  <div className="clock-numpad-overlay" onClick={() => setSummaryClockPadOpen(false)}>
                    <div className="clock-numpad" onClick={e => e.stopPropagation()}>
                      <div className="clock-numpad-preview">{formatClockFromPadInput(summaryClockPadDigits)}</div>
                      <div className="clock-numpad-grid">
                        {([1,2,3,4,5,6,7,8,9,".",0,"DEL"] as (number|string)[]).map((k, i) => (
                          <button
                            key={i}
                            className="clock-numpad-key"
                            onClick={() => {
                              if (k === "DEL") {
                                setSummaryClockPadDigits(d => d.slice(0, -1));
                              } else if (k === ".") {
                                setSummaryClockPadDigits(d => d.includes(".") ? d : d + ".");
                              } else {
                                setSummaryClockPadDigits(d => {
                                  const dotIdx = d.indexOf(".");
                                  if (dotIdx !== -1) { return d.length > dotIdx + 1 ? d : d + String(k); }
                                  return (d + String(k)).slice(0, 4);
                                });
                              }
                            }}>
                            {k}
                          </button>
                        ))}
                      </div>
                      <div className="clock-numpad-actions">
                        <button className="clock-numpad-cancel" onClick={() => setSummaryClockPadOpen(false)}>Cancel</button>
                        <button className="clock-numpad-set" onClick={() => {
                          setClockInput(formatClockFromPadInput(summaryClockPadDigits));
                          setSummaryClockPadOpen(false);
                        }}>Set</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="summary-top-item">
                <span className="summary-top-label">Moment</span>
                <select
                  className="summary-top-value"
                  value={gameMoment}
                  onChange={e => setGameMoment(e.target.value)}
                  style={{ background: "transparent", color: "inherit", border: "none", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer" }}
                >
                  <option value="" style={{ background: "#302f68" }}>-</option>
                  {getGameMomentOptions(period).map(opt => (
                    <option key={opt.value} value={opt.value} style={{ background: "#302f68" }}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="summary-top-item">
                <span className="summary-top-label">Score</span>
                <div className="summary-top-dual">
                  <span className="summary-top-dual-row">{vcSideSetup === "home" ? homeTeamAbbr : awayTeamAbbr} {vcSideSetup === "home" ? scores.home : scores.away}</span>
                  <span className="summary-top-dual-row">{vcSideSetup === "home" ? awayTeamAbbr : homeTeamAbbr} {vcSideSetup === "home" ? scores.away : scores.home}</span>
                </div>
              </div>
              <div className="summary-top-item">
                <span className="summary-top-label">Fouls</span>
                <div className="summary-top-dual">
                  {vcSideSetup === "home" ? (<>
                    <span className={`summary-top-dual-row${periodTeamFouls.home >= 5 ? " foul-count-danger" : periodTeamFouls.home === 4 ? " foul-count-warn" : ""}`}>{homeTeamAbbr} {periodTeamFouls.home}</span>
                    <span className={`summary-top-dual-row${periodTeamFouls.away >= 5 ? " foul-count-danger" : periodTeamFouls.away === 4 ? " foul-count-warn" : ""}`}>{awayTeamAbbr} {periodTeamFouls.away}</span>
                  </>) : (<>
                    <span className={`summary-top-dual-row${periodTeamFouls.away >= 5 ? " foul-count-danger" : periodTeamFouls.away === 4 ? " foul-count-warn" : ""}`}>{awayTeamAbbr} {periodTeamFouls.away}</span>
                    <span className={`summary-top-dual-row${periodTeamFouls.home >= 5 ? " foul-count-danger" : periodTeamFouls.home === 4 ? " foul-count-warn" : ""}`}>{homeTeamAbbr} {periodTeamFouls.home}</span>
                  </>)}
                </div>
              </div>
              <div className="summary-top-item">
                <span className="summary-top-label">TO Left</span>
                <div className="summary-top-dual">
                  <span className="summary-top-dual-row">{vcSideSetup === "home" ? homeTeamAbbr : awayTeamAbbr} {vcSideSetup === "home" ? totalTimeoutsLeft.home : totalTimeoutsLeft.away}</span>
                  <span className="summary-top-dual-row">{vcSideSetup === "home" ? awayTeamAbbr : homeTeamAbbr} {vcSideSetup === "home" ? totalTimeoutsLeft.away : totalTimeoutsLeft.home}</span>
                </div>
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        {/* Tab bar */}
        <div className="summary-tab-bar">
          <button
            className={`summary-tab-btn${summaryTab === "teams" ? " active" : ""}`}
            onClick={() => setSummaryTab("teams")}
          >Teams</button>
          <button
            className={`summary-tab-btn${summaryTab === "players" ? " active" : ""}`}
            onClick={() => {
              setSummaryTab("players");
              if (!summaryPlayerAiInsights && !summaryPlayerAiLoading) {
                void fetchPlayerAiInsights();
              }
            }}
          >Players{foulAlerts.length > 0 ? ` ! ${foulAlerts.length}` : ""}</button>
        </div>

        <div className="summary-body">
          {/* Teams tab */}
          {summaryTab === "teams" && (<>
            <div className="summary-stats-grid">
              {(() => {
                const myStats = vcSideSetup === "home" ? homeTeamStats : awayTeamStats;
                const myName = vcSideSetup === "home" ? homeTeamName : awayTeamName;
                const oppStats = vcSideSetup === "home" ? awayTeamStats : homeTeamStats;
                const oppName = vcSideSetup === "home" ? awayTeamName : homeTeamName;
                const renderCard = (name: string, stats: typeof homeTeamStats) => (
                  <div className="summary-stat-card">
                    <h3>{name}</h3>
                    <div className="summary-stat-row"><span>FG</span><strong>{stats.fg}-{stats.fga} ({formatPct(stats.fg, stats.fga)})</strong></div>
                    <div className="summary-stat-row"><span>3PT</span><strong>{stats.fg3}-{stats.fg3a}</strong></div>
                    <div className="summary-stat-row"><span>FT</span><strong>{stats.ft}-{stats.fta}</strong></div>
                    <div className="summary-stat-row"><span>REB</span><strong>{stats.reb}</strong></div>
                    <div className="summary-stat-row"><span>AST / TO</span><strong>{stats.asst} / {stats.to}</strong></div>
                    <div className="summary-stat-row"><span>STL / BLK</span><strong>{stats.stl} / {stats.blk}</strong></div>
                  </div>
                );
                return <>{renderCard(myName, myStats)}{renderCard(oppName, oppStats)}</>;
              })()}
            </div>

            <div className="summary-highlights">
              <h3>AI Insights</h3>
              {summaryAiLoading && <p className="summary-ai-status">Generating insights...</p>}
              <div className="summary-ai-sections">
                {!summaryAiLoading && activeSummaryInsights.length === 0 && (
                  <p className="summary-ai-status">No insights yet. Capture a few more possessions.</p>
                )}
                {activeSummaryInsights.map((insight, index) => (
                  <div key={index} className="insight-section">
                    <p className="insight-text">{insight}</p>
                  </div>
                ))}
              </div>
              {!summaryAiLoading && (
                <button
                  className="summary-ai-refresh-btn"
                  onClick={() => { setSummaryAiInsights(null); void fetchOpenAiSummaryInsights(); }}
                >Refresh</button>
              )}
            </div>
          </>)}

          {/* Players tab */}
          {summaryTab === "players" && (<>
            {/* Period filter pills */}
            <div className="summary-period-filter">
              <button
                className={`summary-period-pill${summaryPeriodFilter.length === 0 ? " active" : ""}`}
                onClick={() => setSummaryPeriodFilter([])}
              >Full</button>
              {(["Q1", "Q2", "Q3", "Q4", ...Array.from({ length: overtimeCount }, (_, i) => `OT${i + 1}`)]).map(p => (
                <button
                  key={p}
                  className={`summary-period-pill${summaryPeriodFilter.includes(p) ? " active" : ""}`}
                  onClick={() => setSummaryPeriodFilter(prev => {
                    if (prev.includes(p)) {
                      const next = prev.filter(x => x !== p);
                      return next;
                    }
                    return [...prev, p];
                  })}
                >{p}</button>
              ))}
            </div>
            {trackedPlayers.length === 0 ? (
              <p className="summary-no-players">No tracked players - add a roster to see individual stats.</p>
            ) : (
              <div className="summary-player-list">
                {/* header row */}
                <div className="summary-player-header">
                  <span className="sph-name">Player</span>
                  <span className="sph-stat">PTS</span>
                  <span className="sph-stat">FG</span>
                  <span className="sph-stat">3P</span>
                  <span className="sph-stat">FT</span>
                  <span className="sph-stat">REB</span>
                  <span className="sph-stat">AST</span>
                  <span className="sph-stat">STL</span>
                  <span className="sph-stat">BLK</span>
                  <span className="sph-stat">TO</span>
                  <span className="sph-stat">FL</span>
                </div>
                {[...trackedPlayers]
                  .sort((a, b) => (summaryBoxScoreTotals[b.id]?.points ?? 0) - (summaryBoxScoreTotals[a.id]?.points ?? 0))
                  .map(p => {
                    const t = summaryBoxScoreTotals[p.id];
                    const pts = t?.points ?? 0;
                    const fgm = t?.fgm ?? 0;
                    const fga = t?.fga ?? 0;
                    const tpm = t?.threePm ?? 0;
                    const tpa = t?.threePa ?? 0;
                    const ftm = t?.ftm ?? 0;
                    const fta = t?.fta ?? 0;
                    const reb = (t?.oreb ?? 0) + (t?.dreb ?? 0);
                    const ast = t?.ast ?? 0;
                    const stl = t?.stl ?? 0;
                    const blk = t?.blk ?? 0;
                    const turnovers = t?.to ?? 0;
                    const fouls = t?.fouls ?? 0;
                    const foulColor = fouls >= 5 ? "#ff3b30" : fouls === 4 ? "#ff9500" : fouls === 3 ? "#ffcc00" : fouls > 0 ? "rgba(232,234,240,0.75)" : "rgba(232,234,240,0.35)";
                    const isTopScorer = trackedTopScorer && p.name === trackedTopScorer.name && pts > 0;
                    const hasFoulAlert = fouls >= 4;
                    return (
                      <div
                        key={p.id}
                        className={`summary-player-row${hasFoulAlert ? " foul-alert-row" : ""}${isTopScorer ? " top-scorer-row" : ""}`}
                      >
                        <span className="spr-name">
                          {p.number != null ? <span className="spr-num">#{p.number}</span> : null}
                          {p.name}
                          {isTopScorer && <span className="spr-badge spr-badge-pts">Top</span>}
                          {fouls >= 5 && <span className="spr-badge spr-badge-out">OUT</span>}
                        </span>
                        <span className="spr-stat spr-pts">{pts}</span>
                        <span className="spr-stat">{fgm}-{fga}</span>
                        <span className="spr-stat">{tpm}-{tpa}</span>
                        <span className="spr-stat">{ftm}-{fta}</span>
                        <span className="spr-stat">{reb}</span>
                        <span className="spr-stat">{ast}</span>
                        <span className="spr-stat">{stl}</span>
                        <span className="spr-stat">{blk}</span>
                        <span className={`spr-stat${turnovers >= 3 ? " spr-to-warn" : ""}`}>{turnovers}</span>
                        <span className="spr-stat spr-fouls" style={{ color: foulColor }}>{fouls}</span>
                      </div>
                    );
                  })
                }
              </div>
            )}

            {/* Player-focused AI suggestions */}
            <div className="summary-highlights">
              <h3>Player Suggestions</h3>
              {summaryPlayerAiLoading && <p className="summary-ai-status">Generating player insights...</p>}
              {!summaryPlayerAiLoading && trackedPlayers.length === 0 && (
                <p className="summary-ai-status">Add a roster to get player-specific suggestions.</p>
              )}
              <div className="summary-ai-sections">
                {!summaryPlayerAiLoading && trackedPlayers.length > 0 && (summaryPlayerAiInsights ?? []).length === 0 && (
                  <p className="summary-ai-status">No suggestions yet - capture more possessions or check your connection.</p>
                )}
                {(summaryPlayerAiInsights ?? []).map((insight, index) => (
                  <div key={index} className="insight-section">
                    <p className="insight-text">{insight}</p>
                  </div>
                ))}
              </div>
              {!summaryPlayerAiLoading && trackedPlayers.length > 0 && (
                <button
                  className="summary-ai-refresh-btn"
                  onClick={() => { setSummaryPlayerAiInsights(null); void fetchPlayerAiInsights(); }}
                >Refresh</button>
              )}
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
