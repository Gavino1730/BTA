import { defaultZoneForPoints } from "./helpers/labels.js";
import type { Modal, OpponentTrackStat, TeamSide } from "./types.js";

interface TimeoutBucket {
  full: number;
  short: number;
}

export interface ScoringPanelProps {
  vcSideSetup: TeamSide;
  opponentSide: TeamSide;
  homeTeamName: string;
  awayTeamName: string;
  timeoutRemaining: { home: TimeoutBucket; away: TimeoutBucket };
  inOvertimeNow: boolean;
  trackTimeouts: boolean;
  isOpponentStatEnabled: (stat: OpponentTrackStat) => boolean;
  setModal: (m: Modal) => void;
  takeTimeout: (side: TeamSide, type: "full" | "short") => void;
}

export function ScoringPanel({
  vcSideSetup, opponentSide, homeTeamName, awayTeamName,
  timeoutRemaining, inOvertimeNow, trackTimeouts,
  isOpponentStatEnabled, setModal, takeTimeout,
}: ScoringPanelProps) {
  const myName    = vcSideSetup === "home" ? homeTeamName : awayTeamName;
  const oppName   = vcSideSetup === "home" ? awayTeamName : homeTeamName;
  const myTO      = timeoutRemaining[vcSideSetup];
  const oppTO     = timeoutRemaining[opponentSide];
  const myColorClass  = vcSideSetup === "home" ? "teal" : "red";
  const oppColorClass = opponentSide === "home" ? "teal" : "red";
  const canTrackOppPoints = isOpponentStatEnabled("points");
  const canTrackOppFt     = isOpponentStatEnabled("free_throws");

  return (
    <div className="panel left-panel">
      <div className="shot-grid">
        {trackTimeouts && (
          <>
            <div className="shot-timeout-title">Record Timeout</div>
            <div className={`shot-timeout-cell shot-timeout-cell-${vcSideSetup}`}>
              <div className="shot-timeout-counts">{myName}: {myTO.short} short · {myTO.full} full left</div>
              <div className="timeout-btn-row">
                <button className="timeout-btn timeout-btn-short" disabled={inOvertimeNow || myTO.short <= 0} onClick={() => takeTimeout(vcSideSetup, "short")}>Use 30s</button>
                <button className="timeout-btn timeout-btn-full"  disabled={myTO.full <= 0}                   onClick={() => takeTimeout(vcSideSetup, "full")}>Use 60s</button>
              </div>
            </div>
            <div className={`shot-timeout-cell shot-timeout-cell-${opponentSide}`}>
              <div className="shot-timeout-counts">{oppName}: {oppTO.short} short · {oppTO.full} full left</div>
              <div className="timeout-btn-row">
                <button className="timeout-btn timeout-btn-short" disabled={inOvertimeNow || oppTO.short <= 0} onClick={() => takeTimeout(opponentSide, "short")}>Use 30s</button>
                <button className="timeout-btn timeout-btn-full"  disabled={oppTO.full <= 0}                    onClick={() => takeTimeout(opponentSide, "full")}>Use 60s</button>
              </div>
            </div>
          </>
        )}

        <div className="classic-score-grid" role="group" aria-label="Scoring controls by team">
          <div className="classic-score-col">
            <div className="shot-grid-team-label shot-grid-team-label-my" title={`Scoring for ${myName}`}>{myName}</div>
            <button className={`circle classic-score-btn ${myColorClass}`} onClick={() => setModal({ kind: "shot", teamId: vcSideSetup, points: 2, made: true, zone: defaultZoneForPoints(2) })}>2pt</button>
            <button className={`circle classic-score-btn ${myColorClass}`} onClick={() => setModal({ kind: "shot", teamId: vcSideSetup, points: 3, made: true, zone: defaultZoneForPoints(3) })}>3pt</button>
            <button className={`circle classic-score-btn ${myColorClass}`} onClick={() => setModal({ kind: "freeThrow", teamId: vcSideSetup, made: true })}>1pt</button>
          </div>

          <div className="classic-score-col">
            <div className="shot-grid-team-label shot-grid-team-label-opp" title={`Scoring for ${oppName}`}>{oppName}</div>
            <button
              className={`circle classic-score-btn ${oppColorClass}`}
              disabled={!canTrackOppPoints}
              onClick={() => setModal({ kind: "shot", teamId: opponentSide, points: 2, made: true, zone: defaultZoneForPoints(2) })}
              title={canTrackOppPoints ? `Add 2PT for ${oppName}` : "Enable opponent points tracking in settings"}
            >2pt</button>
            <button
              className={`circle classic-score-btn ${oppColorClass}`}
              disabled={!canTrackOppPoints}
              onClick={() => setModal({ kind: "shot", teamId: opponentSide, points: 3, made: true, zone: defaultZoneForPoints(3) })}
              title={canTrackOppPoints ? `Add 3PT for ${oppName}` : "Enable opponent points tracking in settings"}
            >3pt</button>
            <button
              className={`circle classic-score-btn ${oppColorClass}`}
              disabled={!canTrackOppFt}
              onClick={() => setModal({ kind: "freeThrow", teamId: opponentSide, made: true })}
              title={canTrackOppFt ? `Add FT for ${oppName}` : "Enable opponent free throw tracking in settings"}
            >1pt</button>
          </div>
        </div>
      </div>
    </div>
  );
}
