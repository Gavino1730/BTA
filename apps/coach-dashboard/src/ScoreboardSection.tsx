import type { PlayerStats, TeamStats } from "@bta/game-state";
import { formatFoulTroubleLabel } from "./display.js";

interface TeamData {
  score: number;
  bonus: boolean;
  possessions: number;
  activeLineup: string[];
  teamStats: TeamStats;
  playerStats: Record<string, PlayerStats>;
  timeoutsUsed: number;
  periodFouls: number;
}

interface Props {
  isLoading: boolean;
  dashboardStatus: string;
  teams: string[];
  aggregatedTeams: Record<string, TeamData>;
  canonicalTeamId: (id: string) => string;
  teamColorById: Record<string, string>;
  getScoreboardLineup: (teamId: string) => { playerIds: string[]; isEstimated: boolean };
  displayTeamName: (teamId: string) => string;
  displayPlayerName: (teamId: string, playerId: string) => string;
  leadersByTeam: Record<string, { scoringLeader?: PlayerStats; foulLeader?: PlayerStats }>;
  canonicalSideIds: { homeId: string; awayId: string };
  currentPeriod: string | undefined;
}

export function ScoreboardSection({
  isLoading,
  dashboardStatus,
  teams,
  aggregatedTeams,
  canonicalTeamId,
  teamColorById,
  getScoreboardLineup,
  displayTeamName,
  displayPlayerName,
  leadersByTeam,
  canonicalSideIds,
  currentPeriod,
}: Props) {
  return (
    <>
      <section className="card">
        <h2>Scoreboard</h2>
        {isLoading && (
          <div className="loading-indicator">
            <div className="loading-spinner" />
            <p className="loading-text">{dashboardStatus}</p>
          </div>
        )}
        {teams.length === 0 ? <p>No live game state yet.</p> : null}
        <div className="scoreboard">
          {teams.map((teamId, index) => {
            const scoreboardLineup = getScoreboardLineup(teamId);
            const teamColor = teamColorById[canonicalTeamId(teamId)];
            const td = aggregatedTeams[teamId] ?? aggregatedTeams[canonicalTeamId(teamId)];
            const fgMade = td?.teamStats.shooting.fgMade ?? 0;
            const fgAtt = td?.teamStats.shooting.fgAttempts ?? 0;
            const fgMade3 = td?.teamStats.shooting.fgMade3 ?? 0;
            const fgAtt3 = td?.teamStats.shooting.fgAttempts3 ?? 0;
            const ftMade = td?.teamStats.shooting.ftMade ?? 0;
            const ftAtt = td?.teamStats.shooting.ftAttempts ?? 0;
            const fgPct = fgAtt > 0 ? Math.round((fgMade / fgAtt) * 100) : null;
            const ftPct = ftAtt > 0 ? Math.round((ftMade / ftAtt) * 100) : null;
            const efgPct = fgAtt > 0 ? Math.round(((fgMade + 0.5 * fgMade3) / fgAtt) * 100) : null;
            const score = td?.score ?? 0;
            const possessions = td?.possessions ?? 0;
            const ppp = possessions >= 5 ? (score / possessions).toFixed(2) : null;
            const ftRate = fgAtt > 0 ? Math.round((ftAtt / fgAtt) * 100) : null;
            const totalFouls = td?.teamStats.fouls ?? 0;
            const periodFouls = td?.periodFouls ?? 0;
            const timeoutsUsed = td?.timeoutsUsed ?? 0;
            const TOTAL_TIMEOUTS = 5;
            const timeoutsLeft = Math.max(0, TOTAL_TIMEOUTS - timeoutsUsed);
            const inBonus = td?.bonus ?? false;
            const rebounds = (td?.teamStats.reboundsOff ?? 0) + (td?.teamStats.reboundsDef ?? 0);
            const foulUrgency =
              periodFouls >= 5 ? "foul-danger" :
              periodFouls >= 4 ? "foul-warn" :
              periodFouls >= 3 ? "foul-caution" : "";
            return (
              <article
                key={teamId}
                className={`score-item ${index === 0 ? "score-item-home" : "score-item-away"}`}
                style={teamColor ? {
                  background: `linear-gradient(180deg, ${teamColor}40, ${teamColor}18)`,
                  borderColor: `${teamColor}99`,
                } : undefined}
              >
                {/* Header */}
                <header className="score-item-header">
                  <div className="score-item-title">
                    <h3>{displayTeamName(teamId)}</h3>
                    {index === 0 && <span className="your-team-badge">YOUR TEAM</span>}
                  </div>
                  <div className="score-block">
                    <p className="score">{td?.score ?? 0}</p>
                    <span className="score-period-label">{currentPeriod ?? "-"}</span>
                  </div>
                </header>

                {/* Fouls + Bonus + Timeouts row */}
                <div className="sb-urgency-row">
                  <div className={`sb-foul-block ${foulUrgency}`}>
                    <span className="sb-urgency-label">FOULS</span>
                    <div className="sb-foul-pips">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={`sb-foul-pip ${i < periodFouls ? "sb-foul-pip-on" : ""} ${periodFouls >= 5 && i < periodFouls ? "sb-foul-pip-danger" : periodFouls >= 4 && i < periodFouls ? "sb-foul-pip-warn" : ""}`}
                        />
                      ))}
                      <span className="sb-foul-count">{periodFouls}/5</span>
                    </div>
                    <span className="sb-foul-game-total">{totalFouls} game</span>
                  </div>

                  <div className={`sb-bonus-block ${inBonus ? "sb-bonus-on" : ""}`}>
                    <span className="sb-urgency-label">BONUS</span>
                    <span className="sb-bonus-value">{inBonus ? "IN BONUS" : "OFF"}</span>
                  </div>

                  <div className="sb-timeout-block">
                    <span className="sb-urgency-label">TIMEOUTS</span>
                    <div className="sb-timeout-pips">
                      {Array.from({ length: TOTAL_TIMEOUTS }).map((_, i) => (
                        <span
                          key={i}
                          className={`sb-timeout-pip ${i < timeoutsLeft ? "sb-timeout-pip-on" : "sb-timeout-pip-used"}`}
                        />
                      ))}
                    </div>
                    <span className="sb-timeout-count">{timeoutsLeft} left</span>
                  </div>
                </div>

                {/* Quick-stat grid */}
                <div className="sb-stat-grid">
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">FG</span>
                    <span className="sb-stat-value">{fgMade}/{fgAtt}</span>
                    {fgPct !== null && <span className="sb-stat-pct">{fgPct}%</span>}
                  </div>
                  <div className="sb-stat-cell" title="Effective field goal % — weights 3-pointers: (FGM + 0.5×3PM) / FGA">
                    <span className="sb-stat-label">eFG%</span>
                    <span className="sb-stat-value">{efgPct !== null ? `${efgPct}%` : "—"}</span>
                    <span className="sb-stat-pct">{fgMade3}/{fgAtt3} 3PT</span>
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">FT</span>
                    <span className="sb-stat-value">{ftMade}/{ftAtt}</span>
                    {ftPct !== null && <span className="sb-stat-pct">{ftPct}%</span>}
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">REB</span>
                    <span className="sb-stat-value">{rebounds}</span>
                    <span className="sb-stat-pct">{td?.teamStats.reboundsOff ?? 0}O / {td?.teamStats.reboundsDef ?? 0}D</span>
                  </div>
                  <div className="sb-stat-cell">
                    <span className="sb-stat-label">TO</span>
                    <span className="sb-stat-value">{td?.teamStats.turnovers ?? 0}</span>
                  </div>
                  <div className="sb-stat-cell" title="Points per possession">
                    <span className="sb-stat-label">PPP</span>
                    <span className="sb-stat-value">{ppp ?? "—"}</span>
                    <span className="sb-stat-pct">{possessions} poss</span>
                  </div>
                  <div className="sb-stat-cell" title="Free throw attempts per field goal attempt">
                    <span className="sb-stat-label">FT Rate</span>
                    <span className="sb-stat-value">{ftRate !== null ? `${ftRate}%` : "—"}</span>
                    <span className="sb-stat-pct">{ftAtt} FTA</span>
                  </div>
                </div>

                {/* Lineup */}
                <div className="sb-lineup-row">
                  <span className="sb-section-label">ON COURT</span>
                  <div className="sb-lineup-chips">
                    {scoreboardLineup.playerIds.length > 0
                      ? scoreboardLineup.playerIds.map((playerId) => (
                          <span key={playerId} className="sb-player-chip">
                            {displayPlayerName(teamId, playerId)}
                          </span>
                        ))
                      : <span className="sb-lineup-empty">not set</span>}
                    {scoreboardLineup.isEstimated && <span className="sb-estimated-tag">est.</span>}
                  </div>
                </div>

                {/* Leaders */}
                <div className="sb-leaders-row">
                  {leadersByTeam[teamId]?.scoringLeader ? (
                    <div className="sb-leader-item sb-leader-scorer">
                      <span className="sb-leader-icon">*</span>
                      <span>
                        {displayPlayerName(teamId, leadersByTeam[teamId].scoringLeader!.playerId)}
                        <strong> {leadersByTeam[teamId].scoringLeader?.points} pts</strong>
                      </span>
                    </div>
                  ) : null}
                  {leadersByTeam[teamId]?.foulLeader ? (
                    <div className={`sb-leader-item sb-leader-fouls ${leadersByTeam[teamId].foulLeader!.fouls >= 4 ? "sb-leader-fouls-danger" : ""}`}>
                      <span className="sb-leader-icon">!</span>
                      <span>
                        {formatFoulTroubleLabel(
                          displayPlayerName(teamId, leadersByTeam[teamId].foulLeader!.playerId),
                          leadersByTeam[teamId].foulLeader!.fouls
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {teams.length >= 2 ? (() => {
        const homeData = aggregatedTeams[canonicalSideIds.homeId];
        const awayData = aggregatedTeams[canonicalSideIds.awayId];
        if (!homeData || !awayData) return null;
        const homeAssists = Object.values(homeData.playerStats).reduce((s, p) => s + (p.assists ?? 0), 0);
        const awayAssists = Object.values(awayData.playerStats).reduce((s, p) => s + (p.assists ?? 0), 0);
        type CompRow = { label: string; home: number | string; away: number | string; higherBetter?: boolean; lowerBetter?: boolean };
        const rows: CompRow[] = [
          { label: "Score", home: homeData.score, away: awayData.score, higherBetter: true },
          {
            label: "FG",
            home: `${homeData.teamStats.shooting.fgMade}-${homeData.teamStats.shooting.fgAttempts}`,
            away: `${awayData.teamStats.shooting.fgMade}-${awayData.teamStats.shooting.fgAttempts}`,
            higherBetter: true,
          },
          {
            label: "FT",
            home: `${homeData.teamStats.shooting.ftMade}-${homeData.teamStats.shooting.ftAttempts}`,
            away: `${awayData.teamStats.shooting.ftMade}-${awayData.teamStats.shooting.ftAttempts}`,
            higherBetter: true,
          },
          { label: "REB", home: homeData.teamStats.reboundsOff + homeData.teamStats.reboundsDef, away: awayData.teamStats.reboundsOff + awayData.teamStats.reboundsDef, higherBetter: true },
          { label: "AST", home: homeAssists, away: awayAssists, higherBetter: true },
          { label: "TO",  home: homeData.teamStats.turnovers, away: awayData.teamStats.turnovers, lowerBetter: true },
          { label: "PF",  home: homeData.teamStats.fouls,     away: awayData.teamStats.fouls,     lowerBetter: true },
        ];
        return (
          <section key="team-comparison" className="card team-comparison-card">
            <h2>Team Comparison</h2>
            <table className="team-comparison-table">
              <thead>
                <tr>
                  <th className="tc-stat-col">Stat</th>
                  <th>{displayTeamName(canonicalSideIds.homeId)}</th>
                  <th>{displayTeamName(canonicalSideIds.awayId)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hNum = typeof row.home === "number" ? row.home : null;
                  const aNum = typeof row.away === "number" ? row.away : null;
                  let hClass = "";
                  let aClass = "";
                  if (hNum !== null && aNum !== null) {
                    if (row.higherBetter) {
                      if (hNum > aNum) hClass = "tc-lead";
                      else if (aNum > hNum) aClass = "tc-lead";
                    } else if (row.lowerBetter && hNum !== aNum) {
                      if (hNum < aNum) hClass = "tc-lead";
                      else aClass = "tc-lead";
                    }
                  }
                  return (
                    <tr key={row.label}>
                      <td className="tc-stat-col">{row.label}</td>
                      <td className={hClass}>{row.home}</td>
                      <td className={aClass}>{row.away}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })() : null}
    </>
  );
}
