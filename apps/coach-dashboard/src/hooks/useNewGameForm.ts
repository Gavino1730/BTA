import { useRef, useState } from "react";
import { normalizeTeamColor } from "@bta/shared-schema";
import { apiBase, apiKeyHeader } from "../platform.js";
import { generateGameId, applyGameSessionToUrl } from "../helpers/index.js";
import type { RosterTeam } from "../helpers/index.js";

interface SetupNames {
  myTeamId: string;
  myTeamName: string;
  opponentName: string;
  vcSide: "home" | "away";
  homeColor: string;
  awayColor: string;
}

interface UseNewGameFormOptions {
  rosterTeams: RosterTeam[];
  endedGameIdsRef: React.RefObject<Set<string>>;
  connectionId: string;
  setGameId: (id: string) => void;
  setSetupNames: (names: SetupNames) => void;
  setDashboardStatus: (status: string) => void;
}

export function useNewGameForm({
  rosterTeams,
  endedGameIdsRef,
  connectionId,
  setGameId,
  setSetupNames,
  setDashboardStatus,
}: UseNewGameFormOptions) {
  const [newGameOpponent, setNewGameOpponent] = useState("");
  const [newGameMyTeamId, setNewGameMyTeamId] = useState("");
  const [newGameVcSide, setNewGameVcSide] = useState<"home" | "away">("home");
  const [newGameOppColor, setNewGameOppColor] = useState("#f87171");
  const [newGameStartingLineup, setNewGameStartingLineup] = useState<string[]>([]);
  const [isLaunchingGame, setIsLaunchingGame] = useState(false);

  async function launchGame(): Promise<void> {
    if (isLaunchingGame || newGameStartingLineup.length !== 5) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const baseId = generateGameId(newGameOpponent, today);
    // Avoid reusing an already-ended game ID (e.g. tournament same-day rematch).
    const newId = endedGameIdsRef.current?.has(baseId)
      ? `${baseId}-${Date.now().toString(36).slice(-3)}`
      : baseId;
    endedGameIdsRef.current?.delete(newId);
    const selectedTeam = rosterTeams.find((t) => t.id === newGameMyTeamId);
    const opponentName = newGameOpponent.trim();
    const myTeamColor = normalizeTeamColor(selectedTeam?.teamColor) ?? "#4f8cff";
    const homeColor = newGameVcSide === "home" ? myTeamColor : newGameOppColor;
    const awayColor = newGameVcSide === "away" ? myTeamColor : newGameOppColor;
    const oppSlugBase =
      newGameOpponent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) ||
      "opponent";
    const oppSlug = `team-${oppSlugBase}`;
    const homeTeamId = newGameVcSide === "home" ? newGameMyTeamId : oppSlug;
    const awayTeamId = newGameVcSide === "away" ? newGameMyTeamId : oppSlug;
    const rosterPlayerIds = new Set((selectedTeam?.players ?? []).map((player) => player.id));
    const selectedStartingLineup = [...new Set(newGameStartingLineup)]
      .filter((playerId) => rosterPlayerIds.has(playerId))
      .slice(0, 5);
    const startingLineupByTeam =
      selectedStartingLineup.length > 0 ? { [newGameMyTeamId]: selectedStartingLineup } : undefined;

    setIsLaunchingGame(true);
    setDashboardStatus("Starting game...");

    try {
      const response = await fetch(`${apiBase}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify({ gameId: newId, homeTeamId, awayTeamId, opponentName, startingLineupByTeam }),
      });

      if (response.status === 409) {
        const payload = (await response.json().catch(() => ({}))) as {
          activeGameId?: string;
          activeState?: { gameId?: string };
        };
        const existingGameId = payload.activeGameId ?? payload.activeState?.gameId;
        if (existingGameId) {
          setGameId(existingGameId);
          setDashboardStatus("Joined existing active game from another device.");
        } else {
          setDashboardStatus("A game is already active on another device.");
        }
        return;
      }

      if (!response.ok) {
        setDashboardStatus(`Could not start game (status ${response.status}).`);
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as { gameId?: string };
      const createdGameId = payload.gameId ?? newId;
      setGameId(createdGameId);
      setSetupNames({
        myTeamId: newGameMyTeamId,
        myTeamName: selectedTeam?.name ?? "",
        opponentName,
        vcSide: newGameVcSide,
        homeColor,
        awayColor,
      });
      applyGameSessionToUrl(
        createdGameId,
        newGameMyTeamId,
        selectedTeam?.name ?? "",
        opponentName,
        newGameVcSide,
        homeColor,
        awayColor,
      );

      // Publish the operator link so the iPad can find this game via the connection code.
      if (connectionId) {
        void fetch(`${apiBase}/api/operator-links/${encodeURIComponent(connectionId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...apiKeyHeader() },
          body: JSON.stringify({
            gameId: createdGameId,
            myTeamId: newGameMyTeamId,
            myTeamName: selectedTeam?.name ?? "",
            opponentName,
            vcSide: newGameVcSide,
            homeTeamColor: homeColor,
            awayTeamColor: awayColor,
            dashboardUrl: window.location.href,
          }),
        });
      }

      setDashboardStatus("Game started.");
    } catch {
      setDashboardStatus("Could not start game because realtime API is unreachable.");
    } finally {
      setIsLaunchingGame(false);
    }
  }

  return {
    newGameOpponent, setNewGameOpponent,
    newGameMyTeamId, setNewGameMyTeamId,
    newGameVcSide, setNewGameVcSide,
    newGameOppColor, setNewGameOppColor,
    newGameStartingLineup, setNewGameStartingLineup,
    isLaunchingGame,
    launchGame,
  };
}
