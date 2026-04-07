import {
  type BoxScoreFilter,
  type BoxScoreTeamTotals,
  type BoxScorePlayerLine,
  type RosterTeam,
  emptyBoxScoreTotals,
} from "./helpers/index.js";

interface Props {
  teams: string[];
  boxScorePeriods: string[];
  boxScoreFilter: BoxScoreFilter;
  setBoxScoreFilter: React.Dispatch<React.SetStateAction<BoxScoreFilter>>;
  boxScoreByTeam: Record<string, { totals: BoxScoreTeamTotals; players: Record<string, BoxScorePlayerLine> }>;
  currentPeriod: string | undefined;
  displayTeamName: (teamId: string) => string;
  displayPlayerName: (teamId: string, playerId: string) => string;
  rosterTeams: RosterTeam[];
  canonicalTeamId: (id: string) => string;
  myTeamId: string;
  vcSide: string;
  stateHomeTeamId: string | undefined;
  stateAwayTeamId: string | undefined;
}

export function BoxScoreSection({
  teams,
  boxScorePeriods,
  boxScoreFilter,
  setBoxScoreFilter,
  boxScoreByTeam,
  currentPeriod,
  displayTeamName,
  displayPlayerName,
  rosterTeams,
  canonicalTeamId,
  myTeamId,
  vcSide,
  stateHomeTeamId,
  stateAwayTeamId,
}: Props) {
  return (
    <section className="card box-score-card">
      <div className="box-score-header">
        <h2>Box Score</h2>
          {boxScorePeriods.length > 1 ? (
            <div className="replay-scrubber" aria-label="Game timeline scrubber">
              {boxScorePeriods.map((period, idx) => {
                const isLivePeriod = period === currentPeriod;
                const activeUpToIdx = boxScoreFilter.length > 0
                  ? Math.max(...boxScoreFilter.map((f) => boxScorePeriods.indexOf(f)))
                  : boxScorePeriods.length - 1;
                const inRange = idx <= activeUpToIdx;
                const isSelected = boxScoreFilter.length > 0 && idx === activeUpToIdx;
                return (
                  <>
                    {idx > 0 && (
                      <div
                        key={`seg-${period}`}
                        className={`replay-scrubber-segment${inRange ? " scrubber-segment-active" : ""}`}
                      />
                    )}
                    <button
                      key={period}
                      type="button"
                      className={`replay-scrubber-stop${isLivePeriod ? " scrubber-stop-live" : ""}${isSelected ? " scrubber-stop-selected" : inRange ? " scrubber-stop-active" : ""}`}
                      title={`${boxScoreFilter.length > 0 && idx === activeUpToIdx ? "Showing up to " : "View up to "}${period}`}
                      onClick={() => {
                        const upTo = boxScorePeriods.slice(0, idx + 1);
                        setBoxScoreFilter(upTo.length === boxScorePeriods.length ? [] : upTo);
                      }}
                    >
                      <span className="scrubber-stop-dot" />
                      <span className="scrubber-stop-label">{period}</span>
                      {isLivePeriod && <span className="scrubber-live-pip" aria-label="Live" />}
                    </button>
                  </>
                );
              })}
            </div>
          ) : null}

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
          .sort((left, right) => right.points - left.points || left.name.localeCompare(right.name));

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
    </section>
  );
}
