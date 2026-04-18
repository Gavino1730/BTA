import { GameSummaryModal } from "./GameSummaryModal.js";
import type { GameSummaryModalProps } from "./GameSummaryModal.js";
import { ModalRouter, ChainPromptBar } from "./ModalRouter.js";
import type { ModalRouterProps, ChainPromptBarProps } from "./ModalRouter.js";
import { ScoringPanel } from "./ScoringPanel.js";
import type { ScoringPanelProps } from "./ScoringPanel.js";
import { LiveCenterPanel } from "./LiveCenterPanel.js";
import type { LiveCenterPanelProps } from "./LiveCenterPanel.js";
import { RosterPanel } from "./RosterPanel.js";
import type { RosterPanelProps } from "./RosterPanel.js";
import { InlineNoticeBar, AlertBanner, ConfirmDialogOverlay } from "./OperatorOverlays.js";
import { TutorialGate } from "./OperatorPhaseViews.js";
import type { ConfirmDialogState, InlineNotice, OperatorAlert } from "./types.js";

export interface LiveGameViewProps {
  // Colors for CSS custom properties
  homeTeamColor: string;
  awayTeamColor: string;
  // Tutorial overlay
  showTutorial: boolean;
  onSetShowTutorial: (v: boolean) => void;
  // Overlay components
  inlineNotice: InlineNotice | null;
  onDismissInlineNotice: () => void;
  liveAlerts: OperatorAlert[];
  dismissedAlertIds: Set<string>;
  onDismissAlertId: (ids: Set<string>) => void;
  confirmDialog: ConfirmDialogState | null;
  onResolveConfirm: (ok: boolean) => void;
  // Modal router
  modal: ModalRouterProps["modal"];
  modalTeam: ModalRouterProps["team"];
  modalGame: ModalRouterProps["game"];
  modalCallbacks: ModalRouterProps["callbacks"];
  // Chain prompt bar
  chainPrompt: ChainPromptBarProps["chainPrompt"];
  opponentHasRoster: boolean;
  onDismissChain: () => void;
  onSetModal: ChainPromptBarProps["setModal"];
  onRecordTeamRebound: ChainPromptBarProps["recordTeamRebound"];
  // Game summary modal
  showGameSummary: boolean;
  onSetShowGameSummary: (v: boolean) => void;
  gameSummary: Omit<GameSummaryModalProps, "onClose">;
  // Offline / queue indicators
  pendingEventsCount: number;
  hasSchoolScope: boolean;
  hasOfflineQueue: boolean;
  online: boolean;
  onQueueSyncPress: () => void;
  // Panels
  scoring: ScoringPanelProps;
  liveCenter: LiveCenterPanelProps;
  roster: RosterPanelProps;
  // Bottom nav
  onUndoLast: () => void;
  onEndGame: () => void;
  onNavigateSettings: () => void;
}

export function LiveGameView({
  homeTeamColor, awayTeamColor,
  showTutorial, onSetShowTutorial,
  inlineNotice, onDismissInlineNotice,
  liveAlerts, dismissedAlertIds, onDismissAlertId,
  confirmDialog, onResolveConfirm,
  modal, modalTeam, modalGame, modalCallbacks,
  chainPrompt, opponentHasRoster, onDismissChain, onSetModal, onRecordTeamRebound,
  showGameSummary, onSetShowGameSummary, gameSummary,
  pendingEventsCount, hasSchoolScope, hasOfflineQueue, online, onQueueSyncPress,
  scoring, liveCenter, roster,
  onUndoLast, onEndGame, onNavigateSettings,
}: LiveGameViewProps) {
  return (
    <div
      className="game-layout"
      style={{
        ["--team-home-color" as string]: homeTeamColor,
        ["--team-away-color" as string]: awayTeamColor,
      }}
    >
      <TutorialGate showTutorial={showTutorial} onDismiss={() => onSetShowTutorial(false)} />
      <button className="help-fab" onClick={() => onSetShowTutorial(true)} title="Help &amp; Tutorial">?</button>
      <InlineNoticeBar notice={inlineNotice} onDismiss={onDismissInlineNotice} />
      <AlertBanner alerts={liveAlerts} dismissedIds={dismissedAlertIds} onDismissId={onDismissAlertId} />
      <ConfirmDialogOverlay dialog={confirmDialog} onResolve={onResolveConfirm} />
      <ModalRouter modal={modal} team={modalTeam} game={modalGame} callbacks={modalCallbacks} />
      {!modal && (
        <ChainPromptBar
          chainPrompt={chainPrompt}
          vcSideSetup={modalTeam.vcSideSetup}
          opponentSide={modalTeam.opponentSide}
          opponentHasRoster={opponentHasRoster}
          homeTeamName={modalTeam.homeTeamName}
          awayTeamName={modalTeam.awayTeamName}
          homeTeamColor={modalTeam.homeTeamColor}
          awayTeamColor={modalTeam.awayTeamColor}
          onDismiss={onDismissChain}
          setModal={onSetModal}
          recordTeamRebound={onRecordTeamRebound}
        />
      )}
      {showGameSummary && (
        <GameSummaryModal
          onClose={() => onSetShowGameSummary(false)}
          {...gameSummary}
        />
      )}
      {!hasSchoolScope && pendingEventsCount > 0 && (
        <button className="offline-badge pending-badge" onClick={onQueueSyncPress}>
          {pendingEventsCount} queued locally - waiting for school sync
        </button>
      )}
      {hasOfflineQueue && hasSchoolScope && (
        <button className="offline-queue-banner" onClick={onQueueSyncPress}>
          Offline - {pendingEventsCount} event{pendingEventsCount === 1 ? "" : "s"} queued. Tap to retry sync.
        </button>
      )}
      {!hasOfflineQueue && !online && (
        <button className="offline-badge pending-badge" onClick={onQueueSyncPress}>
          OFFLINE - Tap to reconnect
        </button>
      )}
      {hasSchoolScope && !hasOfflineQueue && online && pendingEventsCount > 0 && (
        <button className="offline-badge pending-badge" onClick={onQueueSyncPress}>
          {pendingEventsCount} pending upload - Tap to resubmit
        </button>
      )}

      {/* LEFT: Scoring */}
      <ScoringPanel {...scoring} />

      {/* CENTER: Feed */}
      <LiveCenterPanel {...liveCenter} />

      {/* RIGHT: Players + Stats */}
      <RosterPanel {...roster} />

      <div className="live-bottom-nav" role="navigation" aria-label="Live game actions">
        <button className="live-nav-btn live-nav-btn-undo" onClick={onUndoLast} title="Undo last event">
          Undo
          {pendingEventsCount > 0 && <span className="nav-pending-badge">{pendingEventsCount}</span>}
        </button>
        <button
          className="live-nav-btn live-nav-btn-secondary"
          title="Game summary"
          onClick={() => onSetShowGameSummary(true)}>
          Summary
        </button>
        <button className="live-nav-btn live-nav-btn-secondary" onClick={onNavigateSettings} title="Settings">Settings</button>
        <button className="live-nav-btn live-nav-btn-end" onClick={onEndGame}>
          End Game
        </button>
      </div>
    </div>
  );
}
