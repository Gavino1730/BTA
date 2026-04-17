import type { AppMemberRole, SettingsSection } from "./types.js";

export const SETTINGS_SECTION_STORAGE_KEY = "coach:settings-section";
export const CONNECTION_CODE_STORAGE_KEY = "coach-bound-connection-id";

export const SETTINGS_SECTIONS: Array<{ key: SettingsSection; label: string }> = [
  { key: "pairing", label: "Live Pairing" },
  { key: "roster", label: "Roster" },
  { key: "profile", label: "Profile" },
  { key: "ai", label: "AI Context" },
  { key: "members", label: "Members" },
];

export const MEMBER_ROLE_OPTIONS: Array<{ value: AppMemberRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "coach", label: "Coach" },
  { value: "operator", label: "Operator" },
  { value: "player", label: "Player" },
];

export const FOCUS_INSIGHT_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "timeouts", label: "Timeouts" },
  { key: "substitutions", label: "Substitutions" },
  { key: "foul_management", label: "Foul Trouble" },
  { key: "momentum", label: "Momentum" },
  { key: "shot_selection", label: "Shot Selection" },
  { key: "ball_security", label: "Turnovers" },
  { key: "hot_hand", label: "Hot Hand" },
  { key: "defense", label: "Defense" },
];
