import { describe, expect, it } from "vitest";
import { buildPlayerGameHistory, normalizePlayerLookupKey, type GameSummary, type PlayerSummary } from "./player-history.js";

describe("player history helpers", () => {
  it("normalizes player lookup keys consistently", () => {
    expect(normalizePlayerLookupKey("  Cooper Bonnett ")).toBe("cooperbonnett");
    expect(normalizePlayerLookupKey("COOPER-BONNETT")).toBe("cooperbonnett");
    expect(normalizePlayerLookupKey(undefined)).toBe("");
  });

  it("builds previous-game history for a selected player from season games", () => {
    const player: PlayerSummary = {
      name: "Cooper",
      full_name: "Cooper Bonnett",
      number: 4,
      ppg: 12.4,
    };

    const games: GameSummary[] = [
      {
        gameId: "g1",
        date: "2026-03-01",
        opponent: "OES",
        result: "W",
        vc_score: 63,
        opp_score: 51,
        player_stats: [
          {
            name: "Cooper Bonnett",
            number: 4,
            fg_made: 4,
            fg_att: 8,
            fg3_made: 2,
            fg3_att: 5,
            ft_made: 1,
            ft_att: 2,
            oreb: 1,
            dreb: 4,
            asst: 3,
            stl: 2,
            blk: 0,
            to: 1,
            fouls: 2,
          },
        ],
      },
      {
        gameId: "g2",
        date: "2026-03-08",
        opponent: "Jesuit",
        result: "L",
        vc_score: 54,
        opp_score: 58,
        player_stats: [
          {
            name: "COOPER BONNETT",
            number: 4,
            fg_made: 3,
            fg_att: 10,
            fg3_made: 1,
            fg3_att: 4,
            ft_made: 4,
            ft_att: 4,
            oreb: 0,
            dreb: 5,
            asst: 2,
            stl: 1,
            blk: 1,
            to: 2,
            fouls: 1,
          },
        ],
      },
    ];

    const history = buildPlayerGameHistory(player, games);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      gameId: "g2",
      opponent: "Jesuit",
      pts: 11,
      reb: 5,
      asst: 2,
      result: "L",
      fgDisplay: "3-10",
      fg3Display: "1-4",
      ftDisplay: "4-4",
    });
    expect(history[1]).toMatchObject({
      gameId: "g1",
      opponent: "OES",
      pts: 11,
      reb: 5,
      asst: 3,
      result: "W",
    });
  });
});
