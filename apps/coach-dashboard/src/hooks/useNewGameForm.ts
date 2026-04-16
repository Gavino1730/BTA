import { useState } from "react";
import { normalizeTeamColor } from "@bta/shared-schema";
import { apiBase, apiKeyHeader, resolveActiveSchoolId } from "../platform.js";
import { generateGameId, applyGameSessionToUrl } from "../helpers/index.js";
import { createTeamLiveSession } from "../workspace.js";
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
  setConnectionId: (value: string) => void;
  setGameId: (id: string) => void;
  setSetupNames: (names: SetupNames) => void;
  setDashboardStatus: (status: string) => void;
}

function readInitialTeamId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("teamId")?.trim() ?? "";
}

export function useNewGameForm({
  rosterTeams,
  endedGameIdsRef,
  connectionId,
  setConnectionId,
  setGameId,
  setSetupNames,
  setDashboardStatus,
}: UseNewGameFormOptions) {
  const [newGameOpponent, setNewGameOpponent] = useState("");
  const [newGameMyTeamId, setNewGameMyTeamId] = useState(readInitialTeamId);
  const [newGameVcSide, setNewGameVcSide] = useState<"home" | "away">("home");
  const [newGameOppColor, setNewGameOppColor] = useState("#f87171");
  const [newGameStartingLineup, setNewGameStartingLineup] = useState<string[]>([]);
  const [isLaunchingGame, setIsLaunchingGame] = useState(false);

  async function launchGame(): Promise<void> {
    if (isLaunchingGame || newGameStartingLineup.length !== 5) {
      return;
    }

    if (!resolveActiveSchoolId()) {
      setDashboardStatus("Cannot launch game until school context is available.");
      return;
    }

    const selectedTeam = rosterTeams.find((team) => team.id === newGameMyTeamId);
    const opponentName = newGameOpponent.trim();
    if (!selectedTeam || !opponentName) {
      setDashboardStatus("Choose a team and opponent before starting a game.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const baseId = generateGameId(opponentName, today);
    const newId = endedGameIdsRef.current?.has(baseId)
      ? `${baseId}-${Date.now().toString(36).slice(-3)}`
      : baseId;
    endedGameIdsRef.current?.delete(newId);

    const myTeamColor = normalizeTeamColor(selectedTeam.teamColor) ?? "#4f8cff";
    const homeColor = newGameVcSide === "home" ? myTeamColor : newGameOppColor;
    const awayColor = newGameVcSide === "away" ? myTeamColor : newGameOppColor;
    const rosterPlayerIds = new Set((selectedTeam.players ?? []).map((player) => player.id));
    const selectedStartingLineup = [...new Set(newGameStartingLineup)]
      .filter((playerId) => rosterPlayerIds.has(playerId))
      .slice(0, 5);

    setIsLaunchingGame(true);
    setDashboardStatus("Starting team live session...");

    try {
      const payload = await createTeamLiveSession(newGameMyTeamId, {
        opponentName,
        gameId: newId,
        pairingCode: connectionId,
        vcSide: newGameVcSide,
        homeTeamColor: homeColor,
        awayTeamColor: awayColor,
        startingLineup: selectedStartingLineup,
      });

      const createdGameId = payload.liveSession.gameId ?? newId;
      if (payload.pairing.pairingCode && payload.pairing.pairingCode !== connectionId) {
        setConnectionId(payload.pairing.pairingCode);
      }

      if (selectedStartingLineup.length > 0) {
        await fetch(`${apiBase}/api/games/${encodeURIComponent(createdGameId)}/lineup`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...apiKeyHeader() },
          body: JSON.stringify({
            startingLineupByTeam: {
              [newGameMyTeamId]: selectedStartingLineup,
            },
          }),
        }).catch(() => undefined);
      }

      setGameId(createdGameId);
      setSetupNames({
        myTeamId: newGameMyTeamId,
        myTeamName: selectedTeam.displayName ?? selectedTeam.name ?? "",
        opponentName,
        vcSide: newGameVcSide,
        homeColor,
        awayColor,
      });
      applyGameSessionToUrl(
        createdGameId,
        newGameMyTeamId,
        selectedTeam.displayName ?? selectedTeam.name ?? "",
        opponentName,
        newGameVcSide,
        homeColor,
        awayColor,
      );
      setDashboardStatus("Live session started.");
    } catch (error) {
      setDashboardStatus(error instanceof Error ? error.message : "Could not start live session.");
    } finally {
      setIsLaunchingGame(false);
    }
  }

  function resetForm(): void {
    setNewGameOpponent("");
    setNewGameMyTeamId(readInitialTeamId());
    setNewGameVcSide("home");
    setNewGameOppColor("#f87171");
    setNewGameStartingLineup([]);
  }

  return {
    newGameOpponent, setNewGameOpponent,
    newGameMyTeamId, setNewGameMyTeamId,
    newGameVcSide, setNewGameVcSide,
    newGameOppColor, setNewGameOppColor,
    newGameStartingLineup, setNewGameStartingLineup,
    isLaunchingGame,
    launchGame,
    resetForm,
  };
}
