import type { GameEvent } from "@bta/shared-schema";
import type { InsightContext } from "./types.js";
import { resolveOurTeamId, resolveTeamLabel, MAX_RECENT_EVENTS } from "./utils.js";

export interface RuleContext {
  context: InsightContext;
  allEvents: GameEvent[];
  recentEvents: GameEvent[];
  ourTeamId: string | null;
  eventTeamLabel: string;
  period: string;
  now: string;
  clockEnabled: boolean;
}

export function buildRuleContext(context: InsightContext): RuleContext {
  const { state, latestEvent } = context;
  const allEvents = state.events;
  const recentEvents = allEvents.slice(-MAX_RECENT_EVENTS);
  const ourTeamId = resolveOurTeamId(state);
  const clockEnabled = context.clockEnabled !== false;
  const now = new Date().toISOString();
  const eventTeamLabel = resolveTeamLabel(state, latestEvent.teamId);
  return {
    context,
    allEvents,
    recentEvents,
    ourTeamId,
    eventTeamLabel,
    period: state.currentPeriod,
    now,
    clockEnabled,
  };
}
