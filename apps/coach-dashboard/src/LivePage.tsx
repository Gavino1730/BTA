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
    lastFinishedGameSummary,
    activePage, setActivePage, boxScoreFilter, setBoxScoreFilter,
    dismissFinishedGameSummary,
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
    isEndingGame, isSavingFinalizeDetails, isEndGamePromptOpen, endGameStatus,
    finalizeGameName, finalizeGameDate, finalizeOpponent, finalizeVcScore, finalizeOppScore,
    setFinalizeGameDate, setFinalizeOpponent, setFinalizeVcScore, setFinalizeOppScore,
    requestEndGameFromDashboard, cancelEndGamePrompt, discardGameFromDashboard,
    saveFinalizeDetailsFromDashboard, endGameFromDashboard,
    teams, aggregatedTeams, canonicalTeamId, teamColorById,
    getScoreboardLineup, displayTeamName, displayPlayerName,
    leadersByTeam, canonicalSideIds,
    lineupUnitStats, coachedTeamId, rotationContext,
    aiInsights, rulesInsights, hasGameStarted,
    aiRefreshError, aiHealthMessage, isRefreshingAiInsights, refreshAiBenchCalls, prettifyInsightText,
    boxScorePeriods, filteredBoxScoreEvents, boxScoreByTeam, setupNames,
    deleteGameEvent, deletingGameEventId,
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

  const vcTeamName = teams[0] ? displayTeamName(teams[0]) : "Your Team";
  const opponentTeamName = teams[1] ? displayTeamName(teams[1]) : "Opponent";

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
        <>
          {lastFinishedGameSummary ? (
            <section className="card settings-section-card finalize-game-finished-card" aria-label="Finished Game Summary">
              <p className="eyebrow" style={{ marginBottom: "0.45rem" }}>Game Finished</p>
              <h3 style={{ marginBottom: "0.5rem" }}>{lastFinishedGameSummary.myTeamName} vs {lastFinishedGameSummary.opponentName}</h3>
              <p className="settings-section-desc">Game ID: {lastFinishedGameSummary.gameId}</p>
              <p className="settings-section-desc">Finished at: {new Date(lastFinishedGameSummary.finishedAtIso).toLocaleString()}</p>
              <div className="finalize-game-finished-score">
                <span>{lastFinishedGameSummary.myTeamName}</span>
                <strong>{lastFinishedGameSummary.myScore}</strong>
                <span>-</span>
                <strong>{lastFinishedGameSummary.oppScore}</strong>
                <span>{lastFinishedGameSummary.opponentName}</span>
              </div>
              <div className="finalize-game-actions">
                <button type="button" className="shell-nav-link" onClick={dismissFinishedGameSummary}>Dismiss</button>
              </div>
            </section>
          ) : null}
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
        </>
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
          {isEndGamePromptOpen ? (
            <section className="card settings-section-card finalize-game-card" aria-label="Finalize Game Details">
              <p className="eyebrow" style={{ marginBottom: "0.45rem" }}>Game Over</p>
              <h3 style={{ marginBottom: "0.5rem" }}>Finalize game details</h3>

              <div className="finalize-game-grid">
                <label className="finalize-game-field">
                  <span className="finalize-game-label">Game Name</span>
                  <input
                    className="finalize-game-input"
                    value={finalizeGameName}
                    readOnly
                    aria-readonly="true"
                  />
                </label>
                <label className="finalize-game-field">
                  <span className="finalize-game-label">Date</span>
                  <input
                    type="date"
                    className="finalize-game-input"
                    value={finalizeGameDate}
                    onChange={event => setFinalizeGameDate(event.target.value)}
                  />
                </label>
                <label className="finalize-game-field finalize-game-field-wide">
                  <span className="finalize-game-label">Opponent</span>
                  <input
                    className="finalize-game-input"
                    value={finalizeOpponent}
                    onChange={event => setFinalizeOpponent(event.target.value)}
                    placeholder="Opponent name"
                  />
                </label>
              </div>

              <div className="finalize-game-score-wrap">
                <div className="finalize-game-score-team">
                  <span className="finalize-game-score-name">{vcTeamName}</span>
                  <input
                    className="finalize-game-score-input"
                    inputMode="numeric"
                    value={finalizeVcScore}
                    onChange={event => setFinalizeVcScore(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div className="finalize-game-score-separator">-</div>
                <div className="finalize-game-score-team">
                  <span className="finalize-game-score-name">{opponentTeamName}</span>
                  <input
                    className="finalize-game-score-input"
                    inputMode="numeric"
                    value={finalizeOppScore}
                    onChange={event => setFinalizeOppScore(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
              </div>

              <button
                type="button"
                className="shell-nav-link shell-nav-link-active finalize-game-save-btn"
                onClick={() => void saveFinalizeDetailsFromDashboard()}
                disabled={isSavingFinalizeDetails || isEndingGame}
              >
                {isSavingFinalizeDetails ? "Saving..." : "Save Name/Date/Score Changes"}
              </button>

              {endGameStatus ? <p className="settings-section-desc finalize-game-status">{endGameStatus}</p> : null}

              <div className="finalize-game-actions">
                <button type="button" className="shell-nav-link" onClick={cancelEndGamePrompt} disabled={isSavingFinalizeDetails || isEndingGame}>Cancel</button>
                <button type="button" className="shell-nav-link" onClick={() => void discardGameFromDashboard()} disabled={isSavingFinalizeDetails || isEndingGame}>Discard This Game</button>
                <button type="button" className="shell-nav-link danger-btn" onClick={() => void endGameFromDashboard()} disabled={isSavingFinalizeDetails || isEndingGame}>
                  {isEndingGame ? "Submitting..." : "Submit Game"}
                </button>
              </div>
            </section>
          ) : null}
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
            filteredBoxScoreEvents={filteredBoxScoreEvents}
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
            deletingGameEventId={deletingGameEventId}
            deleteGameEvent={deleteGameEvent}
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
            aiHealthMessage={aiHealthMessage}
            isRefreshingAiInsights={isRefreshingAiInsights}
            refreshAiBenchCalls={refreshAiBenchCalls}
            prettifyInsightText={prettifyInsightText}
          />
          <RotationPanel
            rotationContext={rotationContext}
            displayTeamName={displayTeamName}
            displayPlayerName={displayPlayerName}
          />
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
