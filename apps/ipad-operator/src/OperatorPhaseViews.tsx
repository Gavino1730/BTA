import type { ReactNode } from "react";
import TutorialOverlay from "./TutorialOverlay.js";
import IpadTipsPage from "./IpadTipsPage.js";
import { SettingsScreen } from "./SettingsScreen.js";
import { PreGameScreen } from "./PreGameScreen.js";
import { PostGameScreen } from "./PostGameScreen.js";
import { GameFinishedScreen } from "./GameFinishedScreen.js";
import type { AppData, Team } from "./types.js";
import type { SettingsView } from "./types.js";

interface AccessBlockedViewProps {
  message: string;
}

export function AccessBlockedView({ message }: AccessBlockedViewProps) {
  return (
    <main className="app-shell" style={{ display: "grid", minHeight: "100dvh", placeItems: "center", padding: 24 }}>
      <section className="card" style={{ maxWidth: 640 }}>
        <h2>Access Restricted</h2>
        <p>{message}</p>
      </section>
    </main>
  );
}

interface SettingsViewRendererProps {
  settingsView: SettingsView;
  operatorAllowedSettingsViews: Set<SettingsView>;
  appData: AppData;
  persistData: (next: AppData) => void;
  navigateView: (nextView: "game" | "settings", nextSettingsView?: SettingsView) => void;
  endAndResetGame: () => Promise<boolean>;
}

export function SettingsViewRenderer({
  settingsView,
  operatorAllowedSettingsViews,
  appData,
  persistData,
  navigateView,
  endAndResetGame,
}: SettingsViewRendererProps) {
  if (settingsView === "ipad-tips") {
    return <IpadTipsPage onBack={() => navigateView("settings", "menu")} />;
  }

  const safeSettingsView: SettingsView = operatorAllowedSettingsViews.has(settingsView)
    ? settingsView
    : "menu";

  return (
    <SettingsScreen
      appData={appData}
      settingsView={safeSettingsView}
      onPersist={persistData}
      onNav={(nextView) => navigateView("settings", operatorAllowedSettingsViews.has(nextView) ? nextView : "menu")}
      onBack={() => navigateView("game")}
      onStartGame={async () => {
        const reset = await endAndResetGame();
        if (reset) {
          navigateView("game");
        }
      }}
    />
  );
}

interface PreGameViewProps {
  appData: AppData;
  myTeam: Team | undefined;
  opponentName: string;
  scoringTeamColor: string;
  opponentTeamColor: string;
  connectionSyncStatus: string;
  lineupSyncStatus: string;
  selectedStarters: Set<string>;
  showLineupSetup: boolean;
  lineupLockedByLiveGame: boolean;
  persistData: (next: AppData) => void;
  setConnectionSyncStatus: (status: string) => void;
  setSelectedStarters: (next: Set<string>) => void;
  setShowLineupSetup: (open: boolean) => void;
  syncFromCoachCode: (code?: string, opts?: { silent: boolean }) => void;
  startGame: () => Promise<void>;
  navigateView: (nextView: "game" | "settings", nextSettingsView?: SettingsView) => void;
  showInlineNotice: (msg: string, tone: "success" | "warning" | "error", ms?: number) => void;
  inlineNoticeNode: ReactNode;
  confirmDialogNode: ReactNode;
}

export function PreGameView(props: PreGameViewProps) {
  return (
    <PreGameScreen
      appData={props.appData}
      myTeam={props.myTeam}
      opponentName={props.opponentName}
      scoringTeamColor={props.scoringTeamColor}
      opponentTeamColor={props.opponentTeamColor}
      connectionSyncStatus={props.connectionSyncStatus}
      lineupSyncStatus={props.lineupSyncStatus}
      selectedStarters={props.selectedStarters}
      showLineupSetup={props.showLineupSetup}
      lineupLockedByLiveGame={props.lineupLockedByLiveGame}
      onPersist={props.persistData}
      onSetConnectionSyncStatus={props.setConnectionSyncStatus}
      onSetSelectedStarters={props.setSelectedStarters}
      onSetShowLineupSetup={props.setShowLineupSetup}
      onSyncFromCoachCode={props.syncFromCoachCode}
      onStartGame={props.startGame}
      onNavigate={props.navigateView}
      showInlineNotice={props.showInlineNotice}
      inlineNoticeNode={props.inlineNoticeNode}
      confirmDialogNode={props.confirmDialogNode}
    />
  );
}

interface PostGameViewProps {
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  scores: { home: number; away: number };
  postGameNameInput: string;
  postGameDateInput: string;
  postGameOpponentInput: string;
  postGameHomeScoreInput: string;
  postGameAwayScoreInput: string;
  submitStatus: "idle" | "pending" | "success" | "error";
  submitMessage: string;
  setPostGameNameInput: (value: string) => void;
  setPostGameDateInput: (value: string) => void;
  setPostGameOpponentInput: (value: string) => void;
  setPostGameHomeScoreInput: (value: string) => void;
  setPostGameAwayScoreInput: (value: string) => void;
  setSubmitStatus: (value: "idle" | "pending" | "success" | "error") => void;
  setSubmitMessage: (value: string) => void;
  applyPostGameEdits: () => void;
  submitGameToRealtimeApi: () => Promise<void>;
  requestConfirm: Parameters<typeof PostGameScreen>[0]["onRequestConfirm"];
  resetFromPostGame: () => Promise<void>;
  discardFromPostGame: () => Promise<void>;
  hardResetOperatorSession: () => void;
  persistPhase: (phase: "pre-game" | "live" | "post-game" | "finished") => void;
  inlineNoticeNode: ReactNode;
  confirmDialogNode: ReactNode;
}

export function PostGameView(props: PostGameViewProps) {
  return (
    <PostGameScreen
      gameId={props.gameId}
      homeTeamName={props.homeTeamName}
      awayTeamName={props.awayTeamName}
      scores={props.scores}
      postGameNameInput={props.postGameNameInput}
      postGameDateInput={props.postGameDateInput}
      postGameOpponentInput={props.postGameOpponentInput}
      postGameHomeScoreInput={props.postGameHomeScoreInput}
      postGameAwayScoreInput={props.postGameAwayScoreInput}
      submitStatus={props.submitStatus}
      submitMessage={props.submitMessage}
      onSetPostGameNameInput={props.setPostGameNameInput}
      onSetPostGameDateInput={props.setPostGameDateInput}
      onSetPostGameOpponentInput={props.setPostGameOpponentInput}
      onSetPostGameHomeScoreInput={props.setPostGameHomeScoreInput}
      onSetPostGameAwayScoreInput={props.setPostGameAwayScoreInput}
      onSetSubmitStatus={props.setSubmitStatus}
      onSetSubmitMessage={props.setSubmitMessage}
      onApplyPostGameEdits={props.applyPostGameEdits}
      onSubmitGameToRealtimeApi={props.submitGameToRealtimeApi}
      onRequestConfirm={props.requestConfirm}
      onResetFromPostGame={props.resetFromPostGame}
      onDiscardFromPostGame={props.discardFromPostGame}
      onHandleNewGame={props.hardResetOperatorSession}
      onMarkGameFinished={() => {
        props.persistPhase("finished");
        props.setSubmitStatus("success");
        props.setSubmitMessage("Game submitted. This session is now locked to finished summary.");
      }}
      inlineNoticeNode={props.inlineNoticeNode}
      confirmDialogNode={props.confirmDialogNode}
    />
  );
}

interface FinishedGameViewProps {
  gameId: string;
  gameDate: string;
  opponentName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  submitMessage: string;
  hardResetOperatorSession: () => void;
  inlineNoticeNode: ReactNode;
  confirmDialogNode: ReactNode;
}

export function FinishedGameView(props: FinishedGameViewProps) {
  return (
    <GameFinishedScreen
      gameId={props.gameId}
      gameDate={props.gameDate}
      opponentName={props.opponentName}
      homeTeamName={props.homeTeamName}
      awayTeamName={props.awayTeamName}
      homeScore={props.homeScore}
      awayScore={props.awayScore}
      submitMessage={props.submitMessage}
      onStartNewGame={props.hardResetOperatorSession}
      inlineNoticeNode={props.inlineNoticeNode}
      confirmDialogNode={props.confirmDialogNode}
    />
  );
}

interface TutorialGateProps {
  showTutorial: boolean;
  onDismiss: () => void;
}

export function TutorialGate({ showTutorial, onDismiss }: TutorialGateProps) {
  return showTutorial ? <TutorialOverlay onDismiss={onDismiss} /> : null;
}
