import type { LineupUnitStats } from "@bta/game-state";

interface Props {
  lineupUnitStats: LineupUnitStats[] | null;
  coachedTeamId: string;
  displayPlayerName: (teamId: string, playerId: string) => string;
}

export function LineupUnitPanel({ lineupUnitStats, coachedTeamId, displayPlayerName }: Props) {
  if (!lineupUnitStats || lineupUnitStats.length === 0) return null;

  return (
    <section className="card">
      <h2>Lineup +/-</h2>
      <p className="insight-context-note lineup-context-gap">
        Points scored for / against while each 5-man unit was on the floor.
      </p>
      <div className="lineup-unit-list">
        {lineupUnitStats.map((unit) => {
          const pmClass =
            unit.plusMinus > 0
              ? "lineup-pm-pos"
              : unit.plusMinus < 0
              ? "lineup-pm-neg"
              : "lineup-pm-zero";
          return (
            <div key={unit.lineupKey} className="lineup-unit-row">
              <div className="lineup-unit-players">
                {unit.playerIds.map((pid) => (
                  <span key={pid} className="lineup-unit-chip">
                    {displayPlayerName(coachedTeamId, pid)}
                  </span>
                ))}
              </div>
              <div className="lineup-unit-scores">
                <span className="lineup-unit-score-for">{unit.pointsFor}</span>
                <span className="lineup-unit-score-sep">—</span>
                <span className="lineup-unit-score-against">{unit.pointsAgainst}</span>
                <span className={`lineup-unit-pm ${pmClass}`}>
                  {unit.plusMinus > 0 ? `+${unit.plusMinus}` : unit.plusMinus}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
