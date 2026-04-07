import type { AiChatMessage, AiSignalCard } from "./helpers/index.js";

interface Props {
  gameId: string;
  isRefreshingAiInsights: boolean;
  refreshAiBenchCalls: () => Promise<void>;
  loadPromptPreview: () => Promise<void>;
  aiQuickQuestions: string[];
  sendAiChat: (questionOverride?: string) => Promise<void>;
  isSendingAiChat: boolean;
  aiChatMessages: AiChatMessage[];
  aiChatInput: string;
  setAiChatInput: (v: string) => void;
  aiChatStatus: string;
  aiSubSuggestionCards: AiSignalCard[];
  aiFoulAlertCards: AiSignalCard[];
  aiEfficiencyCards: AiSignalCard[];
  promptPreviewStatus: string;
  historicalPromptContext: string;
}

export function AiTabPanel({
  gameId,
  isRefreshingAiInsights,
  refreshAiBenchCalls,
  loadPromptPreview,
  aiQuickQuestions,
  sendAiChat,
  isSendingAiChat,
  aiChatMessages,
  aiChatInput,
  setAiChatInput,
  aiChatStatus,
  aiSubSuggestionCards,
  aiFoulAlertCards,
  aiEfficiencyCards,
  promptPreviewStatus,
  historicalPromptContext,
}: Props) {
  return (
    <>
      <section className="card ai-page-hero">
        <div>
          <p className="eyebrow">Game Intelligence</p>
          <h2>AI Bench Assistant</h2>
          <p className="text-muted">Live Q&amp;A, sub recommendations, foul danger, and hot-hand context powered by the current game plus previous-game player trends.</p>
        </div>
        <div className="ai-page-actions">
          <button
            className="secondary insight-refresh-button"
            onClick={() => void refreshAiBenchCalls()}
            disabled={!gameId || isRefreshingAiInsights}
          >
            {isRefreshingAiInsights ? "Refreshing..." : "Refresh AI Insights"}
          </button>
          <button className="secondary" onClick={() => void loadPromptPreview()} disabled={!gameId}>
            Refresh Context
          </button>
        </div>
      </section>

      <section className="ai-page-layout">
        <div className="card ai-chat-card">
          <div className="ai-chat-header">
            <div>
              <h2>In-Game Chat</h2>
              <p className="text-muted">Ask what adjustment to make right now, who should sub, which player is efficient, or what foul risk is building.</p>
            </div>
          </div>

          <div className="ai-quick-question-row">
            {aiQuickQuestions.map((question) => (
              <button
                key={question}
                className="secondary ai-quick-question"
                onClick={() => void sendAiChat(question)}
                disabled={!gameId || isSendingAiChat}
              >
                {question}
              </button>
            ))}
          </div>

          <div className="ai-chat-thread">
            {aiChatMessages.length === 0 ? (
              <p className="ai-chat-empty">No chat yet. Start with a question about subs, foul trouble, efficiency, or late-game decisions.</p>
            ) : (
              aiChatMessages.map((message) => (
                <article key={message.id} className={`ai-chat-bubble ai-chat-bubble-${message.role}`}>
                  <div className="ai-chat-bubble-label">{message.role === "assistant" ? "Assistant" : "Coach"}</div>
                  <p>{message.content}</p>
                </article>
              ))
            )}
          </div>

          <form
            className="ai-chat-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void sendAiChat();
            }}
          >
            <textarea
              value={aiChatInput}
              onChange={(event) => setAiChatInput(event.target.value)}
              placeholder="Ask AI a live coaching question..."
            />
            <div className="ai-chat-compose-row">
              <p className="text-muted ai-chat-status">{aiChatStatus}</p>
              <button type="submit" disabled={!gameId || isSendingAiChat}>
                {isSendingAiChat ? "Asking..." : "Ask AI"}
              </button>
            </div>
          </form>
        </div>

        <div className="ai-page-sidebar">
          <section className="card ai-signal-card-wrap">
            <h2>Suggested Subs</h2>
            {aiSubSuggestionCards.length === 0 ? (
              <p className="text-muted">No immediate sub recommendation right now.</p>
            ) : (
              <div className="ai-signal-list">
                {aiSubSuggestionCards.map((card) => (
                  <article key={card.id} className={`ai-signal-card ai-signal-card-${card.tone}`}>
                    <h3>{card.title}</h3>
                    <p>{card.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card ai-signal-card-wrap">
            <h2>Foul And Bonus Alerts</h2>
            {aiFoulAlertCards.length === 0 ? (
              <p className="text-muted">No major foul or bonus pressure right now.</p>
            ) : (
              <div className="ai-signal-list">
                {aiFoulAlertCards.map((card) => (
                  <article key={card.id} className={`ai-signal-card ai-signal-card-${card.tone}`}>
                    <h3>{card.title}</h3>
                    <p>{card.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card ai-signal-card-wrap">
            <h2>Hot Hand And Efficiency</h2>
            {aiEfficiencyCards.length === 0 ? (
              <p className="text-muted">No clear efficiency edge yet.</p>
            ) : (
              <div className="ai-signal-list">
                {aiEfficiencyCards.map((card) => (
                  <article key={card.id} className={`ai-signal-card ai-signal-card-${card.tone}`}>
                    <h3>{card.title}</h3>
                    <p>{card.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card ai-signal-card-wrap">
            <h2>Historical Context</h2>
            <p className="text-muted">{promptPreviewStatus}</p>
            {historicalPromptContext && historicalPromptContext.toLowerCase().includes("unavailable") && (
              <p className="text-muted" style={{ color: "var(--color-warning, #d97706)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                ⚠ Season stats unavailable — AI insights rely on live game data only.
              </p>
            )}
            <div className="ai-history-context">
              {historicalPromptContext && !historicalPromptContext.toLowerCase().includes("unavailable")
                ? historicalPromptContext
                : "Historical team and player context will appear here after the AI context refreshes."}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
