import { computeCurrentLineup } from "./helpers/events.js";
import { foulTypeLabel, turnoverTypeLabel, zoneLabel } from "./helpers/labels.js";
import type { ChainPrompt, EventEditContext, Modal, Player, RunningTotals } from "./types.js";
import type { OpponentTrackStat, TeamSide } from "./types.js";
import { TWO_POINT_ZONES, THREE_POINT_ZONES, FOUL_TYPE_OPTIONS, TURNOVER_TYPE_OPTIONS } from "./types.js";
import type { GameEvent } from "@bta/shared-schema";

// ── Shared sub-props ──

interface TeamContext {
  vcSideSetup: TeamSide;
  opponentSide: TeamSide;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
  homePlayers: Player[];
  awayPlayers: Player[];
}

interface GameContext {
  allEventObjs: GameEvent[];
  pTotals: Record<string, RunningTotals>;
  startingLineup: string[];
  overtimeCount: number;
  resolveTeamId: (side: TeamSide) => string;
  isOpponentStatEnabled: (stat: OpponentTrackStat) => boolean;
}

interface ModalCallbacks {
  setModal: (m: Modal | null) => void;
  confirmShot: (playerId: string) => void;
  confirmFreeThrow: (playerId: string) => void;
  confirmStat: (playerId: string) => void;
  confirmAssistScorer: (scorerId: string) => void;
  confirmAssistPoints: (points: 2 | 3) => Promise<void>;
  confirmSubOut: (playerId: string) => void;
  confirmSubIn: (playerId: string) => void;
  saveEditedEvent: (event: GameEvent, editContext: EventEditContext) => void;
  deleteEventRecord: (args: { event: GameEvent; pending: boolean }) => void;
  requestConfirm: (opts: { title: string; message: string; confirmLabel: string; tone?: "default" | "danger" }) => Promise<boolean>;
  postEvent: (event: GameEvent) => void;
  base: (seq: number) => Record<string, unknown>;
  sequence: number;
}

// ── ModalRouter ──

export interface ModalRouterProps {
  modal: Modal | null;
  team: TeamContext;
  game: GameContext;
  callbacks: ModalCallbacks;
}

function teamPlayers(side: TeamSide, team: TeamContext): Player[] {
  return side === "home" ? team.homePlayers : team.awayPlayers;
}

function tLabel(side: TeamSide, team: TeamContext): string {
  return side === "home" ? team.homeTeamName : team.awayTeamName;
}

function EditDeleteAction({ editContext, requestConfirm, deleteEventRecord }: {
  editContext: EventEditContext | null;
  requestConfirm: ModalCallbacks["requestConfirm"];
  deleteEventRecord: ModalCallbacks["deleteEventRecord"];
}) {
  if (!editContext) return null;
  return (
    <div className="modal-edit-actions">
      <button
        className="modal-delete-btn"
        onClick={async () => {
          const ok = await requestConfirm({
            title: "Delete event?",
            message: "This removes the selected event from the game log.",
            confirmLabel: "Delete Event",
            tone: "danger",
          });
          if (!ok) return;
          void deleteEventRecord({ event: editContext.originalEvent, pending: editContext.pending });
        }}
      >
        Delete Event
      </button>
    </div>
  );
}

export function ModalRouter({ modal, team, game, callbacks }: ModalRouterProps) {
  if (!modal) return null;

  const { setModal, confirmShot, confirmFreeThrow, confirmStat, confirmAssistScorer,
    confirmAssistPoints, confirmSubOut, confirmSubIn, saveEditedEvent, deleteEventRecord,
    requestConfirm, postEvent, base, sequence } = callbacks;

  const closeModal = () => setModal(null);

  const editDelete = (ctx: EventEditContext | null) => (
    <EditDeleteAction editContext={ctx} requestConfirm={requestConfirm} deleteEventRecord={deleteEventRecord} />
  );

  if (modal.kind === "shot" || modal.kind === "freeThrow") {
    const allTeamPlayers = teamPlayers(modal.teamId, team);
    const lineup = computeCurrentLineup(game.allEventObjs, game.resolveTeamId(modal.teamId), game.startingLineup, allTeamPlayers);
    const players = lineup.onCourt;
    const allowTeamOnlyForOpponent = modal.teamId === team.opponentSide && allTeamPlayers.length === 0;
    const selectedTeamColor = modal.teamId === "home" ? team.homeTeamColor : team.awayTeamColor;
    const modalTitle = modal.editContext
      ? `Edit ${modal.kind === "shot" ? `${modal.points}pt` : "FT"} - ${tLabel(modal.teamId, team)}`
      : `${modal.kind === "shot" ? `${modal.points}pt` : "FT"} - ${tLabel(modal.teamId, team)}`;
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">{modalTitle}</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext ?? null)}
          <div className="made-miss-row">
            <button className={`toggle-btn ${modal.made ? "t-teal" : ""}`} onClick={() => setModal({ ...modal, made: true })}>Made</button>
            <button className={`toggle-btn ${!modal.made ? "t-red" : ""}`} onClick={() => setModal({ ...modal, made: false })}>Miss</button>
          </div>
          {modal.kind === "shot" && (
            <div className="shot-zone-row">
              {(modal.points === 3 ? THREE_POINT_ZONES : TWO_POINT_ZONES).map((zone) => (
                <button
                  key={zone}
                  className={`zone-btn ${modal.zone === zone ? "active" : ""}`}
                  onClick={() => setModal({ ...modal, zone })}
                >
                  {zoneLabel(zone)}
                </button>
              ))}
            </div>
          )}
          <div className="player-list">
            {players.length === 0 && !allowTeamOnlyForOpponent && <p className="no-players">No players on court yet</p>}
            {players.map(p => (
              <button key={p.id} className="player-row" onClick={() => (modal.kind === "shot" ? confirmShot(p.id) : confirmFreeThrow(p.id))}>
                <span className="pnum">#{p.number}</span>
                <span className="pname">{p.name}</span>
                {p.position && <span className="ppos">{p.position}</span>}
                {game.pTotals[p.id]?.fouls ? (
                  <span className={`pfoul${game.pTotals[p.id].fouls >= 5 ? " pfoul-out" : game.pTotals[p.id].fouls >= 4 ? " pfoul-warn" : ""}`}>
                    {game.pTotals[p.id].fouls}f{game.pTotals[p.id].fouls >= 5 ? " OUT" : ""}
                  </span>
                ) : null}
                {game.pTotals[p.id] ? <span className="ppts">{game.pTotals[p.id].points} pts</span> : null}
              </button>
            ))}
            {allowTeamOnlyForOpponent && (
              <button
                className="player-row team-row opponent-team-only-row"
                style={{ borderColor: `${selectedTeamColor}bf`, background: `${selectedTeamColor}2b`, color: selectedTeamColor, boxShadow: `0 0 0 1px ${selectedTeamColor}59` }}
                onClick={() => (modal.kind === "shot" ? confirmShot(game.resolveTeamId(modal.teamId)) : confirmFreeThrow(game.resolveTeamId(modal.teamId)))}
              >
                {tLabel(modal.teamId, team)}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "stat") {
    const statLabels: Record<string, string> = {
      def_reb: "Def Rebound", off_reb: "Off Rebound", turnover: "Turnover",
      steal: "Steal", assist: "Assist - pick passer", block: "Block", foul: "Foul",
    };
    const trackedSide = team.vcSideSetup;
    const allowOpponentForStat = game.isOpponentStatEnabled(modal.stat as OpponentTrackStat);
    const trackedAllPlayers = teamPlayers(trackedSide, team);
    const trackedLineup = computeCurrentLineup(game.allEventObjs, game.resolveTeamId(trackedSide), game.startingLineup, trackedAllPlayers);
    const trackedPlayers = trackedLineup.onCourt;
    const isTrackedSelection = modal.teamId === trackedSide;
    const trackedTeamColor = trackedSide === "home" ? team.homeTeamColor : team.awayTeamColor;
    const opponentTeamColor = team.opponentSide === "home" ? team.homeTeamColor : team.awayTeamColor;
    const selectedTeamColor = modal.teamId === "home" ? team.homeTeamColor : team.awayTeamColor;
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <span className="modal-title">{modal.editContext ? `Edit ${statLabels[modal.stat]}` : statLabels[modal.stat]}</span>
              <div className="modal-team-toggle">
                <button
                  className={isTrackedSelection ? "team-color-active" : ""}
                  style={isTrackedSelection ? { background: `${trackedTeamColor}26`, borderColor: trackedTeamColor, color: trackedTeamColor } : undefined}
                  onClick={() => setModal({ ...modal, teamId: trackedSide })}
                >{team.vcSideSetup === "home" ? team.homeTeamName : team.awayTeamName}</button>
                <button
                  className={!isTrackedSelection ? "team-color-active" : ""}
                  style={!isTrackedSelection ? { background: `${opponentTeamColor}26`, borderColor: opponentTeamColor, color: opponentTeamColor } : undefined}
                  onClick={() => {
                    if (allowOpponentForStat) setModal({ ...modal, teamId: team.opponentSide });
                  }}
                  disabled={!allowOpponentForStat}
                  title={allowOpponentForStat ? undefined : "Opponent tracking for this stat is disabled in Settings"}
                >{team.vcSideSetup === "home" ? team.awayTeamName : team.homeTeamName}</button>
              </div>
            </div>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext ?? null)}
          {modal.stat === "foul" && (
            <div className="modal-subtype-row">
              {FOUL_TYPE_OPTIONS.map((foulType) => (
                <button
                  key={foulType}
                  className={`modal-subtype-btn ${(modal.foulType ?? "personal") === foulType ? "active" : ""}`}
                  onClick={() => setModal({ ...modal, foulType })}
                >
                  {foulTypeLabel(foulType)}
                </button>
              ))}
            </div>
          )}
          {modal.stat === "turnover" && (
            <div className="modal-subtype-row">
              {TURNOVER_TYPE_OPTIONS.map((turnoverType) => (
                <button
                  key={turnoverType}
                  className={`modal-subtype-btn ${(modal.turnoverType ?? "bad_pass") === turnoverType ? "active" : ""}`}
                  onClick={() => setModal({ ...modal, turnoverType })}
                >
                  {turnoverTypeLabel(turnoverType)}
                </button>
              ))}
            </div>
          )}
          <div className="player-list">
            {isTrackedSelection ? (
              <>
                {trackedPlayers.length === 0 && <p className="no-players">No players on court yet</p>}
                {trackedPlayers.map(p => (
                  <button key={p.id} className="player-row" onClick={() => confirmStat(p.id)}>
                    <span className="pnum">#{p.number}</span>
                    <span className="pname">{p.name}</span>
                    {p.position && <span className="ppos">{p.position}</span>}
                    {game.pTotals[p.id]?.fouls ? (
                      <span className={`pfoul${game.pTotals[p.id].fouls >= 5 ? " pfoul-out" : game.pTotals[p.id].fouls >= 4 ? " pfoul-warn" : ""}`}>
                        {game.pTotals[p.id].fouls}f{game.pTotals[p.id].fouls >= 5 ? " OUT" : ""}
                      </span>
                    ) : null}
                    {game.pTotals[p.id]?.points ? <span className="ppts">{game.pTotals[p.id].points} pts</span> : null}
                  </button>
                ))}
              </>
            ) : (
              <p className="no-players">Opponent tracked as team only.</p>
            )}
            {!isTrackedSelection && (
              <button
                className="player-row team-row opponent-team-only-row"
                style={{ borderColor: `${selectedTeamColor}bf`, background: `${selectedTeamColor}2b`, color: selectedTeamColor, boxShadow: `0 0 0 1px ${selectedTeamColor}59` }}
                onClick={() => confirmStat(`${modal.teamId}-team`)}
              >
                {tLabel(modal.teamId, team)}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "assistEdit") {
    const allTeamPlayers = teamPlayers(modal.teamId, team);
    const lineup = computeCurrentLineup(game.allEventObjs, game.resolveTeamId(modal.teamId), game.startingLineup, allTeamPlayers);
    const players = lineup.onCourt;
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Edit Assist - {tLabel(modal.teamId, team)}</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext)}
          <div className="modal-subtitle">Select the passer, then the scorer.</div>
          <div className="player-list">
            {players.length === 0 && <p className="no-players">No players on court yet</p>}
            {players.map((player) => (
              <button
                key={`assist-passer-${player.id}`}
                className={`player-row${modal.assistPlayerId === player.id ? " player-row-selected" : ""}`}
                onClick={() => setModal({ ...modal, assistPlayerId: player.id })}
              >
                <span className="pnum">#{player.number}</span>
                <span className="pname">Passer: {player.name}</span>
              </button>
            ))}
          </div>
          <div className="player-list">
            {players.map((player) => (
              <button
                key={`assist-scorer-${player.id}`}
                className={`player-row${modal.scorerPlayerId === player.id ? " player-row-selected" : ""}`}
                onClick={() => setModal({ ...modal, scorerPlayerId: player.id })}
              >
                <span className="pnum">#{player.number}</span>
                <span className="pname">Scorer: {player.name}</span>
              </button>
            ))}
          </div>
          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
            <button
              className="confirm-btn confirm-btn-primary"
              onClick={() => {
                void saveEditedEvent({
                  ...modal.editContext.originalEvent,
                  teamId: game.resolveTeamId(modal.teamId),
                  type: "assist",
                  playerId: modal.assistPlayerId,
                  scorerPlayerId: modal.scorerPlayerId,
                } as GameEvent, modal.editContext);
              }}
            >
              Save Assist
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "assist2") {
    const allTeamPlayers = teamPlayers(modal.teamId, team);
    const lineup = computeCurrentLineup(game.allEventObjs, game.resolveTeamId(modal.teamId), game.startingLineup, allTeamPlayers);
    const players = lineup.onCourt.filter(p => p.id !== modal.assistPlayerId);
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Assist - pick scorer</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          <div className="player-list">
            {players.length === 0 && <p className="no-players">No players on court yet</p>}
            {players.map(p => (
              <button key={p.id} className="player-row" onClick={() => confirmAssistScorer(p.id)}>
                <span className="pnum">#{p.number}</span>
                <span className="pname">{p.name}</span>
                {game.pTotals[p.id] ? <span className="ppts">{game.pTotals[p.id].points} pts</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "assist3") {
    const players = teamPlayers(modal.teamId, team);
    const scorer = players.find((p) => p.id === modal.scorerPlayerId);
    const passer = players.find((p) => p.id === modal.assistPlayerId);
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Assist - pick points</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          <div className="modal-subtitle">
            {passer ? `Passer: #${passer.number} ${passer.name}` : "Passer selected"}
          </div>
          <div className="modal-subtitle">
            {scorer ? `Scorer: #${scorer.number} ${scorer.name}` : "Scorer selected"}
          </div>
          <div className="event-pills" style={{ marginTop: 12, display: "flex", gap: "1.5rem", justifyContent: "center" }}>
            <button className="circle teal" style={{ width: 120, height: 120, fontSize: "1.6rem" }} onClick={() => { void confirmAssistPoints(2); }}>2pt</button>
            <button className="circle teal" style={{ width: 120, height: 120, fontSize: "1.6rem" }} onClick={() => { void confirmAssistPoints(3); }}>3pt</button>
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "chain-assist") {
    const allTeamPlayers = teamPlayers(modal.teamId, team);
    const lineup = computeCurrentLineup(game.allEventObjs, game.resolveTeamId(modal.teamId), game.startingLineup, allTeamPlayers);
    const passers = lineup.onCourt.filter(p => p.id !== modal.scorerPlayerId);
    const scorer = allTeamPlayers.find(p => p.id === modal.scorerPlayerId);
    const teamColor = modal.teamId === "home" ? team.homeTeamColor : team.awayTeamColor;
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Assist – who passed to {scorer ? `#${scorer.number} ${scorer.name}` : "scorer"}?</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          <div className="player-list">
            {passers.length === 0 && <p className="no-players">No other players on court</p>}
            {passers.map(p => (
              <button key={p.id} className="player-row" onClick={() => {
                void postEvent({
                  ...base(sequence),
                  teamId: game.resolveTeamId(modal.teamId),
                  type: "assist",
                  playerId: p.id,
                  scorerPlayerId: modal.scorerPlayerId,
                } as GameEvent);
                closeModal();
              }}>
                <span className="pnum">#{p.number}</span>
                <span className="pname">{p.name}</span>
                {game.pTotals[p.id] ? <span className="ppts">{game.pTotals[p.id].ast > 0 ? `${game.pTotals[p.id].ast} ast` : ""}</span> : null}
              </button>
            ))}
          </div>
          <div style={{ padding: "0.5rem 1.2rem 1rem" }}>
            <button
              style={{ width: "100%", padding: "0.8rem", borderRadius: "0.5rem", background: "transparent", border: `1px solid ${teamColor}40`, color: "rgba(232,234,240,0.6)", cursor: "pointer", fontSize: "0.9rem" }}
              onClick={closeModal}
            >
              No assist – unassisted basket
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "sub1") {
    const players = teamPlayers(modal.teamId, team);
    const currentLineup = computeCurrentLineup(game.allEventObjs, game.resolveTeamId(modal.teamId), game.startingLineup, players);

    if (modal.playerOutId) {
      const subInPlayers = currentLineup.bench;
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal.editContext ? "Edit Sub In" : "Sub In"} for {players.find(p => p.id === modal.playerOutId)?.name} - {tLabel(modal.teamId, team)}</span>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>
            {editDelete(modal.editContext ?? null)}
            <div className="player-list">
              {subInPlayers.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmSubIn(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">{modal.editContext ? "Edit Sub Out" : "Sub Out"} - {tLabel(modal.teamId, team)}</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext ?? null)}
          <div className="player-list">
            {currentLineup.onCourt.length > 0 ? (
              currentLineup.onCourt.map(p => (
                <button key={p.id} className="player-row" onClick={() => confirmSubOut(p.id)}>
                  <span className="pnum">#{p.number}</span>
                  <span className="pname">{p.name}</span>
                  {game.pTotals[p.id] && <span className="ppts">{game.pTotals[p.id].points}pts</span>}
                </button>
              ))
            ) : (
              <p className="no-players">No players on court yet</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "sub2") {
    const allSub2Players = teamPlayers(modal.teamId, team);
    const sub2Lineup = computeCurrentLineup(game.allEventObjs, game.resolveTeamId(modal.teamId), game.startingLineup, allSub2Players);
    const players = sub2Lineup.bench;
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">{modal.editContext ? "Edit Sub In" : "Sub In"} - {tLabel(modal.teamId, team)}</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext ?? null)}
          <div className="player-list">
            {players.map(p => (
              <button key={p.id} className="player-row" onClick={() => confirmSubIn(p.id)}>
                <span className="pnum">#{p.number}</span>
                <span className="pname">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "timeoutEdit") {
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal modal-confirm" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Edit Timeout</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext)}
          <div className="confirm-message">Update the team and timeout length for this stoppage.</div>
          <div className="modal-team-toggle" style={{ padding: "0 1.2rem" }}>
            <button className={modal.teamId === "home" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "home" })}>{team.homeTeamName}</button>
            <button className={modal.teamId === "away" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "away" })}>{team.awayTeamName}</button>
          </div>
          <div className="made-miss-row" style={{ padding: "0.9rem 1.2rem 0" }}>
            <button className={`toggle-btn ${modal.timeoutType === "full" ? "t-teal" : ""}`} onClick={() => setModal({ ...modal, timeoutType: "full" })}>Full</button>
            <button className={`toggle-btn ${modal.timeoutType === "short" ? "t-red" : ""}`} onClick={() => setModal({ ...modal, timeoutType: "short" })}>Short</button>
          </div>
          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
            <button
              className="confirm-btn confirm-btn-primary"
              onClick={() => {
                void saveEditedEvent({
                  ...modal.editContext.originalEvent,
                  teamId: game.resolveTeamId(modal.teamId),
                  type: "timeout",
                  timeoutType: modal.timeoutType,
                } as GameEvent, modal.editContext);
              }}
            >
              Save Timeout
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "possessionEdit") {
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal modal-confirm" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Edit Possession</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext)}
          <div className="confirm-message">Choose which team should own this possession event.</div>
          <div className="modal-team-toggle" style={{ padding: "0 1.2rem" }}>
            <button className={modal.teamId === "home" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "home" })}>{team.homeTeamName}</button>
            <button className={modal.teamId === "away" ? "team-color-active" : ""} onClick={() => setModal({ ...modal, teamId: "away" })}>{team.awayTeamName}</button>
          </div>
          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
            <button
              className="confirm-btn confirm-btn-primary"
              onClick={() => {
                const teamId = game.resolveTeamId(modal.teamId);
                void saveEditedEvent({
                  ...modal.editContext.originalEvent,
                  teamId,
                  type: "possession_start",
                  possessedByTeamId: teamId,
                } as GameEvent, modal.editContext);
              }}
            >
              Save Possession
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "periodTransitionEdit") {
    const availablePeriods = [
      "Q1", "Q2", "Q3", "Q4",
      ...Array.from({ length: game.overtimeCount }, (_, index) => `OT${index + 1}`),
    ];
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal modal-confirm" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Edit Period Start</span>
            <button className="modal-close" onClick={closeModal}>X</button>
          </div>
          {editDelete(modal.editContext)}
          <div className="confirm-message">Pick the period that should start at this point in the feed.</div>
          <div className="period-row" style={{ borderTop: "none", paddingTop: 0 }}>
            {availablePeriods.map((label) => (
              <button
                key={label}
                className={`period-btn${modal.newPeriod === label ? " period-on" : ""}`}
                onClick={() => setModal({ ...modal, newPeriod: label })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn-cancel" onClick={closeModal}>Cancel</button>
            <button
              className="confirm-btn confirm-btn-primary"
              onClick={() => {
                void saveEditedEvent({
                  ...modal.editContext.originalEvent,
                  type: "period_transition",
                  newPeriod: modal.newPeriod,
                  period: modal.newPeriod,
                } as GameEvent, modal.editContext);
              }}
            >
              Save Period
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ── ChainPromptBar ──

export interface ChainPromptBarProps {
  chainPrompt: ChainPrompt | null;
  vcSideSetup: TeamSide;
  opponentSide: TeamSide;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
  onDismiss: () => void;
  setModal: (m: Modal | null) => void;
}

export function ChainPromptBar({ chainPrompt, vcSideSetup, opponentSide, homeTeamName, awayTeamName, homeTeamColor, awayTeamColor, onDismiss, setModal }: ChainPromptBarProps) {
  if (!chainPrompt) return null;
  const myTeamName = vcSideSetup === "home" ? homeTeamName : awayTeamName;
  const oppTeamName = vcSideSetup === "home" ? awayTeamName : homeTeamName;
  const myTeamColor = vcSideSetup === "home" ? homeTeamColor : awayTeamColor;
  const oppTeamColor = vcSideSetup === "home" ? awayTeamColor : homeTeamColor;

  if (chainPrompt.kind === "after-made-shot") {
    const teamName = chainPrompt.forTeam === vcSideSetup ? myTeamName : oppTeamName;
    const teamColor = chainPrompt.forTeam === vcSideSetup ? myTeamColor : oppTeamColor;
    return (
      <div className="chain-prompt">
        <span className="chain-prompt-label">
          {teamName} <span className="chain-prompt-made">+{chainPrompt.points}</span> · Add assist?
        </span>
        <div className="chain-prompt-actions">
          <button
            className="chain-btn chain-btn-primary"
            style={{ borderColor: teamColor, color: teamColor }}
            onClick={() => {
              onDismiss();
              setModal({ kind: "chain-assist", teamId: chainPrompt.forTeam, scorerPlayerId: chainPrompt.scorerPlayerId });
            }}
          >
            Assist
          </button>
          <button className="chain-btn chain-btn-skip" onClick={onDismiss}>Skip</button>
        </div>
      </div>
    );
  }

  if (chainPrompt.kind === "after-missed-shot" || chainPrompt.kind === "after-ft-miss") {
    const isMy = chainPrompt.forTeam === vcSideSetup;
    const label = chainPrompt.kind === "after-ft-miss" ? "FT miss · Rebound?" : "Miss · Rebound?";
    return (
      <div className="chain-prompt">
        <span className="chain-prompt-label">{label}</span>
        <div className="chain-prompt-actions">
          <button
            className="chain-btn chain-btn-primary"
            style={{ borderColor: myTeamColor, color: myTeamColor }}
            onClick={() => {
              onDismiss();
              const rebStat = isMy ? "off_reb" : "def_reb";
              setModal({ kind: "stat", stat: rebStat, teamId: vcSideSetup });
            }}
          >
            {myTeamName} Reb
          </button>
          <button
            className="chain-btn chain-btn-secondary"
            style={{ borderColor: oppTeamColor, color: oppTeamColor }}
            onClick={() => {
              onDismiss();
              const rebStat = isMy ? "def_reb" : "off_reb";
              setModal({ kind: "stat", stat: rebStat, teamId: opponentSide });
            }}
          >
            {oppTeamName} Reb
          </button>
          <button className="chain-btn chain-btn-skip" onClick={onDismiss}>Skip</button>
        </div>
      </div>
    );
  }

  if (chainPrompt.kind === "after-turnover") {
    const stealTeamSide: TeamSide = chainPrompt.fromTeam === "home" ? "away" : "home";
    const stealTeamName = stealTeamSide === vcSideSetup ? myTeamName : oppTeamName;
    const stealTeamColor = stealTeamSide === vcSideSetup ? myTeamColor : oppTeamColor;
    return (
      <div className="chain-prompt">
        <span className="chain-prompt-label">Turnover · Was it a steal?</span>
        <div className="chain-prompt-actions">
          <button
            className="chain-btn chain-btn-primary"
            style={{ borderColor: stealTeamColor, color: stealTeamColor }}
            onClick={() => {
              onDismiss();
              setModal({ kind: "stat", stat: "steal", teamId: stealTeamSide });
            }}
          >
            Steal – {stealTeamName}
          </button>
          <button className="chain-btn chain-btn-skip" onClick={onDismiss}>Skip</button>
        </div>
      </div>
    );
  }

  return null;
}
