import { useEffect, useState } from "react";
import { normalizeTeamColor } from "@bta/shared-schema";
import { apiBase, apiKeyHeader } from "../platform.js";
import {
  type RosterPlayer,
  type RosterTeam,
  DOWNLOAD_REVOKE_DELAY_MS,
  loadRosterTeams,
  saveRosterTeams,
  normalizeRosterTeams,
  slugifyTeamName,
  newPlayerId,
} from "../helpers/index.js";

export function useRosterManager() {
  const [rosterTeams, setRosterTeamsState] = useState<RosterTeam[]>(loadRosterTeams);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPlayerDraft, setEditPlayerDraft] = useState<RosterPlayer | null>(null);
  const [showNewTeamForm, setShowNewTeamForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamAbbr, setNewTeamAbbr] = useState("");
  const [newTeamColor, setNewTeamColor] = useState("#4f8cff");
  const [addingPlayerForTeam, setAddingPlayerForTeam] = useState<string | null>(null);
  const [newPlayerNum, setNewPlayerNum] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPos, setNewPlayerPos] = useState("");
  const [newPlayerHeight, setNewPlayerHeight] = useState("");
  const [newPlayerGrade, setNewPlayerGrade] = useState("");
  const [newPlayerRole, setNewPlayerRole] = useState("");
  const [newPlayerNotes, setNewPlayerNotes] = useState("");

  // Persist to local storage + sync to realtime API
  function setRosterTeams(next: RosterTeam[]) {
    setRosterTeamsState(next);
    saveRosterTeams(next);

    void (async () => {
      try {
        const realtimeRes = await fetch(`${apiBase}/config/roster-teams`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...apiKeyHeader() },
          body: JSON.stringify({ teams: next }),
        });
        if (!realtimeRes.ok) {
          console.warn("Roster save to realtime API failed", realtimeRes.status);
        }
      } catch {
        // Keep local fallback when API is unavailable.
      }
    })();
  }

  // Called from socket handler — updates state + storage without re-syncing to API
  function setRosterTeamsFromRemote(teams: RosterTeam[]) {
    setRosterTeamsState(teams);
    saveRosterTeams(teams);
  }

  useEffect(() => {
    let isMounted = true;
    async function hydrateRosterFromApi() {
      try {
        const response = await fetch(`${apiBase}/config/roster-teams`, { headers: apiKeyHeader() });
        if (!response.ok) return;
        const payload = (await response.json()) as { teams?: unknown };
        const teams = normalizeRosterTeams(payload.teams);
        if (!isMounted) return;
        if (teams.length > 0 || rosterTeams.length === 0) {
          setRosterTeamsState(teams);
          saveRosterTeams(teams);
        }
      } catch {
        // Keep local fallback when API is unavailable.
      }
    }

    void hydrateRosterFromApi();

    // Poll for roster changes from other devices (deletions by operator console or stats dashboard)
    const pollInterval = setInterval(() => {
      void hydrateRosterFromApi();
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function addTeam() {
    if (!newTeamName.trim()) return;
    let id = slugifyTeamName(newTeamName);
    let suffix = 2;
    while (rosterTeams.some((t) => t.id === id)) { id = `${slugifyTeamName(newTeamName)}-${suffix++}`; }
    const abbr = newTeamAbbr.trim().toUpperCase().slice(0, 4) || newTeamName.trim().slice(0, 3).toUpperCase();
    const team: RosterTeam = {
      id,
      name: newTeamName.trim(),
      abbreviation: abbr,
      teamColor: normalizeTeamColor(newTeamColor),
      players: [],
    };
    setRosterTeams([...rosterTeams, team]);
    setNewTeamName("");
    setNewTeamAbbr("");
    setNewTeamColor("#4f8cff");
    setShowNewTeamForm(false);
    setExpandedTeamId(id);
  }

  function removeTeam(id: string) {
    if (!window.confirm(`Remove team "${rosterTeams.find((t) => t.id === id)?.name ?? id}"?`)) return;
    setRosterTeams(rosterTeams.filter((t) => t.id !== id));
    if (expandedTeamId === id) setExpandedTeamId(null);
  }

  function updateTeamCoachStyle(teamId: string, coachStyle: string) {
    const nextCoachStyle = coachStyle.trim();
    setRosterTeams(
      rosterTeams.map((team) =>
        team.id === teamId
          ? { ...team, coachStyle: nextCoachStyle || undefined }
          : team
      )
    );
  }

  function updateTeamColor(teamId: string, teamColor: string) {
    const nextTeamColor = normalizeTeamColor(teamColor);
    setRosterTeams(
      rosterTeams.map((team) =>
        team.id === teamId
          ? { ...team, teamColor: nextTeamColor }
          : team
      )
    );
  }

  function addPlayer(teamId: string) {
    if (!newPlayerName.trim() || !newPlayerNum.trim()) return;
    const player: RosterPlayer = {
      id: newPlayerId(),
      number: newPlayerNum.trim(),
      name: newPlayerName.trim(),
      position: newPlayerPos,
      height: newPlayerHeight.trim() || undefined,
      grade: newPlayerGrade.trim() || undefined,
      role: newPlayerRole.trim() || undefined,
      notes: newPlayerNotes.trim() || undefined,
    };
    setRosterTeams(rosterTeams.map((t) => t.id === teamId ? { ...t, players: [...t.players, player] } : t));
    setAddingPlayerForTeam(null);
    setNewPlayerNum("");
    setNewPlayerName("");
    setNewPlayerPos("");
    setNewPlayerHeight("");
    setNewPlayerGrade("");
    setNewPlayerRole("");
    setNewPlayerNotes("");
  }

  function removePlayer(teamId: string, playerId: string) {
    setRosterTeams(rosterTeams.map((t) => t.id === teamId ? { ...t, players: t.players.filter((p) => p.id !== playerId) } : t));
    if (editingPlayerId === playerId) { setEditingPlayerId(null); setEditPlayerDraft(null); }
  }

  function saveEditedPlayer(teamId: string) {
    if (!editPlayerDraft) return;
    const normalizedDraft: RosterPlayer = {
      ...editPlayerDraft,
      number: editPlayerDraft.number.trim(),
      name: editPlayerDraft.name.trim(),
      position: editPlayerDraft.position.trim(),
      height: editPlayerDraft.height?.trim() || undefined,
      grade: editPlayerDraft.grade?.trim() || undefined,
      role: editPlayerDraft.role?.trim() || undefined,
      notes: editPlayerDraft.notes?.trim() || undefined,
    };
    setRosterTeams(rosterTeams.map((t) =>
      t.id === teamId ? { ...t, players: t.players.map((p) => p.id === normalizedDraft.id ? normalizedDraft : p) } : t
    ));
    setEditingPlayerId(null);
    setEditPlayerDraft(null);
  }

  function exportRoster() {
    const json = JSON.stringify({ teams: rosterTeams }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  }

  function importRoster(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target!.result as string) as { teams?: unknown };
        const validated = normalizeRosterTeams(data.teams);
        if (validated.length > 0) setRosterTeams(validated);
      } catch { /* invalid JSON */ }
    };
    reader.readAsText(file);
  }

  return {
    rosterTeams,
    setRosterTeams,
    setRosterTeamsFromRemote,
    expandedTeamId, setExpandedTeamId,
    editingPlayerId, setEditingPlayerId,
    editPlayerDraft, setEditPlayerDraft,
    showNewTeamForm, setShowNewTeamForm,
    newTeamName, setNewTeamName,
    newTeamAbbr, setNewTeamAbbr,
    newTeamColor, setNewTeamColor,
    addingPlayerForTeam, setAddingPlayerForTeam,
    newPlayerNum, setNewPlayerNum,
    newPlayerName, setNewPlayerName,
    newPlayerPos, setNewPlayerPos,
    newPlayerHeight, setNewPlayerHeight,
    newPlayerGrade, setNewPlayerGrade,
    newPlayerRole, setNewPlayerRole,
    newPlayerNotes, setNewPlayerNotes,
    addTeam,
    removeTeam,
    updateTeamCoachStyle,
    updateTeamColor,
    addPlayer,
    removePlayer,
    saveEditedPlayer,
    exportRoster,
    importRoster,
  };
}
