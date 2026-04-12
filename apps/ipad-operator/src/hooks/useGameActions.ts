import type { GameEvent } from "@bta/shared-schema";
import type { ChainPrompt, EventEditContext, Modal, NoticeTone, OpponentTrackStat, Player, TeamSide } from "../types.js";

export interface UseGameActionsInput {
  modal: Modal | null;
  setModal: (m: Modal | null) => void;
  setChainPrompt: (c: ChainPrompt | null) => void;
  vcSideSetup: TeamSide;
  opponentSide: TeamSide;
  sequence: number;
  possessionTeamId: string;
  setPossessionOverrideTeamId: (id: string) => void;
  base: (seq: number) => Record<string, unknown>;
  resolveTeamId: (side: TeamSide) => string;
  postEvent: (event: GameEvent) => void;
  saveEditedEvent: (event: GameEvent, ctx: EventEditContext) => Promise<boolean>;
  isOpponentStatEnabled: (stat: OpponentTrackStat) => boolean;
  setActiveRosterPlayerId: (id: string | null) => void;
  showInlineNotice: (message: string, tone?: NoticeTone, durationMs?: number) => void;
  homeTeamName: string;
  awayTeamName: string;
  timeoutRemaining: { home: { full: number; short: number }; away: { full: number; short: number } };
  inOvertimeNow: boolean;
}

export function useGameActions({
  modal, setModal, setChainPrompt, vcSideSetup, opponentSide, sequence,
  possessionTeamId, setPossessionOverrideTeamId, base, resolveTeamId,
  postEvent, saveEditedEvent, isOpponentStatEnabled, setActiveRosterPlayerId,
  showInlineNotice, homeTeamName, awayTeamName, timeoutRemaining, inOvertimeNow,
}: UseGameActionsInput) {

  function autoEmitPossession(teamId: string) {
    if (possessionTeamId === teamId) return;
    setPossessionOverrideTeamId(teamId);
    void postEvent({
      ...base(sequence),
      teamId,
      type: "possession_start",
      possessedByTeamId: teamId,
    } as GameEvent);
  }

  function setPossession(side: TeamSide) {
    const teamId = resolveTeamId(side);
    if (possessionTeamId === teamId) {
      const teamName = side === "home" ? homeTeamName : awayTeamName;
      showInlineNotice(`Possession is already set to ${teamName}.`, "warning", 2500);
      return;
    }
    setPossessionOverrideTeamId(teamId);
    void postEvent({
      ...base(sequence),
      teamId,
      type: "possession_start",
      possessedByTeamId: teamId,
    } as GameEvent);
  }

  function takeTimeout(side: TeamSide, timeoutType: "full" | "short") {
    const teamId = resolveTeamId(side);
    const bucket = side === "home" ? timeoutRemaining.home : timeoutRemaining.away;
    if (timeoutType === "short" && inOvertimeNow) return;
    if (bucket[timeoutType] <= 0) return;
    void postEvent({
      ...base(sequence),
      teamId,
      type: "timeout",
      timeoutType,
    } as GameEvent);
  }

  function confirmShot(playerId: string) {
    if (!modal || modal.kind !== "shot") return;
    if (modal.teamId === opponentSide && !isOpponentStatEnabled("points")) {
      setModal(null);
      return;
    }
    if (modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        teamId: resolveTeamId(modal.teamId),
        type: "shot_attempt",
        playerId,
        made: modal.made,
        points: modal.points,
        zone: modal.zone,
      } as GameEvent, modal.editContext);
      return;
    }
    const shotTeam = modal.teamId;
    const shotMade = modal.made;
    const shotPoints = modal.points;
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(shotTeam),
      type: "shot_attempt",
      playerId,
      made: shotMade,
      points: shotPoints,
      zone: modal.zone,
    } as GameEvent);
    setModal(null);
    if (shotMade) {
      const oppTeamId = resolveTeamId(shotTeam === "home" ? "away" : "home");
      autoEmitPossession(oppTeamId);
      if (shotTeam === vcSideSetup) {
        setChainPrompt({ kind: "after-made-shot", forTeam: shotTeam, points: shotPoints, scorerPlayerId: playerId });
      }
    } else {
      setChainPrompt({ kind: "after-missed-shot", forTeam: shotTeam });
    }
  }

  function confirmFreeThrow(playerId: string) {
    if (!modal || modal.kind !== "freeThrow") return;
    if (modal.teamId === opponentSide && !isOpponentStatEnabled("free_throws")) {
      setModal(null);
      return;
    }
    if (modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        teamId: resolveTeamId(modal.teamId),
        type: "free_throw_attempt",
        playerId,
        made: modal.made,
        attemptNumber: 1,
        totalAttempts: 1,
      } as GameEvent, modal.editContext);
      return;
    }
    const ftTeam = modal.teamId;
    const ftMade = modal.made;
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(ftTeam),
      type: "free_throw_attempt",
      playerId,
      made: ftMade,
      attemptNumber: 1,
      totalAttempts: 1,
    } as GameEvent);
    setModal(null);
    if (ftMade) {
      const oppTeamId = resolveTeamId(ftTeam === "home" ? "away" : "home");
      autoEmitPossession(oppTeamId);
    } else {
      setChainPrompt({ kind: "after-ft-miss", forTeam: ftTeam });
    }
  }

  function confirmStat(playerId: string) {
    if (!modal || modal.kind !== "stat") return;
    if (modal.teamId === opponentSide && !isOpponentStatEnabled(modal.stat as OpponentTrackStat)) {
      setModal(null);
      return;
    }
    const b = base(sequence);
    const { stat } = modal;
    const teamId = resolveTeamId(modal.teamId);
    const otherSide: TeamSide = modal.teamId === "home" ? "away" : "home";
    const otherTeamId = resolveTeamId(otherSide);
    let event: GameEvent | null = null;
    if (stat === "def_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: false } as GameEvent;
    if (stat === "off_reb")  event = { ...b, teamId, type: "rebound",  playerId, offensive: true  } as GameEvent;
    if (stat === "foul")     event = { ...b, teamId, type: "foul",     playerId, foulType: modal.foulType ?? "personal" } as GameEvent;
    if (stat === "turnover") event = { ...b, teamId, type: "turnover", playerId, turnoverType: modal.turnoverType ?? "bad_pass" } as GameEvent;
    if (stat === "steal") {
      if (modal.editContext) {
        void saveEditedEvent({
          ...modal.editContext.originalEvent,
          teamId,
          type: "steal",
          playerId,
        } as GameEvent, modal.editContext);
        return;
      }
      const stealEvent: GameEvent = { ...b, teamId, type: "steal", playerId } as GameEvent;
      void postEvent(stealEvent);
      const isOpponentTurnover = otherSide === opponentSide;
      const shouldTrackOpponentTurnover = !isOpponentTurnover || isOpponentStatEnabled("turnover");
      if (shouldTrackOpponentTurnover) {
        void postEvent({
          ...base(sequence + 1),
          teamId: otherTeamId,
          type: "turnover",
          playerId: otherTeamId,
          turnoverType: "steal",
          forcedByPlayerId: playerId,
        } as GameEvent);
      }
      autoEmitPossession(teamId);
      setModal(null);
      return;
    }
    if (stat === "block")    event = { ...b, teamId, type: "block",    playerId } as GameEvent;
    if (stat === "assist")   { setModal({ kind: "assist2", teamId: modal.teamId, assistPlayerId: playerId }); return; }
    if (event && modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        ...event,
        id: modal.editContext.originalEvent.id,
        gameId: modal.editContext.originalEvent.gameId,
        sequence: modal.editContext.originalEvent.sequence,
        timestampIso: modal.editContext.originalEvent.timestampIso,
        operatorId: modal.editContext.originalEvent.operatorId,
        period: modal.editContext.originalEvent.period,
        clockSecondsRemaining: modal.editContext.originalEvent.clockSecondsRemaining,
      } as GameEvent, modal.editContext);
      return;
    }
    if (event) void postEvent(event);
    if (!modal.editContext) {
      if (stat === "def_reb") {
        autoEmitPossession(teamId);
      } else if (stat === "off_reb") {
        autoEmitPossession(teamId);
      } else if (stat === "turnover") {
        autoEmitPossession(otherTeamId);
        setChainPrompt({ kind: "after-turnover", fromTeam: modal.teamId });
      }
    }
    setModal(null);
  }

  function confirmAssistScorer(scorerPlayerId: string) {
    if (!modal || modal.kind !== "assist2") return;
    setModal({ kind: "assist3", teamId: modal.teamId, assistPlayerId: modal.assistPlayerId, scorerPlayerId });
  }

  async function confirmAssistPoints(points: 2 | 3) {
    if (!modal || modal.kind !== "assist3") return;
    const seq = sequence;
    const teamId = resolveTeamId(modal.teamId);
    await postEvent({
      ...base(seq),
      teamId,
      type: "shot_attempt",
      playerId: modal.scorerPlayerId,
      made: true,
      points,
      zone: points === 3 ? "above_break_three" : "paint",
      assistedByPlayerId: modal.assistPlayerId,
    } as GameEvent);
    void postEvent({
      ...base(seq + 1),
      teamId,
      type: "assist",
      playerId: modal.assistPlayerId,
      scorerPlayerId: modal.scorerPlayerId,
    } as GameEvent);
    setModal(null);
  }

  function confirmSubOut(playerOutId: string) {
    if (!modal || modal.kind !== "sub1") return;
    if (modal.playerInId) {
      if (modal.editContext) {
        void saveEditedEvent({
          ...modal.editContext.originalEvent,
          teamId: resolveTeamId(modal.teamId),
          type: "substitution",
          playerOutId,
          playerInId: modal.playerInId,
        } as GameEvent, modal.editContext);
        return;
      }
      void postEvent({
        ...base(sequence),
        teamId: resolveTeamId(modal.teamId),
        type: "substitution",
        playerOutId,
        playerInId: modal.playerInId,
      } as GameEvent);
      setModal(null);
      return;
    }
    setModal({ kind: "sub2", teamId: modal.teamId, playerOutId, editContext: modal.editContext });
  }

  function confirmSubIn(playerInId: string) {
    if (!modal || (modal.kind !== "sub2" && modal.kind !== "sub1")) return;
    const playerOutId = modal.kind === "sub2" ? modal.playerOutId : modal.playerOutId;
    if (!playerOutId) return;
    if (modal.editContext) {
      void saveEditedEvent({
        ...modal.editContext.originalEvent,
        teamId: resolveTeamId(modal.teamId),
        type: "substitution",
        playerOutId,
        playerInId,
      } as GameEvent, modal.editContext);
      return;
    }
    void postEvent({
      ...base(sequence),
      teamId: resolveTeamId(modal.teamId),
      type: "substitution",
      playerOutId,
      playerInId,
    } as GameEvent);
    setModal(null);
  }

  function handlePlayerQuickShot(player: Player, points: 2 | 3, made: boolean) {
    setActiveRosterPlayerId(null);
    const teamId = resolveTeamId(vcSideSetup);
    void postEvent({
      ...base(sequence),
      teamId,
      type: "shot_attempt",
      playerId: player.id,
      made,
      points,
      zone: points === 3 ? "above_break_three" : "paint",
    } as GameEvent);
    if (made) {
      const oppTeamId = resolveTeamId(vcSideSetup === "home" ? "away" : "home");
      autoEmitPossession(oppTeamId);
      setChainPrompt({ kind: "after-made-shot", forTeam: vcSideSetup, points, scorerPlayerId: player.id });
    } else {
      setChainPrompt({ kind: "after-missed-shot", forTeam: vcSideSetup });
    }
  }

  function handlePlayerQuickStat(player: Player, stat: "foul" | "def_reb" | "off_reb" | "turnover" | "steal" | "block" | "assist") {
    const teamId = resolveTeamId(vcSideSetup);
    setActiveRosterPlayerId(null);
    const b = base(sequence);
    if (stat === "assist") {
      setModal({ kind: "assist2", teamId: vcSideSetup, assistPlayerId: player.id });
      return;
    }
    if (stat === "steal") {
      void postEvent({ ...b, teamId, type: "steal", playerId: player.id } as GameEvent);
      const otherTeamId = resolveTeamId(vcSideSetup === "home" ? "away" : "home");
      if (isOpponentStatEnabled("turnover")) {
        void postEvent({ ...base(sequence + 1), teamId: otherTeamId, type: "turnover", playerId: otherTeamId, turnoverType: "steal", forcedByPlayerId: player.id } as GameEvent);
      }
      autoEmitPossession(teamId);
      return;
    }
    let event: GameEvent | null = null;
    if (stat === "foul")     event = { ...b, teamId, type: "foul",     playerId: player.id, foulType: "personal"  } as GameEvent;
    if (stat === "def_reb")  event = { ...b, teamId, type: "rebound",  playerId: player.id, offensive: false      } as GameEvent;
    if (stat === "off_reb")  event = { ...b, teamId, type: "rebound",  playerId: player.id, offensive: true       } as GameEvent;
    if (stat === "turnover") event = { ...b, teamId, type: "turnover", playerId: player.id, turnoverType: "bad_pass" } as GameEvent;
    if (stat === "block")    event = { ...b, teamId, type: "block",    playerId: player.id } as GameEvent;
    if (event) void postEvent(event);
  }

  function recordTeamRebound(side: TeamSide, offensive: boolean) {
    const teamId = resolveTeamId(side);
    void postEvent({
      ...base(sequence),
      teamId,
      type: "rebound",
      playerId: teamId,
      offensive,
    } as GameEvent);
    autoEmitPossession(teamId);
  }

  return {
    autoEmitPossession,
    setPossession,
    takeTimeout,
    confirmShot,
    confirmFreeThrow,
    confirmStat,
    confirmAssistScorer,
    confirmAssistPoints,
    confirmSubOut,
    confirmSubIn,
    handlePlayerQuickShot,
    handlePlayerQuickStat,
    recordTeamRebound,
  };
}
