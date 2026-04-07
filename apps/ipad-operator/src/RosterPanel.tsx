import { computeCurrentLineup } from "./helpers/events.js";
import type { GameEvent } from "@bta/shared-schema";
import type { Modal, Player, RunningTotals, TeamSide } from "./types.js";

export interface RosterPanelProps {
  vcSideSetup: TeamSide;
  homePlayers: Player[];
  awayPlayers: Player[];
  allEventObjs: GameEvent[];
  vcTeamId: string;
  startingLineup: string[];
  pTotals: Record<string, RunningTotals>;
  showRosterPanel: boolean;
  setShowRosterPanel: (v: boolean) => void;
  activeRosterPlayerId: string | null;
  setActiveRosterPlayerId: (id: string | null) => void;
  setModal: (m: Modal | null) => void;
  handlePlayerQuickShot: (player: Player, points: 2 | 3, made: boolean) => void;
  handlePlayerQuickStat: (player: Player, stat: "foul" | "def_reb" | "off_reb" | "turnover" | "steal" | "block" | "assist") => void;
}

export function RosterPanel({
  vcSideSetup, homePlayers, awayPlayers, allEventObjs, vcTeamId, startingLineup,
  pTotals, showRosterPanel, setShowRosterPanel, activeRosterPlayerId,
  setActiveRosterPlayerId, setModal, handlePlayerQuickShot, handlePlayerQuickStat,
}: RosterPanelProps) {
  const teamPlayers = vcSideSetup === "home" ? homePlayers : awayPlayers;
  const lineup = computeCurrentLineup(allEventObjs, vcTeamId, startingLineup, teamPlayers);

  return (
    <div className="panel right-panel">
      <div className="right-panel-toggle-row">
        <button
          className={showRosterPanel ? "toggle-btn active" : "toggle-btn"}
          onClick={() => { setShowRosterPanel(true); setActiveRosterPlayerId(null); }}
          title="Player-first actions">
          Players
        </button>
        <button
          className={!showRosterPanel ? "toggle-btn active" : "toggle-btn"}
          onClick={() => { setShowRosterPanel(false); setActiveRosterPlayerId(null); }}
          title="Quick stat circles">
          Stats
        </button>
      </div>
      {!showRosterPanel ? (
        <div className="stat-grid">
          <button className="circle white rebound-btn" onClick={() => setModal({ kind: "stat", stat: "def_reb", teamId: vcSideSetup })}><span className="rebound-main">DEF</span><br/><span className="sub-lbl">reb</span></button>
          <button className="circle white rebound-btn" onClick={() => setModal({ kind: "stat", stat: "off_reb", teamId: vcSideSetup })}><span className="rebound-main">OFF</span><br/><span className="sub-lbl">reb</span></button>
          <button className="circle stat-foul" onClick={() => setModal({ kind: "stat", stat: "foul", teamId: vcSideSetup })}>foul</button>
          <button className="circle stat-to" onClick={() => setModal({ kind: "stat", stat: "turnover", teamId: vcSideSetup })}>to</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "steal",   teamId: vcSideSetup })}>stl</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "assist",  teamId: vcSideSetup })}>asst</button>
          <button className="circle white" onClick={() => setModal({ kind: "stat", stat: "block",   teamId: vcSideSetup })}>blk</button>
          <button className="circle red-out" onClick={() => setModal({ kind: "sub1", teamId: vcSideSetup })}>sub</button>
        </div>
      ) : (
        <div className="roster-panel">
          <div className="roster-section">
            <h4 className="roster-section-title">On Court — tap player to act</h4>
            <div className="roster-list">
              {lineup.onCourt.map(p => (
                <div key={p.id} className={`roster-player on-court${activeRosterPlayerId === p.id ? " roster-player-active" : ""}`}>
                  <button
                    className="roster-player-tap"
                    onClick={() => setActiveRosterPlayerId(activeRosterPlayerId === p.id ? null : p.id)}
                  >
                    <span className="roster-player-num">#{p.number}</span>
                    <span className="roster-player-info">
                      <span className="roster-player-name">{p.name}</span>
                      <span className="roster-player-stats">
                        {pTotals[p.id]?.points ?? 0}pts
                        {" · "}
                        {pTotals[p.id]?.fouls ?? 0}f
                      </span>
                    </span>
                    {pTotals[p.id]?.fouls ? (
                      <span className={`roster-foul-badge${pTotals[p.id].fouls >= 5 ? " foul-badge-out" : pTotals[p.id].fouls >= 4 ? " foul-badge-warn" : ""}`}>
                        {pTotals[p.id].fouls}f
                      </span>
                    ) : null}
                  </button>
                  {activeRosterPlayerId === p.id && (
                    <div className="player-quick-actions">
                      <button className="pqa-btn pqa-make pqa-2pt" onClick={() => handlePlayerQuickShot(p, 2, true)}>2PT ✓</button>
                      <button className="pqa-btn pqa-miss pqa-2pt" onClick={() => handlePlayerQuickShot(p, 2, false)}>2PT ✗</button>
                      <button className="pqa-btn pqa-make pqa-3pt" onClick={() => handlePlayerQuickShot(p, 3, true)}>3PT ✓</button>
                      <button className="pqa-btn pqa-miss pqa-3pt" onClick={() => handlePlayerQuickShot(p, 3, false)}>3PT ✗</button>
                      <button className="pqa-btn pqa-ft" onClick={() => { setActiveRosterPlayerId(null); setModal({ kind: "freeThrow", teamId: vcSideSetup, made: true }); }}>FT</button>
                      <button className="pqa-btn pqa-reb" onClick={() => handlePlayerQuickStat(p, "def_reb")}>REB</button>
                      <button className="pqa-btn pqa-foul" onClick={() => handlePlayerQuickStat(p, "foul")}>FOUL</button>
                      <button className="pqa-btn pqa-to" onClick={() => handlePlayerQuickStat(p, "turnover")}>TO</button>
                      <button className="pqa-btn pqa-stl" onClick={() => handlePlayerQuickStat(p, "steal")}>STL</button>
                      <button className="pqa-btn pqa-asst" onClick={() => handlePlayerQuickStat(p, "assist")}>ASST</button>
                      <button className="pqa-btn pqa-blk" onClick={() => handlePlayerQuickStat(p, "block")}>BLK</button>
                      <button className="pqa-btn pqa-sub" onClick={() => { setActiveRosterPlayerId(null); setModal({ kind: "sub1", teamId: vcSideSetup, playerOutId: p.id }); }}>SUB</button>
                    </div>
                  )}
                </div>
              ))}
              {lineup.onCourt.length === 0 && (
                <p className="roster-empty-hint">No players on court. Set starting lineup in Setup.</p>
              )}
            </div>
          </div>
          <div className="roster-section">
            <h4 className="roster-section-title">Bench</h4>
            <div className="roster-list">
              {lineup.bench.map(p => (
                <div key={p.id} className="roster-player bench">
                  <span className="roster-player-num">#{p.number}</span>
                  <span className="roster-player-info">
                    <span className="roster-player-name">{p.name}</span>
                    {pTotals[p.id] && (
                      <span className="roster-player-stats">
                        {pTotals[p.id].points}pts
                        {pTotals[p.id].fouls > 0 && ` · ${pTotals[p.id].fouls}f`}
                      </span>
                    )}
                  </span>
                  <button
                    className="roster-sub-btn"
                    onClick={() => {
                      if (lineup.onCourt.length > 0) {
                        setModal({ kind: "sub1", teamId: vcSideSetup, playerInId: p.id });
                      }
                    }}
                    title="Sub in">+</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
