import { useMemo, useState } from "react";
import { useGameSession } from "./GameSessionContext.js";
import { AiTabPanel } from "./AiTabPanel.js";
import { BoxScoreSection } from "./BoxScoreSection.js";
import { InsightsPanel } from "./InsightsPanel.js";
import { LineupUnitPanel } from "./LineupUnitPanel.js";
import { RotationPanel } from "./RotationPanel.js";
import { ScoreboardSection } from "./ScoreboardSection.js";
import { SetupGameCard } from "./SetupGameCard.js";

export function LivePage() {
  const {
    gameId, state, insights, isLoading, dashboardStatus,
    activePage, setActivePage, boxScoreFilter, setBoxScoreFilter,
    clearActiveGame,
    rosterTeams,
    newGameMyTeamId, setNewGameMyTeamId,
    newGameOpponent, setNewGameOpponent,
    newGameVcSide, setNewGameVcSide,
    newGameOppColor, setNewGameOppColor,
    newGameStartingLineup, setNewGameStartingLineup,
    isLaunchingGame, launchGame,
    connectionId, setConnectionId,
    operatorConsoleUrl,
    connectedOperatorCount, connectedOperators,
    isEndingGame, isEndGamePromptOpen, endGameStatus,
    requestEndGameFromDashboard, cancelEndGamePrompt, discardGameFromDashboard,
    endGameFromDashboard,
    teams, aggregatedTeams, canonicalTeamId, teamColorById,
    getScoreboardLineup, displayTeamName, displayPlayerName,
    leadersByTeam, canonicalSideIds,
    lineupUnitStats, coachedTeamId, rotationContext,
    aiInsights, rulesInsights, hasGameStarted,
    aiRefreshError, isRefreshingAiInsights, refreshAiBenchCalls, prettifyInsightText,
    boxScorePeriods, boxScoreByTeam, setupNames,
    aiQuickQuestions, sendAiChat, isSendingAiChat,
    aiChatMessages, aiChatInput, setAiChatInput, aiChatStatus,
    aiSubSuggestionCards, aiFoulAlertCards, aiEfficiencyCards,
    promptPreviewStatus, historicalPromptContext, loadPromptPreview,
  } = useGameSession();

  const [liveSubPage, setLiveSubPage] = useState<"scoreboard" | "operators">("scoreboard");
  const [operatorCopyStatus, setOperatorCopyStatus] = useState("");

  const orderedOperators = useMemo(() => {
    return [...connectedOperators].sort((a, b) => {
      const aMs = Date.parse(a.lastSeenIso ?? "");
      const bMs = Date.parse(b.lastSeenIso ?? "");
      if (!Number.isFinite(aMs) && !Number.isFinite(bMs)) return 0;
      if (!Number.isFinite(aMs)) return 1;
      if (!Number.isFinite(bMs)) return -1;
      return bMs - aMs;
    });
  }, [connectedOperators]);

  async function copyOperatorConsoleLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(operatorConsoleUrl);
      setOperatorCopyStatus("Operator link copied.");
    } catch {
      setOperatorCopyStatus("Could not copy link. Use the URL shown in Setup instead.");
    }
  }

  return (
    <div className="page">
      <div className="live-subnav">
        <button
          className={activePage === "live" && liveSubPage === "scoreboard" ? "nav-active" : ""}
          onClick={() => {
            setActivePage("live");
            setLiveSubPage("scoreboard");
          }}
        >
          Scoreboard
        </button>
        <button className={activePage === "ai" ? "nav-active" : ""} onClick={() => setActivePage("ai")}>AI Insights</button>
        <button
          className={activePage === "live" && liveSubPage === "operators" ? "nav-active" : ""}
          onClick={() => {
            setActivePage("live");
            setLiveSubPage("operators");
          }}
        >
          Manage Operators ({connectedOperatorCount})
        </button>
      </div>
      {!gameId && activePage === "ai" && (
        <div className="idle-screen">
          <div className="idle-screen-icon">||</div>
          <p className="idle-screen-title">No Active Game</p>
          <p className="idle-screen-sub">Start a game on the Live tab to enable AI insights.</p>
        </div>
      )}
      {!gameId && activePage === "live" && liveSubPage === "scoreboard" && (
        <SetupGameCard
          rosterTeams={rosterTeams}
          newGameMyTeamId={newGameMyTeamId}
          setNewGameMyTeamId={setNewGameMyTeamId}
          newGameOpponent={newGameOpponent}
          setNewGameOpponent={setNewGameOpponent}
          newGameVcSide={newGameVcSide}
          setNewGameVcSide={setNewGameVcSide}
          newGameOppColor={newGameOppColor}
          setNewGameOppColor={setNewGameOppColor}
          newGameStartingLineup={newGameStartingLineup}
          setNewGameStartingLineup={setNewGameStartingLineup}
          isLaunchingGame={isLaunchingGame}
          launchGame={launchGame}
          dashboardStatus={dashboardStatus}
          connectionId={connectionId}
          setConnectionId={setConnectionId}
        />
      )}
      {!gameId && activePage === "live" && liveSubPage === "operators" && (
        <div className="idle-screen">
          <div className="idle-screen-icon">+</div>
          <p className="idle-screen-title">No Active Game</p>
          <p className="idle-screen-sub">Start a game from the Scoreboard tab before managing operator connections.</p>
        </div>
      )}
      {gameId && activePage === "live" && liveSubPage === "scoreboard" && (
        <>
          <section className="card settings-section-card">
            <div className="stats-page-card-head">
              <div>
                <h3>Live Game Controls</h3>
                <p className="settings-section-desc">Game ID: {gameId}</p>
                <p className="settings-section-desc operators-online-indicator">Operators online: {connectedOperatorCount}</p>
                <div className="settings-pairing-display">
                  <p className="settings-section-desc">Operator Pairing Code</p>
                  <span className="settings-pairing-code">{connectionId}</span>
                </div>
              </div>
              <div className="settings-header-actions">
                <button
                  type="button"
                  className="shell-nav-link danger-btn"
                  onClick={requestEndGameFromDashboard}
                  disabled={isEndingGame}
                >
                  {isEndingGame ? "Ending..." : "End Game"}
                </button>
                <button
                  type="button"
                  className="shell-nav-link"
                  onClick={() => void clearActiveGame("Disconnected.")}
                >
                  Leave Session
                </button>
              </div>
            </div>
            {endGameStatus ? <p className="settings-section-desc">{endGameStatus}</p> : null}
          </section>
          <ScoreboardSection
            isLoading={isLoading}
            dashboardStatus={dashboardStatus}
            teams={teams}
            aggregatedTeams={aggregatedTeams}
            canonicalTeamId={canonicalTeamId}
            teamColorById={teamColorById}
            getScoreboardLineup={getScoreboardLineup}
            displayTeamName={displayTeamName}
            displayPlayerName={displayPlayerName}
            leadersByTeam={leadersByTeam}
            canonicalSideIds={canonicalSideIds}
            currentPeriod={state?.currentPeriod}
          />
          <BoxScoreSection
            teams={teams}
            boxScorePeriods={boxScorePeriods}
            boxScoreFilter={boxScoreFilter}
            setBoxScoreFilter={setBoxScoreFilter}
            boxScoreByTeam={boxScoreByTeam}
            currentPeriod={state?.currentPeriod}
            displayTeamName={displayTeamName}
            displayPlayerName={displayPlayerName}
            rosterTeams={rosterTeams}
            canonicalTeamId={canonicalTeamId}
            myTeamId={setupNames.myTeamId}
            vcSide={setupNames.vcSide}
            stateHomeTeamId={state?.homeTeamId}
            stateAwayTeamId={state?.awayTeamId}
          />
          <LineupUnitPanel
            lineupUnitStats={lineupUnitStats}
            coachedTeamId={coachedTeamId}
            displayPlayerName={displayPlayerName}
          />
          <InsightsPanel
            gameId={gameId}
            hasGameStarted={hasGameStarted}
            insightsCount={insights.length}
            aiInsights={aiInsights}
            rulesInsights={rulesInsights}
            aiRefreshError={aiRefreshError}
            isRefreshingAiInsights={isRefreshingAiInsights}
            refreshAiBenchCalls={refreshAiBenchCalls}
            prettifyInsightText={prettifyInsightText}
          />
          <RotationPanel
            rotationContext={rotationContext}
            displayTeamName={displayTeamName}
            displayPlayerName={displayPlayerName}
          />
          {isEndGamePromptOpen ? (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0, 0, 0, 0.72)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem",
              }}
              role="dialog"
              aria-modal="true"
              aria-label="End Game Confirmation"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  cancelEndGamePrompt();
                }
              }}
            >
              <div
                style={{
                  width: "min(520px, 100%)",
                  background: "var(--surface)",
                  border: "1px solid var(--border-hi)",
                  borderRadius: 16,
                  padding: "1rem",
                  boxShadow: "0 18px 48px rgba(0,0,0,0.5)",
                }}
              >
                <p className="eyebrow" style={{ marginBottom: "0.45rem" }}>End Game</p>
                <h3 style={{ marginBottom: "0.5rem" }}>Save this game before closing?</h3>
                <p className="settings-section-desc" style={{ marginBottom: "0.9rem" }}>
                  Save finalizes and submits this game to the API. Discard closes this live session without submitting.
                </p>
                <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button type="button" className="shell-nav-link" onClick={cancelEndGamePrompt} disabled={isEndingGame}>Cancel</button>
                  <button type="button" className="shell-nav-link" onClick={discardGameFromDashboard} disabled={isEndingGame}>Discard</button>
                  <button type="button" className="shell-nav-link danger-btn" onClick={() => void endGameFromDashboard()} disabled={isEndingGame}>
                    {isEndingGame ? "Saving..." : "Save & End"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
      {gameId && activePage === "live" && liveSubPage === "operators" && (
        <section className="card settings-section-card">
          <div className="stats-page-card-head">
            <div>
              <h3>Manage Operators</h3>
              <p className="settings-section-desc">Connection: {connectionId || "Not set"}</p>
              <p className="settings-section-desc operators-online-indicator">Active operators: {connectedOperatorCount}</p>
            </div>
            <div className="settings-header-actions">
              <button
                type="button"
                className="shell-nav-link"
                onClick={() => void copyOperatorConsoleLink()}
              >
                Copy Operator Link
              </button>
            </div>
          </div>
          {operatorCopyStatus ? <p className="settings-section-desc">{operatorCopyStatus}</p> : null}
          {orderedOperators.length === 0 ? (
            <p className="settings-section-desc">No operators connected yet.</p>
          ) : (
            <div className="operators-list">
              {orderedOperators.map((operator, index) => (
                <div key={`${operator.deviceId ?? "unknown"}-${operator.lastSeenIso ?? index}`} className="operator-row">
                  <div>
                    <p className="operator-device">{operator.deviceName || operator.deviceId || "Unknown device"}</p>
                    <p className="operator-meta">Game: {operator.gameId || "n/a"}</p>
                  </div>
                  <p className="operator-meta">Last seen: {operator.lastSeenIso ? new Date(operator.lastSeenIso).toLocaleTimeString() : "n/a"}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {gameId && activePage === "ai" && (
        <AiTabPanel
          gameId={gameId}
          isRefreshingAiInsights={isRefreshingAiInsights}
          refreshAiBenchCalls={refreshAiBenchCalls}
          loadPromptPreview={loadPromptPreview}
          aiQuickQuestions={aiQuickQuestions}
          sendAiChat={sendAiChat}
          isSendingAiChat={isSendingAiChat}
          aiChatMessages={aiChatMessages}
          aiChatInput={aiChatInput}
          setAiChatInput={setAiChatInput}
          aiChatStatus={aiChatStatus}
          aiSubSuggestionCards={aiSubSuggestionCards}
          aiFoulAlertCards={aiFoulAlertCards}
          aiEfficiencyCards={aiEfficiencyCards}
          promptPreviewStatus={promptPreviewStatus}
          historicalPromptContext={historicalPromptContext}
        />
      )}
    </div>
  );
}
