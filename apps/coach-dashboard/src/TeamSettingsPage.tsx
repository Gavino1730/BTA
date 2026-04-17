import { useEffect, useState } from "react";
import {
  generateConnectionCode,
  normalizeConnectionCode,
  resolveActiveSchoolId,
} from "./platform.js";
import { CONNECTION_CODE_STORAGE_KEY } from "./team-settings/constants.js";
import { createDefaultTeam, createEmptyNewPlayer, getInitialConnectionCode, persistConnectionCode } from "./team-settings/helpers.js";
import {
  AiSection,
  BillingSection,
  MembersSection,
  PairingSection,
  ProfileSection,
  RosterSection,
  SettingsHeader,
  SettingsTabNav,
} from "./team-settings/sections.js";
import type { AppMemberRole, NewPlayerFormState, OrganizationMemberDto, OrganizationProfileDto, RosterEditRow, TeamDto } from "./team-settings/types.js";
import { useBillingSummary } from "./team-settings/useBillingSummary.js";
import { useSettingsSectionState } from "./team-settings/useSettingsSectionState.js";
import { useTeamSettingsActions } from "./team-settings/useTeamSettingsActions.js";
import { useTeamSettingsData } from "./team-settings/useTeamSettingsData.js";
import { TeamWorkspaceHeader } from "./TeamWorkspaceHeader.js";

export function TeamSettingsPage() {
  const activeSchoolId = resolveActiveSchoolId();
  const { activeSection, setActiveSection } = useSettingsSectionState();
  const {
    team,
    setTeam,
    profile,
    setProfile,
    members,
    setMembers,
    currentMember,
    roster,
    setRoster,
    playingStyle,
    setPlayingStyle,
    teamContext,
    setTeamContext,
    customPrompt,
    setCustomPrompt,
    focusInsightsText,
    setFocusInsightsText,
    status,
    setStatus,
  } = useTeamSettingsData(activeSchoolId);
  const {
    billingEntitlement,
    billingStatus,
    billingLoading,
    billingLoadFailed,
    refreshBilling,
  } = useBillingSummary(activeSection);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppMemberRole>("coach");
  const [newPlayer, setNewPlayer] = useState<NewPlayerFormState>(createEmptyNewPlayer());
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  const [connectionCode, setConnectionCode] = useState(() => getInitialConnectionCode(generateConnectionCode, normalizeConnectionCode));

  const {
    saving,
    saveOrganizationProfile,
    saveTeamProfile,
    saveAiSettings,
    inviteMember,
    saveMember,
    removeMember,
    resendMemberInvite,
    sendPasswordResetEmail,
    addPlayer,
    savePlayer,
    removePlayer,
    sendPlayerInviteEmail,
  } = useTeamSettingsActions({
    team,
    profile,
    playingStyle,
    teamContext,
    customPrompt,
    focusInsightsText,
    inviteName,
    inviteEmail,
    inviteRole,
    members,
    newPlayer,
    setMembers,
    setRoster,
    setInviteName,
    setInviteEmail,
    setInviteRole,
    setNewPlayer,
    setStatus,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CONNECTION_CODE_STORAGE_KEY, connectionCode);
  }, [connectionCode]);

  function handleCopyConnectionCode() {
    const writePromise = navigator.clipboard?.writeText(connectionCode);
    if (!writePromise) {
      return;
    }

    void writePromise.then(() => {
      setCopyConfirmed(true);
      window.setTimeout(() => setCopyConfirmed(false), 2000);
    });
  }

  function handleGenerateConnectionCode() {
    const nextCode = generateConnectionCode();
    setConnectionCode(nextCode);
    persistConnectionCode(nextCode);
  }

  function handleRosterChange(rowKey: string, patch: Partial<RosterEditRow>) {
    setRoster((current) => current.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)));
  }

  function handleToggleRosterExpanded(rowKey: string) {
    setRoster((current) => current.map((row) => (
      row.key === rowKey ? { ...row, showExpanded: !row.showExpanded } : row
    )));
  }

  function handleNewPlayerChange(patch: Partial<NewPlayerFormState>) {
    setNewPlayer((current) => ({ ...current, ...patch }));
  }

  function handleProfileChange(patch: Partial<OrganizationProfileDto>) {
    setProfile((current) => ({ ...(current ?? {}), ...patch }));
  }

  function handleTeamChange(patch: Partial<TeamDto>) {
    setTeam((current) => ({ ...(current ?? createDefaultTeam()), ...patch }));
  }

  function handleMemberChange(memberId: string, patch: Partial<OrganizationMemberDto>) {
    setMembers((current) => current.map((member) => (
      member.memberId === memberId ? { ...member, ...patch } : member
    )));
  }

  return (
    <div className="stats-page">
      <TeamWorkspaceHeader
        eyebrow="Team settings"
        title="Team Configuration"
        subtitle="Manage roster, members, operator pairing, AI context, and billing without leaving the current team workspace."
        status={status}
      />
      <SettingsHeader status={status} />
      <SettingsTabNav activeSection={activeSection} onSelectSection={setActiveSection} />

      {activeSection === "pairing" ? (
        <PairingSection
          connectionCode={connectionCode}
          copyConfirmed={copyConfirmed}
          onCopyCode={handleCopyConnectionCode}
          onGenerateCode={handleGenerateConnectionCode}
        />
      ) : null}

      {activeSection === "roster" ? (
        <RosterSection
          roster={roster}
          newPlayer={newPlayer}
          saving={saving}
          onRosterChange={handleRosterChange}
          onToggleExpanded={handleToggleRosterExpanded}
          onNewPlayerChange={handleNewPlayerChange}
          onAddPlayer={(event) => void addPlayer(event)}
          onSavePlayer={(row) => void savePlayer(row)}
          onSendInvite={(row) => void sendPlayerInviteEmail(row)}
          onSendReset={(email) => void sendPasswordResetEmail(email)}
          onRemovePlayer={(row) => void removePlayer(row)}
        />
      ) : null}

      {activeSection === "profile" ? (
        <ProfileSection
          profile={profile}
          team={team}
          saving={saving}
          onProfileChange={handleProfileChange}
          onTeamChange={handleTeamChange}
          onSaveOrganizationProfile={(event) => void saveOrganizationProfile(event)}
          onSaveTeamProfile={(event) => void saveTeamProfile(event)}
        />
      ) : null}

      {activeSection === "ai" ? (
        <AiSection
          playingStyle={playingStyle}
          teamContext={teamContext}
          customPrompt={customPrompt}
          focusInsightsText={focusInsightsText}
          saving={saving}
          onPlayingStyleChange={setPlayingStyle}
          onTeamContextChange={setTeamContext}
          onCustomPromptChange={setCustomPrompt}
          onFocusInsightsChange={setFocusInsightsText}
          onSave={() => void saveAiSettings()}
        />
      ) : null}

      {activeSection === "members" ? (
        <MembersSection
          members={members}
          currentMember={currentMember}
          inviteName={inviteName}
          inviteEmail={inviteEmail}
          inviteRole={inviteRole}
          saving={saving}
          onMemberChange={handleMemberChange}
          onInviteNameChange={setInviteName}
          onInviteEmailChange={setInviteEmail}
          onInviteRoleChange={setInviteRole}
          onInviteMember={(event) => void inviteMember(event)}
          onSaveMember={(member) => void saveMember(member)}
          onResendInvite={(member) => void resendMemberInvite(member)}
          onSendReset={(email) => void sendPasswordResetEmail(email)}
          onRemoveMember={(member) => void removeMember(member)}
        />
      ) : null}

      {activeSection === "billing" ? (
        <BillingSection
          billingEntitlement={billingEntitlement}
          billingStatus={billingStatus}
          billingLoading={billingLoading}
          billingLoadFailed={billingLoadFailed}
          onRefreshBilling={refreshBilling}
        />
      ) : null}
    </div>
  );
}
