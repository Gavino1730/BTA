import type { Insight } from "./ai.js";

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function replaceToken(text: string, token: string, replacement: string): string {
  const source = token.trim();
  const target = replacement.trim();
  if (!source || !target || source === target) {
    return text;
  }

  const escapedToken = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])(${escapedToken})(?=[^A-Za-z0-9_-]|$)`, "gi");
  return text.replace(pattern, (_match, prefix: string) => `${prefix}${target}`);
}

export function formatInsightTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ai_coaching: "AI Coaching",
    pre_game: "Pre-Game",
    foul_trouble: "Foul Trouble",
    foul_warning: "Foul Warning",
    team_foul_warning: "Team Fouls / Bonus",
    sub_suggestion: "Sub Suggestion",
    timeout_suggestion: "Timeout",
    hot_hand: "Hot Hand",
    ot_awareness: "Overtime",
    run_detection: "Run Alert",
    turnover_pressure: "Turnover Pressure",
    shot_profile: "Shot Profile",
    scoring_drought: "Scoring Drought",
    depth_warning: "Depth Warning",
    efficiency: "Efficiency",
    leverage: "Game Leverage",
    three_point_streak: "3PT Alert",
    foul_to_give: "Fouls to Give",
    opponent_hot_hand: "Opp Hot Hand",
    cold_shooter: "Cold Shooter",
    transition_momentum: "Transition",
  };
  if (labels[type]) return labels[type];

  return type
    .split("_")
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "ai") return "AI";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function formatInsightAge(createdAtIso: string): string {
  const createdMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdMs)) return "just now";

  const diffSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1m ago";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function getRuleInsightImportanceClass(insight: Insight): string {
  if (insight.priority === "urgent") {
    return "insight-item-rule-urgent";
  }

  if (insight.priority === "important") {
    return "insight-item-rule-high";
  }

  if (insight.priority === "info") {
    return "insight-item-rule-default";
  }

  if (
    insight.type === "foul_warning" ||
    insight.type === "team_foul_warning" ||
    insight.type === "sub_suggestion" ||
    insight.type === "timeout_suggestion" ||
    insight.type === "ot_awareness"
  ) {
    return "insight-item-rule-high";
  }

  if (insight.confidence === "high") {
    return "insight-item-rule-high";
  }

  if (insight.confidence === "medium") {
    return "insight-item-rule-medium";
  }

  return "insight-item-rule-default";
}

export function getRuleBadgeImportanceClass(insight: Insight): string {
  if (insight.confidence === "high") {
    return "insight-badge-rules-high";
  }

  if (insight.confidence === "medium") {
    return "insight-badge-rules-medium";
  }

  return "insight-badge-rules-default";
}
