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
  onPlayerQuickShot: (player: Player, points: 2 | 3, made: boolean) => void;
  onPlayerQuickStat: (player: Player, stat: "foul" | "def_reb" | "off_reb" | "turnover" | "steal" | "block" | "assist") => void;

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
    onClose, onPlayerQuickShot, onPlayerQuickStat,
    period, overtimeCount, clockInput, setClockInput, changePeriod, getPeriodOrder,
    gameMoment, setGameMoment, vcSideSetup, homeTeamName, awayTeamName, homeTeamAbbr, awayTeamAbbr,
    scores, homeTeamStats, awayTeamStats, periodTeamFouls, totalTimeoutsLeft,
    trackedPlayers, trackedTopScorer, foulAlerts, pTotals, allEventObjs,
    gameSetup, gameId, gamePhase, homeTeamId, awayTeamId,
  } = props;

  // ── Local state (resets each time modal opens) ──
  const [summaryTab, setSummaryTab] = useState<"teams" | "players">("teams");
  const [summarySortBy, setSummarySortBy] = useState<"points" | "name">("points");
  const [summarySelectedPlayerId, setSummarySelectedPlayerId] = useState<string | null>(null);
  const [summarySuggestionsCollapsed, setSummarySuggestionsCollapsed] = useState(false);
  const [summaryPeriodFilter, setSummaryPeriodFilter] = useState<string[]>([]);
  const [summaryPeriodEditOpen, setSummaryPeriodEditOpen] = useState(false);
  const [summaryMomentEditOpen, setSummaryMomentEditOpen] = useState(false);
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

  const trackedSide = vcSideSetup;
  const trackedAbbr = trackedSide === "home" ? homeTeamAbbr : awayTeamAbbr;
  const oppAbbr = trackedSide === "home" ? awayTeamAbbr : homeTeamAbbr;
  const trackedName = trackedSide === "home" ? homeTeamName : awayTeamName;
  const oppName = trackedSide === "home" ? awayTeamName : homeTeamName;
  const trackedScore = trackedSide === "home" ? scores.home : scores.away;
  const oppScore = trackedSide === "home" ? scores.away : scores.home;
  const trackedFouls = trackedSide === "home" ? periodTeamFouls.home : periodTeamFouls.away;
  const trackedTimeouts = trackedSide === "home" ? totalTimeoutsLeft.home : totalTimeoutsLeft.away;
  const trackedLeading = trackedScore > oppScore;
  const gameTied = trackedScore === oppScore;

  const momentumSummary = useMemo(() => {
    const sorted = [...allEventObjs].sort((a, b) => a.sequence - b.sequence);
    const scoring = sorted.filter((event) =>
      (event.type === "shot_attempt" && event.made) ||
      (event.type === "free_throw_attempt" && event.made)
    );
    const lastScoring = scoring[scoring.length - 1] ?? null;
    const lastScorer = lastScoring?.playerId ? playerNameFromId(lastScoring.playerId, trackedPlayers) : null;

    let runTeamId: string | null = null;
    let runPoints = 0;
    for (let i = scoring.length - 1; i >= 0; i--) {
      const item = scoring[i];
      const pts = item.type === "shot_attempt" ? item.points : 1;
      if (!runTeamId) {
        runTeamId = item.teamId;
        runPoints += pts;
        continue;
      }
      if (item.teamId !== runTeamId) break;
      runPoints += pts;
    }

    const possessionStarts = sorted
      .filter((event) => event.type === "possession_start")
      .slice(-5)
      .map((event) => event.possessedByTeamId === homeTeamId ? homeTeamAbbr : event.possessedByTeamId === awayTeamId ? awayTeamAbbr : "-");

    return {
      runLabel: runTeamId ? `${runTeamId === homeTeamId ? homeTeamAbbr : awayTeamId === runTeamId ? awayTeamAbbr : "UNK"} +${runPoints}` : "No scoring run yet",
      lastScorer: lastScorer ?? "No scorer yet",
      possessions: possessionStarts,
    };
  }, [allEventObjs, awayTeamAbbr, awayTeamId, homeTeamAbbr, homeTeamId, trackedPlayers]);

  const lastMadeShotByPlayerId = useMemo(() => {
    const sorted = [...allEventObjs].sort((a, b) => a.sequence - b.sequence);
    const lastMadeShot = [...sorted].reverse().find((event) => event.type === "shot_attempt" && event.made);
    return lastMadeShot?.playerId ?? null;
  }, [allEventObjs]);

  const activePlayerIds = useMemo(() => {
    const recentPlayerEvents = [...allEventObjs]
      .sort((a, b) => b.sequence - a.sequence)
      .filter((event) => "playerId" in event && typeof (event as { playerId?: string }).playerId === "string")
      .slice(0, 12);
    return new Set(recentPlayerEvents
      .map((event) => (event as { playerId?: string }).playerId)
      .filter((id): id is string => Boolean(id))
    );
  }, [allEventObjs]);

  const sortedSummaryPlayers = useMemo(() => {
    const rows = [...trackedPlayers];
    if (summarySortBy === "name") {
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    }
    rows.sort((a, b) => {
      const pointDelta = (summaryBoxScoreTotals[b.id]?.points ?? 0) - (summaryBoxScoreTotals[a.id]?.points ?? 0);
      if (pointDelta !== 0) return pointDelta;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [summaryBoxScoreTotals, summarySortBy, trackedPlayers]);

  const selectedSummaryPlayer = useMemo(
    () => trackedPlayers.find((player) => player.id === summarySelectedPlayerId) ?? null,
    [summarySelectedPlayerId, trackedPlayers],
  );

  const statComparisonRows = useMemo(() => {
    const trackedStats = trackedSide === "home" ? homeTeamStats : awayTeamStats;
    const oppStats = trackedSide === "home" ? awayTeamStats : homeTeamStats;
    const trackedFgPct = trackedStats.fga > 0 ? trackedStats.fg / trackedStats.fga : 0;
    const oppFgPct = oppStats.fga > 0 ? oppStats.fg / oppStats.fga : 0;
    const tracked3Pct = trackedStats.fg3a > 0 ? trackedStats.fg3 / trackedStats.fg3a : 0;
    const opp3Pct = oppStats.fg3a > 0 ? oppStats.fg3 / oppStats.fg3a : 0;
    const trackedAstTo = trackedStats.to > 0 ? trackedStats.asst / trackedStats.to : trackedStats.asst;
    const oppAstTo = oppStats.to > 0 ? oppStats.asst / oppStats.to : oppStats.asst;
    const trackedStocks = trackedStats.stl + trackedStats.blk;
    const oppStocks = oppStats.stl + oppStats.blk;

    return [
      {
        label: "FG",
        tracked: `${trackedStats.fg}/${trackedStats.fga}`,
        opp: `${oppStats.fg}/${oppStats.fga}`,
        trackedGood: trackedFgPct > oppFgPct,
        oppGood: oppFgPct > trackedFgPct,
      },
      {
        label: "3PT",
        tracked: `${trackedStats.fg3}/${trackedStats.fg3a}`,
        opp: `${oppStats.fg3}/${oppStats.fg3a}`,
        trackedGood: tracked3Pct > opp3Pct,
        oppGood: opp3Pct > tracked3Pct,
      },
      {
        label: "REB",
        tracked: `${trackedStats.reb}`,
        opp: `${oppStats.reb}`,
        trackedGood: trackedStats.reb > oppStats.reb,
        oppGood: oppStats.reb > trackedStats.reb,
      },
      {
        label: "AST/TO",
        tracked: `${trackedStats.asst}/${trackedStats.to}`,
        opp: `${oppStats.asst}/${oppStats.to}`,
        trackedGood: trackedAstTo > oppAstTo,
        oppGood: oppAstTo > trackedAstTo,
      },
      {
        label: "STL/BLK",
        tracked: `${trackedStats.stl}/${trackedStats.blk}`,
        opp: `${oppStats.stl}/${oppStats.blk}`,
        trackedGood: trackedStocks > oppStocks,
        oppGood: oppStocks > trackedStocks,
      },
    ];
  }, [awayTeamStats, homeTeamStats, trackedSide]);

  function compactInsightText(text: string): string {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed.length <= 92) return trimmed;
    return `${trimmed.slice(0, 89).trimEnd()}...`;
  }

  function insightTag(text: string): { label: string; tone: "hot" | "warn" | "cold" | "neutral" } {
    const lower = text.toLowerCase();
    if (lower.includes("turnover") || lower.includes("careless") || lower.includes("ball security")) {
      return { label: "WARN TURNOVERS", tone: "warn" };
    }
    if (lower.includes("cold") || lower.includes("slump") || lower.includes("dry") || lower.includes("miss")) {
      return { label: "COLD STREAK", tone: "cold" };
    }
    if (lower.includes("hot") || lower.includes("pace") || lower.includes("100%") || lower.includes("run") || lower.includes("attack")) {
      return { label: "HOT SHOOTING", tone: "hot" };
    }
    return { label: "LIVE READ", tone: "neutral" };
  }

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
    const trackedPlayerIds = new Set(trackedPlayers.map((player) => player.id));
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
          const matchesTrackedPlayer = Boolean(insight.relatedPlayerId && trackedPlayerIds.has(insight.relatedPlayerId));
          const matchesTrackedTeam = !insight.relatedTeamId || insight.relatedTeamId === trackedTeamId;
          if (!matchesTrackedPlayer && !matchesTrackedTeam) return false;

          return insight.type === "hot_hand"
            || insight.type === "foul_trouble"
            || insight.type === "foul_warning"
            || insight.type === "sub_suggestion"
            || insight.type === "ai_coaching";
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

  // Auto-refresh team insights while modal is open.
  useEffect(() => {
    void fetchOpenAiSummaryInsights();
    const timer = window.setInterval(() => { void fetchOpenAiSummaryInsights(); }, 12000);
    return () => window.clearInterval(timer);
  }, [allEventObjs.length, gameId, gamePhase, period, scores.away, scores.home]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh player insights when players tab is active.
  useEffect(() => {
    if (summaryTab !== "players" || trackedPlayers.length === 0) return;
    void fetchPlayerAiInsights();
    const timer = window.setInterval(() => { void fetchPlayerAiInsights(); }, 15000);
    return () => window.clearInterval(timer);
  }, [summaryTab, trackedPlayers.length, allEventObjs.length, gameId, gamePhase, period, scores.away, scores.home]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal summary-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header summary-header">
          <div className="summary-header-main">
            <span className="modal-title">Game Summary</span>
            <div className="summary-top-strip">
              <div className="summary-top-meta">
                <div className="summary-meta-piece">
                  {summaryPeriodEditOpen ? (
                    <select
                      autoFocus
                      className="summary-inline-select summary-period-control"
                      value={period}
                      onBlur={() => setSummaryPeriodEditOpen(false)}
                      onChange={e => {
                        void changePeriod(e.target.value);
                        setSummaryPeriodEditOpen(false);
                      }}
                    >
                      {periodLabels.map(lbl => (
                        <option key={lbl} value={lbl} disabled={getPeriodOrder(lbl) > getPeriodOrder(period) + 1} style={{ background: "#1d2144" }}>{lbl}</option>
                      ))}
                    </select>
                  ) : (
                    <button className="summary-display-pill summary-period-control" onClick={() => setSummaryPeriodEditOpen(true)}>{period}</button>
                  )}
                </div>
                <span className="summary-meta-divider">•</span>
                <div className="summary-meta-piece">
                  <button
                    className="summary-top-clock-input summary-top-clock"
                    onClick={() => { setSummaryClockPadDigits(""); setSummaryClockPadOpen(v => !v); }}>
                    {summaryClockPadOpen ? formatClockFromPadInput(summaryClockPadDigits) : clockInput}
                  </button>
                </div>
              </div>

              <div className="summary-top-scoreline" role="status" aria-live="polite">
                <span className={`summary-team-tag ${trackedLeading ? "leading" : gameTied ? "tied" : "trailing"}`}>{trackedAbbr}</span>
                <span className={`summary-team-score ${trackedLeading ? "leading" : gameTied ? "tied" : "trailing"}`}>{trackedScore}</span>
                <span className="summary-score-sep">-</span>
                <span className={`summary-team-score ${!trackedLeading && !gameTied ? "leading" : gameTied ? "tied" : "trailing"}`}>{oppScore}</span>
                <span className={`summary-team-tag ${!trackedLeading && !gameTied ? "leading" : gameTied ? "tied" : "trailing"}`}>{oppAbbr}</span>
              </div>

              <div className="summary-top-subline">
                <span className={`summary-substat ${trackedFouls >= 5 ? "warn" : ""}`}>Fouls: {trackedFouls}</span>
                <span className="summary-sub-divider">|</span>
                <span className="summary-substat">TO: {trackedTimeouts}</span>
              </div>

              <div className="summary-top-moment">
                <span className="summary-top-label">Game Moment</span>
                <div>
                  {summaryMomentEditOpen ? (
                    <select
                      autoFocus
                      className="summary-inline-select summary-moment-control"
                      value={gameMoment}
                      onBlur={() => setSummaryMomentEditOpen(false)}
                      onChange={e => {
                        setGameMoment(e.target.value);
                        setSummaryMomentEditOpen(false);
                      }}
                    >
                      <option value="" style={{ background: "#1d2144" }}>-</option>
                      {getGameMomentOptions(period).map(opt => (
                        <option key={opt.value} value={opt.value} style={{ background: "#1d2144" }}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <button className="summary-display-pill summary-display-pill-moment summary-moment-control" onClick={() => setSummaryMomentEditOpen(true)}>
                      {getGameMomentOptions(period).find((opt) => opt.value === gameMoment)?.label ?? "Set moment"}
                    </button>
                  )}
                </div>
              </div>
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
            onClick={() => setSummaryTab("players")}
          >Players{foulAlerts.length > 0 ? ` ! ${foulAlerts.length}` : ""}</button>
        </div>

        <div className="summary-body">
          {/* Teams tab */}
          {summaryTab === "teams" && (<>
            <div className="summary-compare-card">
              <div className="summary-compare-header">
                <span className="summary-compare-label">Stat</span>
                <span className={`summary-compare-team ${trackedLeading ? "leading" : gameTied ? "tied" : "trailing"}`} title={trackedName}>{trackedAbbr}</span>
                <span className={`summary-compare-team ${!trackedLeading && !gameTied ? "leading" : gameTied ? "tied" : "trailing"}`} title={oppName}>{oppAbbr}</span>
              </div>
              {statComparisonRows.map((row) => (
                <div className="summary-compare-row" key={row.label}>
                  <span className="summary-compare-label">{row.label}</span>
                  <strong className={`summary-compare-value ${row.trackedGood ? "good" : row.oppGood ? "bad" : "neutral"}`}>{row.tracked}</strong>
                  <strong className={`summary-compare-value ${row.oppGood ? "good" : row.trackedGood ? "bad" : "neutral"}`}>{row.opp}</strong>
                </div>
              ))}
              <div className="summary-compare-row summary-compare-row-sub">
                <span className="summary-compare-label">FG%</span>
                <strong className="summary-compare-value neutral">{formatPct(trackedSide === "home" ? homeTeamStats.fg : awayTeamStats.fg, trackedSide === "home" ? homeTeamStats.fga : awayTeamStats.fga)}</strong>
                <strong className="summary-compare-value neutral">{formatPct(trackedSide === "home" ? awayTeamStats.fg : homeTeamStats.fg, trackedSide === "home" ? awayTeamStats.fga : homeTeamStats.fga)}</strong>
              </div>
            </div>

            <div className="summary-flow-row">
              <div className="summary-flow-card">
                <h3>Momentum</h3>
                <p className="summary-flow-main">{momentumSummary.runLabel} run</p>
                <p className="summary-flow-sub">Last scorer: {momentumSummary.lastScorer}</p>
                <p className="summary-flow-sub">
                  Last 5 possessions: {momentumSummary.possessions.length > 0 ? momentumSummary.possessions.join(" ") : "Not enough data"}
                </p>
              </div>
            </div>

            <div className="summary-highlights">
              <h3>AI Insight</h3>
              {summaryAiLoading && <p className="summary-ai-status">Updating live insight...</p>}
              <div className="summary-ai-sections">
                {!summaryAiLoading && activeSummaryInsights.length === 0 && (
                  <p className="summary-ai-status">No insight yet. Keep logging possessions.</p>
                )}
                {activeSummaryInsights.map((insight, index) => {
                  const tag = insightTag(insight);
                  return (
                    <div key={index} className={`insight-section insight-${tag.tone}`}>
                      <span className={`insight-label insight-label-${tag.tone}`}>{tag.label}</span>
                      <p className="insight-text">{compactInsightText(insight)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>)}

          {/* Players tab */}
          {summaryTab === "players" && (<>
            <div className="summary-players-toolbar">
              <div className="summary-player-sort-wrap">
                <span className="summary-top-label">Sort</span>
                <select
                  className="summary-inline-select summary-inline-select-sort"
                  value={summarySortBy}
                  onChange={(event) => setSummarySortBy(event.target.value as "points" | "name")}
                >
                  <option value="points">Points</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>

            <div className="summary-highlights summary-player-suggestions">
              <button
                className="summary-collapse-btn"
                onClick={() => setSummarySuggestionsCollapsed((current) => !current)}
                aria-expanded={!summarySuggestionsCollapsed}
              >
                AI Suggestions {summarySuggestionsCollapsed ? "Show" : "Hide"}
              </button>
              {!summarySuggestionsCollapsed && (
                <>
                  {summaryPlayerAiLoading && <p className="summary-ai-status">Generating player insights...</p>}
                  {!summaryPlayerAiLoading && trackedPlayers.length === 0 && (
                    <p className="summary-ai-status">Add a roster to get player-specific suggestions.</p>
                  )}
                  <div className="summary-ai-sections">
                    {!summaryPlayerAiLoading && trackedPlayers.length > 0 && (summaryPlayerAiInsights ?? []).length === 0 && (
                      <p className="summary-ai-status">No suggestions yet - capture more possessions or check your connection.</p>
                    )}
                    {(summaryPlayerAiInsights ?? []).slice(0, 3).map((insight, index) => {
                      const tag = insightTag(insight);
                      return (
                        <div key={index} className={`insight-section insight-${tag.tone}`}>
                          <span className={`insight-label insight-label-${tag.tone}`}>{tag.label}</span>
                          <p className="insight-text">{compactInsightText(insight)}</p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

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
                  <span className="sph-stat">Shooting</span>
                  <span className="sph-stat">Play</span>
                  <span className="sph-stat">Def</span>
                  <span className="sph-stat">FL</span>
                </div>
                {sortedSummaryPlayers.map(p => {
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
                    const isZeroLine = pts + fgm + tpm + ftm + reb + ast + stl + blk + turnovers + fouls === 0;
                    const foulColor = fouls >= 5 ? "#ff3b30" : fouls === 4 ? "#ff9500" : fouls === 3 ? "#ffcc00" : fouls > 0 ? "rgba(232,234,240,0.75)" : "rgba(232,234,240,0.35)";
                    const isTopScorer = trackedTopScorer && p.name === trackedTopScorer.name && pts > 0;
                    const hasFoulAlert = fouls >= 4 || turnovers >= 3;
                    const isHot = lastMadeShotByPlayerId === p.id || (pts >= 6 && fgm >= 3);
                    const isActive = activePlayerIds.has(p.id);
                    const isSelected = summarySelectedPlayerId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`summary-player-row clickable${isSelected ? " is-selected" : ""}${isZeroLine ? " is-cold" : ""}${hasFoulAlert ? " foul-alert-row" : ""}${isTopScorer ? " top-scorer-row" : ""}`}
                        onClick={() => setSummarySelectedPlayerId((current) => current === p.id ? null : p.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSummarySelectedPlayerId((current) => current === p.id ? null : p.id);
                          }
                        }}
                      >
                        <span className="spr-name">
                          {p.number != null ? <span className="spr-num">#{p.number}</span> : null}
                          {p.name}
                          {isHot && <span className="spr-badge spr-badge-hot">🔥</span>}
                          {isActive && <span className="spr-badge spr-badge-active">●</span>}
                          {hasFoulAlert && <span className="spr-badge spr-badge-warn">⚠</span>}
                          {isTopScorer && <span className="spr-badge spr-badge-pts">Top</span>}
                          {fouls >= 5 && <span className="spr-badge spr-badge-out">OUT</span>}
                        </span>
                        <span className={`spr-stat spr-pts${pts === 0 ? " stat-zero" : ""}`}>{pts}</span>
                        <span className="spr-group">
                          <span className={`spr-stat${fgm + fga === 0 ? " stat-zero" : ""}`}>FG {fgm}-{fga}</span>
                          <span className={`spr-stat${tpm + tpa === 0 ? " stat-zero" : ""}`}>3P {tpm}-{tpa}</span>
                          <span className={`spr-stat${ftm + fta === 0 ? " stat-zero" : ""}`}>FT {ftm}-{fta}</span>
                        </span>
                        <span className="spr-group">
                          <span className={`spr-stat${ast === 0 ? " stat-zero" : ""}`}>AST {ast}</span>
                          <span className={`spr-stat${turnovers === 0 ? " stat-zero" : turnovers >= 3 ? " spr-to-warn" : ""}`}>TO {turnovers}</span>
                        </span>
                        <span className="spr-group">
                          <span className={`spr-stat${reb === 0 ? " stat-zero" : ""}`}>REB {reb}</span>
                          <span className={`spr-stat${stl + blk === 0 ? " stat-zero" : ""}`}>STL/BLK {stl}/{blk}</span>
                        </span>
                        <span className="spr-stat spr-fouls" style={{ color: foulColor }}>{fouls}</span>
                      </div>
                    );
                  })}
              </div>
            )}

            {selectedSummaryPlayer && (
              <div className="summary-player-action-panel">
                <div className="summary-player-action-heading">
                  <strong>{selectedSummaryPlayer.number != null ? `#${selectedSummaryPlayer.number} ` : ""}{selectedSummaryPlayer.name}</strong>
                  <span>Quick Update</span>
                </div>
                <div className="summary-player-action-grid">
                  <button className="summary-qa-btn" onClick={() => onPlayerQuickShot(selectedSummaryPlayer, 2, true)}>+2 PTS</button>
                  <button className="summary-qa-btn" onClick={() => onPlayerQuickShot(selectedSummaryPlayer, 3, true)}>+3 PTS</button>
                  <button className="summary-qa-btn" onClick={() => onPlayerQuickStat(selectedSummaryPlayer, "def_reb")}>REBOUND</button>
                  <button className="summary-qa-btn" onClick={() => onPlayerQuickStat(selectedSummaryPlayer, "assist")}>ASSIST</button>
                  <button className="summary-qa-btn summary-qa-btn-alert" onClick={() => onPlayerQuickStat(selectedSummaryPlayer, "turnover")}>TURNOVER</button>
                  <button className="summary-qa-btn summary-qa-btn-alert" onClick={() => onPlayerQuickStat(selectedSummaryPlayer, "foul")}>FOUL</button>
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
