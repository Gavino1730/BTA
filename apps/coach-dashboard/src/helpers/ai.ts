export interface Insight {
  id: string;
  type: string;
  priority?: "urgent" | "important" | "info";
  confidence?: "high" | "medium";
  message: string;
  explanation: string;
  createdAtIso: string;
  relatedTeamId?: string;
  relatedPlayerId?: string;
}

export interface RotationWatchNote {
  playerId: string;
  level: "high" | "medium";
  reason: string;
}

export type CoachInsightFocus =
  | "timeouts"
  | "substitutions"
  | "foul_management"
  | "momentum"
  | "shot_selection"
  | "ball_security"
  | "hot_hand"
  | "defense";

export interface CoachAiSettings {
  playingStyle: string;
  teamContext: string;
  customPrompt: string;
  focusInsights: CoachInsightFocus[];
}

export interface AiPromptPreview {
  model: string;
  userPrompt: string;
  systemGuide: string[];
  coachSettings: CoachAiSettings;
  recentEventCount: number;
  generatedAtIso: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAtIso: string;
}

export interface AiChatResponse {
  answer: string;
  suggestions: string[];
  generatedAtIso: string;
  usedHistoricalContext: boolean;
}

export interface AiSignalCard {
  id: string;
  title: string;
  detail: string;
  tone: "high" | "medium" | "default";
}

export const AI_FOCUS_OPTIONS: Array<{ id: CoachInsightFocus; label: string }> = [
  { id: "timeouts", label: "Timeout management" },
  { id: "substitutions", label: "Substitutions" },
  { id: "foul_management", label: "Foul management" },
  { id: "momentum", label: "Momentum swings" },
  { id: "shot_selection", label: "Shot selection" },
  { id: "ball_security", label: "Ball security" },
  { id: "hot_hand", label: "Hot hand usage" },
  { id: "defense", label: "Defensive calls" },
];

export function defaultCoachAiSettings(): CoachAiSettings {
  return {
    playingStyle: "",
    teamContext: "",
    customPrompt: "",
    focusInsights: AI_FOCUS_OPTIONS.map((option) => option.id),
  };
}

export function extractHistoricalContextFromPrompt(prompt: string): string {
  const line = prompt
    .split("\n")
    .find((entry) => entry.toLowerCase().startsWith("historical context from stats dashboard:"));
  if (!line) {
    return "";
  }

  return line
    .slice("Historical context from stats dashboard:".length)
    .trim();
}
