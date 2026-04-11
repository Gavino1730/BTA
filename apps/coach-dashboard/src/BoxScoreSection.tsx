import {
  type BoxScoreFilter,
  type BoxScoreTeamTotals,
  type BoxScorePlayerLine,
  type RosterTeam,
  emptyBoxScoreTotals,
} from "./helpers/index.js";
import type { GameEvent } from "@bta/shared-schema";

interface Props {
  teams: string[];
  boxScorePeriods: string[];
  boxScoreFilter: BoxScoreFilter;
  setBoxScoreFilter: React.Dispatch<React.SetStateAction<BoxScoreFilter>>;
  filteredBoxScoreEvents: GameEvent[];
  boxScoreByTeam: Record<string, { totals: BoxScoreTeamTotals; players: Record<string, BoxScorePlayerLine> }>;
  displayTeamName: (teamId: string) => string;
  displayPlayerName: (teamId: string, playerId: string) => string;
  rosterTeams: RosterTeam[];
  canonicalTeamId: (id: string) => string;
  myTeamId: string;
  vcSide: string;
  stateHomeTeamId: string | undefined;
  stateAwayTeamId: string | undefined;
  deletingGameEventId: string | null;
  deleteGameEvent: (eventId: string, expectedSequence: number) => Promise<void>;
}

export function BoxScoreSection({
  teams,
  boxScorePeriods,
  boxScoreFilter,
  setBoxScoreFilter,
  filteredBoxScoreEvents,
  boxScoreByTeam,
  displayTeamName,
  displayPlayerName,
  rosterTeams,
  canonicalTeamId,
  myTeamId,
  vcSide,
  stateHomeTeamId,
  stateAwayTeamId,
  deletingGameEventId,
  deleteGameEvent,
}: Props) {
  function contributionScore(line: BoxScorePlayerLine): number {
    const rebounds = line.reboundsDef + line.reboundsOff;
    const missedFg = Math.max(0, line.fgAttempts - line.fgMade);
    const missedFt = Math.max(0, line.ftAttempts - line.ftMade);

    return (
      line.points
      + (rebounds * 1.2)
      + (line.assists * 1.2)
      + (line.steals * 2)
      + (line.blocks * 2)
      - (line.turnovers * 1.5)
      - (line.fouls * 0.7)
      - (missedFg * 0.5)
      - (missedFt * 0.35)
    );
  }

  const correctionEvents = filteredBoxScoreEvents
    .filter((event) => {
      return event.type !== "period_transition" && event.type !== "possession_start" && event.type !== "possession_end";
    })
    .slice()
    .sort((left, right) => right.sequence - left.sequence)
    .slice(0, 12);

  function eventActorLabel(event: GameEvent): string {
    switch (event.type) {
      case "substitution":
        return `${displayPlayerName(event.teamId, event.playerOutId)} -> ${displayPlayerName(event.teamId, event.playerInId)}`;
      case "timeout":
        return displayTeamName(event.teamId);
      case "turnover":
        return event.playerId
          ? displayPlayerName(event.teamId, event.playerId)
          : displayTeamName(event.teamId);
      case "shot_attempt":
      case "free_throw_attempt":
      case "rebound":
      case "foul":
      case "assist":
      case "steal":
      case "block":
        return displayPlayerName(event.teamId, event.playerId);
      default:
        return displayTeamName(event.teamId);
    }
  }

  function eventSummary(event: GameEvent): string {
    switch (event.type) {
      case "shot_attempt":
        return `${event.made ? "Made" : "Missed"} ${event.points}PT FG`;
      case "free_throw_attempt":
        return `${event.made ? "Made" : "Missed"} FT (${event.attemptNumber}/${event.totalAttempts})`;
      case "rebound":
        return event.offensive ? "Offensive rebound" : "Defensive rebound";
      case "turnover":
        return `Turnover (${event.turnoverType.replace("_", " ")})`;
      case "foul":
        return `${event.foulType} foul`;
      case "assist":
        return `Assist -> ${displayPlayerName(event.teamId, event.scorerPlayerId)}`;
      case "steal":
        return "Steal";
      case "block":
        return "Block";
      case "substitution":
        return "Substitution";
      case "timeout":
        return `${event.timeoutType} timeout`;
      default:
        return event.type;
    }
  }

  return (
    <section className="card box-score-card">
      <div className="box-score-header">
        <h2>Box Score</h2>
        <div className="box-score-filter-group" aria-label="Box score filter">
          <button
            type="button"
            className={`box-score-filter-chip${boxScoreFilter.length === 0 ? " box-score-filter-chip-active" : ""}`}
            onClick={() => setBoxScoreFilter([])}
          >Full Game</button>
          {boxScorePeriods.map((period) => (
            <button
              key={period}
              type="button"
              className={`box-score-filter-chip${boxScoreFilter.includes(period) ? " box-score-filter-chip-active" : ""}`}
              onClick={() => setBoxScoreFilter(prev =>
                prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]
              )}
            >{period}</button>
          ))}
        </div>
      </div>

      {teams.map((teamId) => {
        const teamTotals = boxScoreByTeam[teamId]?.totals ?? emptyBoxScoreTotals();
        const teamIdLower = teamId.toLowerCase();
        const playerLines = Object.values(boxScoreByTeam[teamId]?.players ?? {})
          .filter((line) => {
            const nId = line.playerId.toLowerCase();
            return nId !== "home" && nId !== "away"
              && nId !== "home-team" && nId !== "away-team"
              && nId !== "team-home" && nId !== "team-away"
              && nId !== teamIdLower;
          })
          .map((line) => {
            const rosterPlayer = rosterTeams.flatMap((t) => t.players).find((p) => p.id === line.playerId);
            return {
              ...line,
              name: rosterPlayer?.name ?? displayPlayerName(teamId, line.playerId),
              number: rosterPlayer?.number ?? "",
            };
          })
          .sort((left, right) => {
            const contributionDiff = contributionScore(right) - contributionScore(left);
            if (contributionDiff !== 0) return contributionDiff;
            const pointsDiff = right.points - left.points;
            if (pointsDiff !== 0) return pointsDiff;
            return left.name.localeCompare(right.name);
          });

        const canonicalId = canonicalTeamId(teamId);
        const ourRawSideId = vcSide === "away" ? stateAwayTeamId : stateHomeTeamId;
        const isOurTeam = myTeamId !== ""
          ? (teamId === myTeamId ||
             canonicalId === myTeamId ||
             canonicalTeamId(myTeamId) === canonicalId)
          : ((teams.length > 0 && teamId === teams[0]) ||
             (Boolean(ourRawSideId) && teamId === ourRawSideId));
        const isOpponent = !isOurTeam;
        const showTeamTotals = !isOpponent || (isOpponent && playerLines.length === 0);

        return (
          <section key={`box-${teamId}`} className="box-score-team-section">
            <h3>{displayTeamName(teamId)}</h3>
            <div className="box-score-table-wrap">
              <table className="box-score-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>PTS</th>
                    <th>FG</th>
                    <th>FT</th>
                    <th>REB</th>
                    <th>AST</th>
                    <th>STL</th>
                    <th>BLK</th>
                    <th>TO</th>
                    <th>PF</th>
                  </tr>
                </thead>
                <tbody>
                  {playerLines.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="box-score-empty">
                        No players added.
                      </td>
                    </tr>
                  ) : (
                    playerLines.map((line) => {
                      const rebounds = line.reboundsDef + line.reboundsOff;
                      const playerLabel = line.number ? `${line.number} ${line.name}` : line.name;
                      return (
                        <tr
                          key={`${teamId}-${line.playerId}`}
                          className={line.fouls >= 4 ? "foul-row-danger" : line.fouls >= 3 ? "foul-row-warning" : undefined}
                        >
                          <td>{playerLabel}</td>
                          <td>{line.points}</td>
                          <td>{line.fgMade}-{line.fgAttempts}</td>
                          <td>{line.ftMade}-{line.ftAttempts}</td>
                          <td>{rebounds}</td>
                          <td>{line.assists}</td>
                          <td>{line.steals}</td>
                          <td>{line.blocks}</td>
                          <td>{line.turnovers}</td>
                          <td>
                            <span className={`foul-badge${line.fouls >= 5 ? " foul-badge-out" : line.fouls >= 4 ? " foul-badge-danger" : line.fouls >= 3 ? " foul-badge-warn" : " foul-badge-safe"}`}>
                              {line.fouls}{line.fouls >= 5 ? " OUT" : line.fouls >= 4 ? " !" : ""}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {showTeamTotals ? (
                  <tfoot>
                    <tr>
                      <td>Team Totals</td>
                      <td>{teamTotals.points}</td>
                      <td>{teamTotals.fgMade}-{teamTotals.fgAttempts}</td>
                      <td>{teamTotals.ftMade}-{teamTotals.ftAttempts}</td>
                      <td>{teamTotals.reboundsDef + teamTotals.reboundsOff}</td>
                      <td>{teamTotals.assists}</td>
                      <td>{teamTotals.steals}</td>
                      <td>{teamTotals.blocks}</td>
                      <td>{teamTotals.turnovers}</td>
                      <td>{teamTotals.fouls}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </section>
        );
      })}

      <section className="box-score-team-section">
        <h3>Recent Stat Events</h3>
        <div className="box-score-corrections">
          {correctionEvents.length === 0 ? (
            <p className="settings-section-desc">No recent events available for correction.</p>
          ) : (
            correctionEvents.map((event) => {
              const isDeleting = deletingGameEventId === event.id;
              return (
                <div key={event.id} className="box-score-correction-row">
                  <div>
                    <p className="box-score-correction-title">{eventSummary(event)}</p>
                    <p className="box-score-correction-meta">
                      {displayTeamName(event.teamId)} | {eventActorLabel(event)} | {event.period} | Seq {event.sequence}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shell-nav-link"
                    disabled={Boolean(deletingGameEventId)}
                    onClick={() => {
                      const ok = window.confirm("Undo this event? This will recalculate game stats.");
                      if (!ok) return;
                      void deleteGameEvent(event.id, event.sequence);
                    }}
                  >
                    {isDeleting ? "Undoing..." : "Undo"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}
