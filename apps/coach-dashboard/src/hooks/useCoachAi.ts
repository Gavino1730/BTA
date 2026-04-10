import { useEffect, useMemo, useRef, useState } from "react";
import { apiBase, apiKeyHeader, resolveActiveSchoolId } from "../platform.js";
import {
  type CoachAiSettings,
  type CoachInsightFocus,
  type AiPromptPreview,
  type AiChatMessage,
  type AiChatResponse,
  type Insight,
  defaultCoachAiSettings,
  extractHistoricalContextFromPrompt,
} from "../helpers/index.js";

interface UseCoachAiOptions {
  gameId: string;
  setInsights: (insights: Insight[]) => void;
  setDashboardStatus: (status: string) => void;
}

function mapAiHttpError(status: number, fallback: string): string {
  if (status === 429) {
    return "AI insights are temporarily rate-limited. Wait a moment and try again.";
  }
  if (status === 503) {
    return "AI service is temporarily unavailable. Rules-based insights are still active.";
  }
  if (status === 401 || status === 403) {
    return "AI request blocked by auth or role policy. Reconnect and try again.";
  }
  if (status === 400) {
    return "AI request rejected. Verify game scope and try again.";
  }
  return fallback;
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const payload = await response.json() as { error?: unknown; message?: unknown };
    const text = typeof payload.error === "string"
      ? payload.error
      : typeof payload.message === "string"
        ? payload.message
        : "";
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

interface GameAiStatus {
  healthy: boolean;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

const AI_ERROR_MESSAGES: Record<string, string> = {
  missing_api_key: "AI not configured — set OPENAI_API_KEY on the server to enable bench call generation.",
  rate_limited: "AI generation is rate-limited. Rules-based insights are still active.",
  timeout: "AI request timed out. Rules-based insights are still active.",
  service_unavailable: "AI service is unavailable. Rules-based insights are still active.",
  upstream_error: "AI upstream error. Rules-based insights are still active.",
  network_error: "AI network error. Rules-based insights are still active.",
  invalid_payload: "AI response could not be parsed. Rules-based insights are still active.",
};

export function useCoachAi({ gameId, setInsights, setDashboardStatus }: UseCoachAiOptions) {
  const lastAiRefreshAtRef = useRef<number>(0);
  const hasTenantScope = Boolean(resolveActiveSchoolId());

  const [isRefreshingAiInsights, setIsRefreshingAiInsights] = useState(false);
  const [aiRefreshError, setAiRefreshError] = useState("");
  const [aiSettings, setAiSettings] = useState<CoachAiSettings>(defaultCoachAiSettings);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<CoachAiSettings>(defaultCoachAiSettings);
  const [aiSettingsStatus, setAiSettingsStatus] = useState("No saved settings for this game yet.");
  const [promptPreview, setPromptPreview] = useState<AiPromptPreview | null>(null);
  const [promptPreviewStatus, setPromptPreviewStatus] = useState("Prompt preview not loaded.");
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatStatus, setAiChatStatus] = useState(
    "Ask the live assistant about subs, foul danger, hot hands, or defensive adjustments."
  );
  const [isSendingAiChat, setIsSendingAiChat] = useState(false);
  const [aiChatSuggestions, setAiChatSuggestions] = useState<string[]>([]);
  const [aiHealthMessage, setAiHealthMessage] = useState("");

  const historicalPromptContext = useMemo(
    () => extractHistoricalContextFromPrompt(promptPreview?.userPrompt ?? ""),
    [promptPreview?.userPrompt]
  );

  // Hydrate AI settings whenever gameId changes
  useEffect(() => {
    if (!hasTenantScope) {
      setAiSettings(defaultCoachAiSettings());
      setAiSettingsDraft(defaultCoachAiSettings());
      setAiSettingsStatus("Connect to your school workspace to load AI settings.");
      setPromptPreview(null);
      setPromptPreviewStatus("Connect to your school workspace to load prompt preview.");
      return;
    }

    if (!gameId) {
      setAiSettings(defaultCoachAiSettings());
      setAiSettingsDraft(defaultCoachAiSettings());
      setAiSettingsStatus("Connect to a live game to save AI settings.");
      setPromptPreview(null);
      setPromptPreviewStatus("Connect to a live game to load prompt preview.");
      return;
    }

    let cancelled = false;
    async function hydrateAiSettings() {
      try {
        const response = await fetch(`${apiBase}/api/games/${gameId}/ai-settings`, {
          headers: apiKeyHeader(),
        });
        if (!response.ok) {
          try {
            const seed = await fetch(`${apiBase}/api/ai-settings`, {
              headers: apiKeyHeader(),
            });
            if (seed.ok) {
              const defaults = (await seed.json()) as CoachAiSettings | null;
              const next = defaults ?? defaultCoachAiSettings();
              if (!cancelled) {
                setAiSettings(next);
                setAiSettingsDraft(next);
                setAiSettingsStatus("Loaded team defaults.");
              }
              return;
            }
          } catch { /* ignore */ }
          if (!cancelled) {
            setAiSettings(defaultCoachAiSettings());
            setAiSettingsDraft(defaultCoachAiSettings());
            setAiSettingsStatus("Using defaults. Save to create custom AI settings for this game.");
          }
          return;
        }

        const payload = (await response.json()) as CoachAiSettings | null;
        const next = payload ?? defaultCoachAiSettings();
        if (!cancelled) {
          setAiSettings(next);
          setAiSettingsDraft(next);
          setAiSettingsStatus("Loaded AI settings for this game.");
        }
      } catch {
        if (!cancelled) {
          setAiSettingsStatus("Could not load AI settings from realtime API.");
        }
      }
    }

    void hydrateAiSettings();
    return () => {
      cancelled = true;
    };
  }, [gameId, hasTenantScope]);

  async function saveAiSettings(): Promise<void> {
    if (!hasTenantScope) {
      setAiSettingsStatus("Connect to your school workspace first.");
      return;
    }

    if (!gameId) {
      setAiSettingsStatus("Connect to a live game first, then save AI settings.");
      return;
    }

    setAiSettingsStatus("Saving AI settings...");
    try {
      const response = await fetch(`${apiBase}/api/games/${gameId}/ai-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify(aiSettingsDraft),
      });

      if (!response.ok) {
        setAiSettingsStatus(`Save failed (${response.status}).`);
        return;
      }

      const saved = (await response.json()) as CoachAiSettings;
      setAiSettings(saved);
      setAiSettingsDraft(saved);
      setAiSettingsStatus("AI settings saved and applied to live coaching insights.");
      setPromptPreviewStatus("Settings saved. Refresh prompt preview to inspect current AI input.");
    } catch {
      setAiSettingsStatus("Save failed: could not reach realtime API.");
    }
  }

  async function loadPromptPreview(): Promise<void> {
    if (!hasTenantScope) {
      setPromptPreviewStatus("Connect to your school workspace first.");
      return;
    }

    if (!gameId) {
      setPromptPreviewStatus("Connect to a live game first.");
      return;
    }

    setPromptPreviewStatus("Loading prompt preview...");
    try {
      const response = await fetch(`${apiBase}/api/games/${gameId}/ai-prompt-preview`, {
        headers: apiKeyHeader(),
      });
      if (!response.ok) {
        setPromptPreview(null);
        setPromptPreviewStatus(`Prompt preview unavailable (${response.status}).`);
        return;
      }

      const payload = (await response.json()) as AiPromptPreview;
      setPromptPreview(payload);
      setPromptPreviewStatus("Prompt preview loaded.");
    } catch {
      setPromptPreview(null);
      setPromptPreviewStatus("Could not load prompt preview from realtime API.");
    }
  }

  async function sendAiChat(questionOverride?: string): Promise<void> {
    const question = (questionOverride ?? aiChatInput).trim();
    if (!hasTenantScope) {
      setAiChatStatus("Connect to your school workspace first.");
      return;
    }

    if (!gameId) {
      setAiChatStatus("Connect to a live game first.");
      return;
    }

    if (!question) {
      setAiChatStatus("Enter a question for the in-game assistant.");
      return;
    }

    const userMessage: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      createdAtIso: new Date().toISOString(),
    };

    const historyPayload = aiChatMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setAiChatMessages((current) => [...current, userMessage]);
    setAiChatInput("");
    setAiChatStatus("Thinking through live and historical context...");
    setIsSendingAiChat(true);

    try {
      const response = await fetch(`${apiBase}/api/games/${gameId}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify({
          question,
          history: historyPayload,
        }),
      });

      if (!response.ok) {
        const apiMessage = await readErrorMessage(response);
        const fallback = apiMessage
          ? `AI chat unavailable: ${apiMessage}`
          : "AI chat is unavailable right now.";
        setAiChatStatus(mapAiHttpError(response.status, fallback));
        return;
      }

      const payload = (await response.json()) as AiChatResponse;
      setAiChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer,
          createdAtIso: payload.generatedAtIso,
        },
      ]);
      setAiChatSuggestions(payload.suggestions);
      setAiChatStatus(
        payload.usedHistoricalContext
          ? "Answered with live game state plus historical team and player context."
          : "Answered with live game context only - season stats unavailable."
      );
    } catch {
      setAiChatStatus("AI chat request failed. Realtime API may be unavailable.");
    } finally {
      setIsSendingAiChat(false);
    }
  }

  function toggleFocusInsight(focus: CoachInsightFocus): void {
    setAiSettingsDraft((current) => {
      const exists = current.focusInsights.includes(focus);
      if (exists) {
        const next = current.focusInsights.filter((item) => item !== focus);
        return {
          ...current,
          focusInsights: next.length > 0 ? next : current.focusInsights,
        };
      }

      return {
        ...current,
        focusInsights: [...current.focusInsights, focus],
      };
    });
  }

  // Resets AI-specific state when clearing an active game
  async function fetchAiHealthMessage(): Promise<void> {
    try {
      const resp = await fetch(`${apiBase}/api/games/${gameId}/ai-status`, { headers: apiKeyHeader() });
      if (!resp.ok) return;
      const status = (await resp.json()) as GameAiStatus;
      if (status.healthy) { setAiHealthMessage(""); return; }
      const msg = (status.lastErrorCode ? AI_ERROR_MESSAGES[status.lastErrorCode] : null)
        ?? (status.lastErrorMessage ? `AI unavailable: ${status.lastErrorMessage}` : null)
        ?? "AI generation unavailable. Rules-based insights are still active.";
      setAiHealthMessage(msg);
    } catch {
      // Health check is informational; ignore failures
    }
  }

  function resetAiState(): void {
    setAiChatMessages([]);
    setAiChatInput("");
    setAiChatSuggestions([]);
    setPromptPreview(null);
    setAiRefreshError("");
    setAiHealthMessage("");
  }

  async function refreshAiBenchCalls(): Promise<void> {
    if (!hasTenantScope || !gameId || isRefreshingAiInsights) {
      return;
    }

    // Debounce: ignore refresh requests within 2 seconds of the last request
    const now = Date.now();
    if (now - lastAiRefreshAtRef.current < 2000) {
      return;
    }
    lastAiRefreshAtRef.current = now;

    setIsRefreshingAiInsights(true);
    setAiRefreshError("");

    try {
      const query = new URLSearchParams({ force: "1" });
      const response = await fetch(`${apiBase}/api/games/${gameId}/insights?${query.toString()}`, {
        headers: apiKeyHeader(),
      });

      if (!response.ok) {
        const apiMessage = await readErrorMessage(response);
        const fallback = apiMessage
          ? `Could not refresh AI bench calls: ${apiMessage}`
          : "Could not refresh AI bench calls right now.";
        setAiRefreshError(mapAiHttpError(response.status, fallback));
        return;
      }

      const payload = (await response.json()) as Insight[];
      setInsights(payload);
      setDashboardStatus("AI bench calls refreshed");
      const hasAiInsights = payload.some((i) => i.type === "ai_coaching");
      if (!hasAiInsights) {
        void fetchAiHealthMessage();
      } else {
        setAiHealthMessage("");
      }
    } catch {
      setAiRefreshError("Could not refresh AI bench calls right now. Check network and try again.");
    } finally {
      setIsRefreshingAiInsights(false);
    }
  }

  return {
    isRefreshingAiInsights, setIsRefreshingAiInsights,
    aiHealthMessage,
    aiRefreshError, setAiRefreshError,
    aiSettings,
    aiSettingsDraft, setAiSettingsDraft,
    aiSettingsStatus,
    promptPreview,
    promptPreviewStatus,
    aiChatMessages, setAiChatMessages,
    aiChatInput, setAiChatInput,
    aiChatStatus,
    isSendingAiChat,
    aiChatSuggestions, setAiChatSuggestions,
    historicalPromptContext,
    saveAiSettings,
    loadPromptPreview,
    sendAiChat,
    toggleFocusInsight,
    resetAiState,
    refreshAiBenchCalls,
  };
}
