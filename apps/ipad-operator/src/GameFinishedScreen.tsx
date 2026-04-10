import type { ReactNode } from "react";

interface GameFinishedScreenProps {
  gameId: string;
  gameDate: string;
  opponentName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  submitMessage: string;
  onStartNewGame: () => void;
  inlineNoticeNode: ReactNode;
  confirmDialogNode: ReactNode;
}

export function GameFinishedScreen({
  gameId,
  gameDate,
  opponentName,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  submitMessage,
  onStartNewGame,
  inlineNoticeNode,
  confirmDialogNode,
}: GameFinishedScreenProps) {
  return (
    <div className="postgame-screen">
      {inlineNoticeNode}
      {confirmDialogNode}
      <div className="postgame-card">
        <div className="postgame-header">
          <span className="postgame-eyebrow">Game Finished</span>
          <h1 className="postgame-title">Final summary</h1>
        </div>

        <div className="postgame-edit-grid">
          <label className="postgame-field">
            <span className="postgame-field-label">Game Name</span>
            <input className="postgame-input" value={gameId} readOnly aria-readonly="true" />
          </label>
          <label className="postgame-field">
            <span className="postgame-field-label">Date</span>
            <input className="postgame-input" value={gameDate} readOnly aria-readonly="true" />
          </label>
          <label className="postgame-field postgame-field-wide">
            <span className="postgame-field-label">Opponent</span>
            <input className="postgame-input" value={opponentName || "Opponent"} readOnly aria-readonly="true" />
          </label>
        </div>

        <div className="postgame-score">
          <div className="postgame-score-team">
            <span className="postgame-score-name">{homeTeamName}</span>
            <input className="postgame-score-input" value={String(homeScore)} readOnly aria-readonly="true" />
          </div>
          <div className="postgame-score-sep">-</div>
          <div className="postgame-score-team">
            <span className="postgame-score-name">{awayTeamName}</span>
            <input className="postgame-score-input" value={String(awayScore)} readOnly aria-readonly="true" />
          </div>
        </div>

        <div className="submit-banner submit-banner-success" role="status">
          {submitMessage}
        </div>

        <button className="postgame-new-btn" onClick={onStartNewGame}>
          Start New Game
        </button>
      </div>
    </div>
  );
}
