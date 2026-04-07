import type { RotationWatchNote } from "./helpers/index.js";

interface RotationContext {
  teamId: string;
  onCourt: string[];
  isEstimatedLineup: boolean;
  liveCount: number;
  watchNotes: RotationWatchNote[];
  bench: string[];
}

interface Props {
  rotationContext: RotationContext | null;
  displayTeamName: (teamId: string) => string;
  displayPlayerName: (teamId: string, playerId: string) => string;
}

export function RotationPanel({ rotationContext, displayTeamName, displayPlayerName }: Props) {
  return (
    <section className="card">
      <h2>On-Court Rotation</h2>
      {!rotationContext ? <p>No lineup data yet.</p> : null}
      <div className="rotation-grid">
        {rotationContext ? (
          <article key={rotationContext.teamId} className="rotation-card">
            <h3>{displayTeamName(rotationContext.teamId)}</h3>

            <p className="rotation-label">Currently in game</p>
            {rotationContext.onCourt.length === 0 ? (
              <p className="text-muted">No active lineup reported.</p>
            ) : (
              <>
                {rotationContext.isEstimatedLineup ? (
                  <p className="rotation-estimate-note">
                    Live lineup feed currently has {rotationContext.liveCount}. Filled remaining spots from activity/roster context.
                  </p>
                ) : null}
                <div className="rotation-chip-row">
                  {rotationContext.onCourt.map((playerId) => (
                    <span key={`${rotationContext.teamId}-on-${playerId}`} className="rotation-chip rotation-chip-on">
                      {displayPlayerName(rotationContext.teamId, playerId)}
                    </span>
                  ))}
                </div>
              </>
            )}

            <p className="rotation-label">Sub context</p>
            {rotationContext.watchNotes.length === 0 ? (
              <p className="text-muted">No urgent substitution pressure detected.</p>
            ) : (
              <div className="stack-list">
                {rotationContext.watchNotes.map((note) => (
                  <p key={`${rotationContext.teamId}-${note.playerId}-${note.reason}`} className={`rotation-note rotation-note-${note.level}`}>
                    <strong>{displayPlayerName(rotationContext.teamId, note.playerId)}:</strong> {note.reason}
                  </p>
                ))}
              </div>
            )}

            <p className="rotation-label">Available bench</p>
            {rotationContext.bench.length === 0 ? (
              <p className="text-muted">No bench list available from roster/state.</p>
            ) : (
              <div className="rotation-chip-row">
                {rotationContext.bench.map((playerId) => (
                  <span key={`${rotationContext.teamId}-bench-${playerId}`} className="rotation-chip">
                    {displayPlayerName(rotationContext.teamId, playerId)}
                  </span>
                ))}
              </div>
            )}
          </article>
        ) : null}
      </div>
    </section>
  );
}
