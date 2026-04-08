import type { Dispatch, SetStateAction } from "react";
import { isOvertimePeriod } from "@bta/shared-schema";
import type { GameEvent } from "@bta/shared-schema";
import { formatClockFromPadInput, formatClockFromSeconds } from "./helpers/clock.js";
import { describeEvent, getEventSectionLabel, getEventTeamBucket } from "./helpers/events.js";
import type { FeedEventSelection, Player, RunningTotals } from "./types.js";
import type { TeamSide } from "./types.js";

type Scores = { home: number; away: number };
type PeriodFouls = { home: number; away: number };
type GameStateDisplay = { tone: string; label: string };
type FeedItem = { event: GameEvent; pending: boolean };
type ConfirmOpts = { title: string; message: string; confirmLabel: string; tone?: "default" | "danger" };

interface LiveCenterPanelProps {
  // Connection
  connectionId: string | undefined;
  connectedOperatorCount: number;
  online: boolean;
  // Game state
  currentGameState: GameStateDisplay;
  vcSideSetup: TeamSide;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
  homeTeamId: string;
  awayTeamId: string;
  scores: Scores;
  periodTeamFouls: PeriodFouls;
  homeInBonus: boolean;
  awayInBonus: boolean;
  possessionTeamId: string | null | undefined;
  // Events / feed
  allEvents: FeedItem[];
  allPlayers: Player[];
  pTotals: Record<string, RunningTotals>;
  foulAlerts: Player[];
  // Period
  period: string;
  overtimeCount: number;
  // Clock
  trackClock: boolean;
  trackPossession: boolean;
  clockVisible: boolean;
  clockEnabled: boolean;
  clockInput: string;
  clockRunning: boolean;
  clockPadOpen: boolean;
  clockPadDigits: string;
  showClockAdmin: boolean;
  // Callbacks
  openFeedEventEditor: (sel: FeedEventSelection) => void;
  deleteEventRecord: (sel: FeedEventSelection) => void;
  changePeriod: (lbl: string) => void;
  addOvertimePeriod: () => void;
  deleteOvertimePeriod: (lbl: string) => void;
  getPeriodOrder: (lbl: string) => number;
  requestConfirm: (opts: ConfirmOpts) => Promise<boolean>;
  setPossession: (side: TeamSide) => void;
  setClockInput: (v: string) => void;
  setClockRunning: Dispatch<SetStateAction<boolean>>;
  setClockPadOpen: Dispatch<SetStateAction<boolean>>;
  setClockPadDigits: Dispatch<SetStateAction<string>>;
  setShowClockAdmin: Dispatch<SetStateAction<boolean>>;
  resetClockForPeriod: () => void;
  adjustClock: (delta: number) => void;
  onToggleClockVisible: () => void;
  onToggleClockEnabled: () => void;
}

export function LiveCenterPanel({
  connectionId,
  connectedOperatorCount,
  online,
  currentGameState,
  vcSideSetup,
  homeTeamName,
  awayTeamName,
  homeTeamColor,
  awayTeamColor,
  homeTeamId,
  awayTeamId,
  scores,
  periodTeamFouls,
  homeInBonus,
  awayInBonus,
  possessionTeamId,
  allEvents,
  allPlayers,
  pTotals,
  foulAlerts,
  period,
  overtimeCount,
  trackClock,
  trackPossession,
  clockVisible,
  clockEnabled,
  clockInput,
  clockRunning,
  clockPadOpen,
  clockPadDigits,
  showClockAdmin,
  openFeedEventEditor,
  deleteEventRecord,
  changePeriod,
  addOvertimePeriod,
  deleteOvertimePeriod,
  getPeriodOrder,
  requestConfirm,
  setPossession,
  setClockInput,
  setClockRunning,
  setClockPadOpen,
  setClockPadDigits,
  setShowClockAdmin,
  resetClockForPeriod,
  adjustClock,
  onToggleClockVisible,
  onToggleClockEnabled,
}: LiveCenterPanelProps) {
  const periodLabels = [
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    ...Array.from({ length: overtimeCount }, (_, index) => `OT${index + 1}`),
  ];

  const myTeamId = vcSideSetup === "home" ? homeTeamId : awayTeamId;
  const myScoreRow = (
    <div
      className={`scoreboard-team-card scoreboard-team-card-my${trackPossession ? " scoreboard-team-card-poss-clickable" : ""}`}
      onClick={trackPossession ? () => setPossession(vcSideSetup) : undefined}
      title={trackPossession ? `Set possession: ${vcSideSetup === "home" ? homeTeamName : awayTeamName}` : undefined}
    >
      <div className="score-row">
        <span className={`team-lbl team-${vcSideSetup}-txt`}>{vcSideSetup === "home" ? homeTeamName : awayTeamName}</span>
        <span className={`score team-${vcSideSetup}-txt`}>{vcSideSetup === "home" ? scores.home : scores.away}</span>
      </div>
      <div className="score-meta-row">
        <span className={`score-meta${(vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away) >= 5 ? " foul-count-danger" : (vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away) === 4 ? " foul-count-warn" : ""}`}>
          Fouls: {vcSideSetup === "home" ? periodTeamFouls.home : periodTeamFouls.away}
        </span>
        {(vcSideSetup === "home" ? homeInBonus : awayInBonus) && <span className="score-chip bonus-chip">BONUS</span>}
        {possessionTeamId === myTeamId && <span className={`score-chip possession-chip possession-chip-${vcSideSetup}`}>POSS</span>}
      </div>
    </div>
  );

  const oppSide = vcSideSetup === "home" ? "away" : "home";
  const oppTeamId = oppSide === "home" ? homeTeamId : awayTeamId;
  const oppScoreRow = (
    <div
      className={`scoreboard-team-card scoreboard-team-card-opp${trackPossession ? " scoreboard-team-card-poss-clickable" : ""}`}
      onClick={trackPossession ? () => setPossession(oppSide) : undefined}
      title={trackPossession ? `Set possession: ${oppSide === "home" ? homeTeamName : awayTeamName}` : undefined}
    >
      <div className="score-row">
        <span className={`team-lbl team-${oppSide}-txt`}>{oppSide === "home" ? homeTeamName : awayTeamName}</span>
        <span className={`score team-${oppSide}-txt`}>{oppSide === "home" ? scores.home : scores.away}</span>
      </div>
      <div className="score-meta-row">
        <span className={`score-meta${(oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away) >= 5 ? " foul-count-danger" : (oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away) === 4 ? " foul-count-warn" : ""}`}>
          Fouls: {oppSide === "home" ? periodTeamFouls.home : periodTeamFouls.away}
        </span>
        {(oppSide === "home" ? homeInBonus : awayInBonus) && <span className="score-chip bonus-chip">BONUS</span>}
        {possessionTeamId === oppTeamId && <span className={`score-chip possession-chip possession-chip-${oppSide}`}>POSS</span>}
      </div>
    </div>
  );

  return (
    <div className="panel center-panel">
      <div className="scoreboard">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.4rem" }}>
          {connectionId && (
            <div className="score-device-id" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }} title="Operator connection status">
              <span>{`Connection: ${connectionId}`}</span>
              <span className={`connection-indicator ${online ? "online" : "offline"}`} title={online ? "Connected" : "Offline - events queued locally"}>
                *
              </span>
              <span className="operators-count-pill" title="Operators currently connected to this game">
                Ops: {connectedOperatorCount}
              </span>
            </div>
          )}
          <div className={`game-state-banner game-state-${currentGameState.tone}`} style={{ margin: 0 }}>
            {currentGameState.label}
          </div>
        </div>
        <div className="scoreboard-team-grid">{myScoreRow}{oppScoreRow}</div>
      </div>

      {foulAlerts.length > 0 && (
        <div className="foul-alerts">
          {foulAlerts.map(p => (
            <div key={p.id} className={`foul-alert ${(pTotals[p.id]?.fouls ?? 0) >= 5 ? "foul-out-alert" : "foul-warn-alert"}`}>
              {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "OUT" : "WARN"} #{p.number} {p.name} - {(pTotals[p.id]?.fouls ?? 0) >= 5 ? "FOULED OUT" : "4 fouls"}
            </div>
          ))}
        </div>
      )}

      <div className="event-feed-header">
        <span className="event-feed-title">Game Log</span>
        <span className="event-feed-hint">Tap an event to edit or delete it</span>
      </div>

      <div className="event-feed">
        {allEvents.length === 0 && <p className="empty-feed">No events yet</p>}
        {allEvents.map(({ event, pending }) => {
          const d = describeEvent(event, homeTeamName, awayTeamName, allPlayers, pTotals, homeTeamId, awayTeamId);
          const eventStamp = `${event.period} ${formatClockFromSeconds(event.clockSecondsRemaining)}`;
          const sectionLabel = getEventSectionLabel(event);
          const teamBucket = getEventTeamBucket(event, homeTeamId, awayTeamId);
          const teamColor = teamBucket === "home" ? homeTeamColor : teamBucket === "away" ? awayTeamColor : undefined;
          const isLast = allEvents[allEvents.length - 1]?.event.id === event.id;
          return (
            <div key={event.id} className="feed-item-wrapper">
              <button
                type="button"
                className={`feed-item feed-item-${teamBucket}${pending ? " feed-pending" : ""}`}
                style={teamColor ? ({ ["--feed-team-color" as string]: teamColor }) : undefined}
                onClick={() => openFeedEventEditor({ event, pending })}
              >
                <span className="feed-stamp">{eventStamp}</span>
                <span className="feed-main-row">
                  <span className="feed-section-tag">{sectionLabel}</span>
                  <span className={`feed-main ac-${d.accent}`}>{d.main}</span>
                  <span className="feed-item-action">Edit</span>
                </span>
                {d.detail && <span className="feed-detail">{d.detail}</span>}
              </button>
              {isLast && (
                <button
                  className="feed-undo-btn"
                  title="Undo: Quick delete this event"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteEventRecord({ event, pending });
                  }}
                >
                  Undo
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="period-row">
        {periodLabels.map((lbl) => {
          const isOt = isOvertimePeriod(lbl);
          const isSkip = getPeriodOrder(lbl) > getPeriodOrder(period) + 1;
          return (
            <div key={lbl} className="period-chip">
              <button
                className={`period-btn${period === lbl ? " period-on" : ""}${isSkip ? " period-btn-skip" : ""}`}
                disabled={isSkip}
                onClick={() => { void changePeriod(lbl); }}
              >{lbl}</button>
              {isOt && (
                <button
                  className="period-delete-btn"
                  title={`Delete ${lbl}`}
                  onClick={async () => {
                    const ok = await requestConfirm({
                      title: `Delete ${lbl}?`,
                      message: "This removes all events in that overtime period.",
                      confirmLabel: `Delete ${lbl}`,
                      tone: "danger",
                    });
                    if (!ok) return;
                    void deleteOvertimePeriod(lbl);
                  }}
                >
                  x
                </button>
              )}
            </div>
          );
        })}
        <button className="period-add-btn" onClick={addOvertimePeriod}>
          + OT
        </button>
      </div>

      {trackClock && (
        <div className="clock-row">
          {clockVisible && (
            <>
              <button
                className={`clock-inp clock-inp-display${clockEnabled ? "" : " clock-inp-disabled"}`}
                disabled={!clockEnabled}
                onClick={() => {
                  if (!clockEnabled) return;
                  setClockPadDigits("");
                  setClockPadOpen(v => !v);
                }}
              >
                {clockPadOpen ? formatClockFromPadInput(clockPadDigits) : clockInput}
              </button>
              {clockPadOpen && (
                <div className="clock-numpad-overlay" onClick={() => setClockPadOpen(false)}>
                  <div className="clock-numpad" onClick={e => e.stopPropagation()}>
                    <div className="clock-numpad-preview">{formatClockFromPadInput(clockPadDigits)}</div>
                    <div className="clock-numpad-grid">
                      {([1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0, "DEL"] as (number | string)[]).map((k, i) => (
                        <button
                          key={i}
                          className="clock-numpad-key"
                          onClick={() => {
                            if (k === "DEL") {
                              setClockPadDigits(d => d.slice(0, -1));
                            } else if (k === ".") {
                              setClockPadDigits(d => {
                                if (d.includes(".")) return d;
                                return d + ".";
                              });
                            } else {
                              setClockPadDigits(d => {
                                const dotIdx = d.indexOf(".");
                                if (dotIdx !== -1) {
                                  if (d.length > dotIdx + 1) return d;
                                  return d + String(k);
                                }
                                return (d + String(k)).slice(0, 4);
                              });
                            }
                          }}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                    <div className="clock-numpad-actions">
                      <button className="clock-numpad-cancel" onClick={() => setClockPadOpen(false)}>Cancel</button>
                      <button className="clock-numpad-set" onClick={() => {
                        const formatted = formatClockFromPadInput(clockPadDigits);
                        setClockInput(formatted);
                        setClockPadOpen(false);
                      }}>Set</button>
                    </div>
                  </div>
                </div>
              )}
              <div className="clock-tools-row clock-tools-row-main">
                <button className={`clock-tool-btn ${clockRunning ? "clock-btn-stop" : "clock-btn-start"}`} onClick={() => setClockRunning(v => !v)} disabled={!clockEnabled}>
                  {clockRunning ? "Stop" : "Start"}
                </button>
                <button className="clock-tool-btn clock-btn-reset" onClick={resetClockForPeriod} disabled={!clockEnabled}>Reset</button>
                <button className="clock-tool-btn clock-btn-minus" onClick={() => adjustClock(-1)} disabled={!clockEnabled}>-1s</button>
                <button className="clock-tool-btn clock-btn-plus" onClick={() => adjustClock(1)} disabled={!clockEnabled}>+1s</button>
              </div>
              <div className="clock-admin-row">
                <button className="clock-admin-toggle" onClick={() => setShowClockAdmin(v => !v)}>
                  {showClockAdmin ? "▲ Clock Settings" : "▼ Clock Settings"}
                </button>
                {showClockAdmin && (
                  <div className="clock-admin-controls">
                    <button
                      className={`clock-tool-btn clock-btn-visibility${clockVisible ? " active" : ""}`}
                      onClick={onToggleClockVisible}
                    >
                      {clockVisible ? "Hide Clock" : "Show Clock"}
                    </button>
                    <button
                      className={`clock-tool-btn clock-btn-enabled${clockEnabled ? " active" : ""}`}
                      onClick={onToggleClockEnabled}
                    >
                      {clockEnabled ? "Disable Clock" : "Enable Clock"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}
