import type { ReactNode } from "react";

export interface PostGameScreenProps {
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  scores: { home: number; away: number };
  postGameNameInput: string;
  postGameDateInput: string;
  postGameOpponentInput: string;
  postGameHomeScoreInput: string;
  postGameAwayScoreInput: string;
  submitStatus: "idle" | "pending" | "success" | "error";
  submitMessage: string;
  onSetPostGameNameInput: (v: string) => void;
  onSetPostGameDateInput: (v: string) => void;
  onSetPostGameOpponentInput: (v: string) => void;
  onSetPostGameHomeScoreInput: (v: string) => void;
  onSetPostGameAwayScoreInput: (v: string) => void;
  onSetSubmitStatus: (v: "idle" | "pending" | "success" | "error") => void;
  onSetSubmitMessage: (v: string) => void;
  onApplyPostGameEdits: () => { gameId: string; opponent: string; date: string; homeScore: number; awayScore: number };
  onSubmitGameToRealtimeApi: () => Promise<boolean>;
  onSubmitToDashboard: (overrides: { opponent: string; date: string; homeScore: number; awayScore: number }) => Promise<boolean>;
  onRequestConfirm: (opts: { title: string; message: string; confirmLabel: string; tone?: "danger" }) => Promise<boolean>;
  onResetFromPostGame: () => void;
  onDiscardFromPostGame: () => void;
  onHandleNewGame: () => void;
  onMarkGameFinished: () => void;
  inlineNoticeNode: ReactNode;
  confirmDialogNode: ReactNode;
}

function parseScoreInput(value: string, fallback: number) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function PostGameScreen({
  gameId,
  homeTeamName,
  awayTeamName,
  scores,
  postGameNameInput,
  postGameDateInput,
  postGameOpponentInput,
  postGameHomeScoreInput,
  postGameAwayScoreInput,
  submitStatus,
  submitMessage,
  onSetPostGameNameInput,
  onSetPostGameDateInput,
  onSetPostGameOpponentInput,
  onSetPostGameHomeScoreInput,
  onSetPostGameAwayScoreInput,
  onSetSubmitStatus,
  onSetSubmitMessage,
  onApplyPostGameEdits,
  onSubmitGameToRealtimeApi,
  onSubmitToDashboard,
  onRequestConfirm,
  onResetFromPostGame,
  onDiscardFromPostGame,
  onHandleNewGame,
  onMarkGameFinished,
  inlineNoticeNode,
  confirmDialogNode,
}: PostGameScreenProps) {
  const editedHomeScore = parseScoreInput(postGameHomeScoreInput, scores.home);
  const editedAwayScore = parseScoreInput(postGameAwayScoreInput, scores.away);

  return (
    <div className="postgame-screen">
      {inlineNoticeNode}
      {confirmDialogNode}
      <div className="postgame-card">
        <div className="postgame-header">
          <span className="postgame-eyebrow">Game Over</span>
          <h1 className="postgame-title">Finalize game details</h1>
        </div>

        <div className="postgame-edit-grid">
          <label className="postgame-field">
            <span className="postgame-field-label">Game Name</span>
            <input
              className="postgame-input"
              value={postGameNameInput}
              onChange={e => onSetPostGameNameInput(e.target.value)}
              placeholder="Game name"
            />
          </label>
          <label className="postgame-field">
            <span className="postgame-field-label">Date</span>
            <input
              type="date"
              className="postgame-input"
              value={postGameDateInput}
              onChange={e => onSetPostGameDateInput(e.target.value)}
            />
          </label>
          <label className="postgame-field postgame-field-wide">
            <span className="postgame-field-label">Opponent</span>
            <input
              className="postgame-input"
              value={postGameOpponentInput}
              onChange={e => onSetPostGameOpponentInput(e.target.value)}
              placeholder="Opponent name"
            />
          </label>
        </div>

        <div className="postgame-score">
          <div className="postgame-score-team">
            <span className="postgame-score-name">{homeTeamName}</span>
            <input
              className="postgame-score-input"
              inputMode="numeric"
              value={postGameHomeScoreInput}
              onChange={e => onSetPostGameHomeScoreInput(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="postgame-score-sep">-</div>
          <div className="postgame-score-team">
            <span className="postgame-score-name">{awayTeamName}</span>
            <input
              className="postgame-score-input"
              inputMode="numeric"
              value={postGameAwayScoreInput}
              onChange={e => onSetPostGameAwayScoreInput(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
        </div>

        <button
          className="postgame-apply-btn"
          onClick={() => {
            onApplyPostGameEdits();
            onSetSubmitMessage("Updated game details.");
          }}>
          Save Name/Date/Score Changes
        </button>

        <div className={`submit-banner submit-banner-${submitStatus}`} role="status">
          {submitMessage}
        </div>

        <button
          className="postgame-retry-btn"
          onClick={async () => {
            const edits = onApplyPostGameEdits();
            onSetSubmitStatus("pending");
            onSetSubmitMessage("Submitting game...");
            const apiOk = await onSubmitGameToRealtimeApi();
            const legacyOk = await onSubmitToDashboard({
              opponent: edits.opponent,
              date: edits.date,
              homeScore: editedHomeScore,
              awayScore: editedAwayScore,
            });
            if (apiOk && legacyOk) {
              onSetSubmitStatus("success");
              onSetSubmitMessage("Game submitted! Stats are now visible in the dashboard.");
              onMarkGameFinished();
            } else if (apiOk && !legacyOk) {
              onSetSubmitStatus("success");
              onSetSubmitMessage("Game submitted to realtime API. Legacy stats export is currently unavailable.");
              onMarkGameFinished();
            } else {
              onSetSubmitStatus("error");
              onSetSubmitMessage("Submit failed. Check your connection and try again.");
            }
          }}
          disabled={submitStatus === "pending"}>
          {submitStatus === "pending" ? "Submitting..." : "Submit Game"}
        </button>

        <button
          className="postgame-reset-btn"
          onClick={async () => {
            const ok = await onRequestConfirm({
              title: "Reset this game and start over?",
              message: "This keeps your settings but clears all tracked events and creates a fresh game id.",
              confirmLabel: "Reset Game",
              tone: "danger",
            });
            if (!ok) return;
            onResetFromPostGame();
          }}>
          Reset This Game
        </button>

        <button className="postgame-discard-btn" onClick={onDiscardFromPostGame}>
          Discard This Game
        </button>

        <button className="postgame-new-btn" onClick={onHandleNewGame}>
          Start New Game
        </button>
      </div>
    </div>
  );
}
