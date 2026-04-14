import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PreGameScreen } from "./PreGameScreen.js";
import type { AppData, Team } from "./types.js";

const baseAppData: AppData = {
  teams: [],
  gameSetup: {
    gameId: "game-1",
    myTeamId: "team-home",
    apiUrl: "http://localhost:4000",
    opponent: "Rivals",
    vcSide: "home",
  },
};

const baseTeam: Team = {
  id: "team-home",
  name: "Sample Team",
  abbreviation: "VC",
  players: [],
};

describe("PreGameScreen", () => {
  it("renders lineup sync failures separately from the general coach sync status", () => {
    const markup = renderToStaticMarkup(
      <PreGameScreen
        appData={baseAppData}
        myTeam={baseTeam}
        opponentName="Rivals"
        connectionSyncStatus="Coach sync is healthy."
        lineupSyncStatus="Could not refresh the live lineup lock from the server. Your last saved starters remain available on this iPad."
        selectedStarters={new Set()}
        showLineupSetup={false}
        lineupLockedByLiveGame={false}
        onPersist={vi.fn()}
        onSetConnectionSyncStatus={vi.fn()}
        onSetSelectedStarters={vi.fn()}
        onSetShowLineupSetup={vi.fn()}
        onSyncFromCoachCode={vi.fn(async () => true)}
        onStartGame={vi.fn(async () => {})}
        onNavigate={vi.fn()}
        showInlineNotice={vi.fn()}
        inlineNoticeNode={null}
        confirmDialogNode={null}
      />,
    );

    expect(markup).toContain("Coach sync is healthy.");
    expect(markup).toContain("Could not refresh the live lineup lock from the server.");
  });
});