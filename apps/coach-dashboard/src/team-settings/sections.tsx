import type { FormEvent } from "react";
import { EmptyState } from "../EmptyState.js";
import { MEMBER_ROLE_OPTIONS, SETTINGS_SECTIONS } from "./constants.js";
import { FocusInsightsChips } from "./FocusInsightsChips.js";
import { createDefaultTeam, isValidEmail, navigateWithinCoachApp } from "./helpers.js";
import type { AppMemberRole, BillingSummaryState, NewPlayerFormState, OrganizationMemberDto, OrganizationProfileDto, RosterEditRow, SettingsSection, TeamDto } from "./types.js";

export function SettingsHeader({ status }: { status: string }) {
  return (
    <section className="stats-page-hero compact">
      <div>
        <h1>Settings</h1>
        <p className="stats-page-subtitle">Manage your program, roster, AI context, and team access.</p>
      </div>
      <div className="settings-header-actions">
        <p className="stats-page-status">{status}</p>
        <button type="button" className="shell-nav-link" onClick={() => navigateWithinCoachApp("/billing")}>
          Open Billing
        </button>
      </div>
    </section>
  );
}

interface SettingsTabNavProps {
  activeSection: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
}

export function SettingsTabNav({ activeSection, onSelectSection }: SettingsTabNavProps) {
  return (
    <nav className="settings-tab-nav">
      {SETTINGS_SECTIONS.map((section) => (
        <button
          key={section.key}
          type="button"
          className={`settings-tab-btn${activeSection === section.key ? " settings-tab-btn-active" : ""}`}
          onClick={() => onSelectSection(section.key)}
        >
          <span className="settings-tab-btn-label">{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

interface PairingSectionProps {
  connectionCode: string;
  copyConfirmed: boolean;
  onCopyCode: () => void;
  onGenerateCode: () => void;
}

export function PairingSection({ connectionCode, copyConfirmed, onCopyCode, onGenerateCode }: PairingSectionProps) {
  return (
    <section className="stats-page-card settings-section-card">
      <div className="stats-page-card-head">
        <div>
          <h3>Live Pairing</h3>
          <p className="settings-section-desc">Link the score operator iPad to this dashboard using the 6-digit code below.</p>
        </div>
        <div className="settings-header-actions">
          <button type="button" className="shell-nav-link" onClick={onCopyCode}>
            {copyConfirmed ? "Copied!" : "Copy Code"}
          </button>
          <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onGenerateCode}>
            New Code
          </button>
        </div>
      </div>

      <div className="settings-pairing-display">
        <span className="settings-pairing-code">{connectionCode}</span>
        <p className="settings-pairing-hint">Enter this code in the Score Operator app under <strong>Connect to Dashboard</strong>.</p>
        <div className="settings-inline-chip-row">
          <span className="team-workspace-chip is-primary">6-digit secure code</span>
          <span className="team-workspace-chip">Generate a new code any time</span>
        </div>
      </div>
    </section>
  );
}

interface RosterSectionProps {
  roster: RosterEditRow[];
  newPlayer: NewPlayerFormState;
  saving: boolean;
  onRosterChange: (rowKey: string, patch: Partial<RosterEditRow>) => void;
  onToggleExpanded: (rowKey: string) => void;
  onNewPlayerChange: (patch: Partial<NewPlayerFormState>) => void;
  onAddPlayer: (event: FormEvent<HTMLFormElement>) => void;
  onSavePlayer: (row: RosterEditRow) => void;
  onSendInvite: (row: RosterEditRow) => void;
  onSendReset: (email: string) => void;
  onRemovePlayer: (row: RosterEditRow) => void;
}

export function RosterSection({
  roster,
  newPlayer,
  saving,
  onRosterChange,
  onToggleExpanded,
  onNewPlayerChange,
  onAddPlayer,
  onSavePlayer,
  onSendInvite,
  onSendReset,
  onRemovePlayer,
}: RosterSectionProps) {
  return (
    <section className="stats-page-card settings-section-card">
      <div className="stats-page-card-head">
        <div>
          <h3>Roster</h3>
          <p className="settings-section-desc">{roster.length} player{roster.length !== 1 ? "s" : ""} on the active roster.</p>
          <p className="stats-page-subcopy org-settings-invite-note">
            Invite Email sends a new player invite. Reset Email sends a password reset link for existing player login.
          </p>
        </div>
      </div>

      {roster.length > 0 ? (
        <div className="settings-roster-list">
          {roster.map((row) => (
            <div key={row.key} className="settings-roster-row-card">
              <div className="settings-roster-row-main">
                <div className="settings-roster-row-fields">
                  <input className="settings-roster-input settings-roster-input-num" value={row.number} onChange={(event) => onRosterChange(row.key, { number: event.target.value })} placeholder="#" aria-label="Jersey number" />
                  <input className="settings-roster-input settings-roster-input-name" value={row.name} onChange={(event) => onRosterChange(row.key, { name: event.target.value })} placeholder="Player name" aria-label="Player name" />
                  <input className="settings-roster-input settings-roster-input-sm" value={row.position} onChange={(event) => onRosterChange(row.key, { position: event.target.value })} placeholder="Pos" aria-label="Position" />
                  <input className="settings-roster-input settings-roster-input-sm" value={row.grade} onChange={(event) => onRosterChange(row.key, { grade: event.target.value })} placeholder="Yr" aria-label="Grade/Year" />
                </div>
                <div className="settings-roster-row-actions">
                  <button type="button" className="settings-roster-expand-btn" onClick={() => onToggleExpanded(row.key)} title="Edit AI context (role and notes)">
                    {row.showExpanded ? "Hide AI" : "AI"}
                  </button>
                  <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => onSavePlayer(row)}>Save</button>
                  <button type="button" className="shell-nav-link" title="Send a fresh invite email with setup access" disabled={saving || !isValidEmail(row.email)} onClick={() => onSendInvite(row)}>Invite Email</button>
                  <button type="button" className="shell-nav-link" title="Send a password reset email to this address" disabled={saving || !isValidEmail(row.email)} onClick={() => onSendReset(row.email)}>Reset Email</button>
                  <button type="button" className="shell-nav-link" disabled={saving} onClick={() => onRemovePlayer(row)}>Remove</button>
                </div>
              </div>
              {row.showExpanded ? (
                <div className="settings-roster-row-expanded">
                  <label className="stats-filter-field">
                    <span>Height</span>
                    <input className="settings-roster-input" value={row.height} onChange={(event) => onRosterChange(row.key, { height: event.target.value })} placeholder="e.g. 6'2&quot;" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Weight</span>
                    <input className="settings-roster-input" value={row.weight} onChange={(event) => onRosterChange(row.key, { weight: event.target.value })} placeholder="e.g. 185 lbs" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Email</span>
                    <input className="settings-roster-input" type="email" value={row.email} onChange={(event) => onRosterChange(row.key, { email: event.target.value })} placeholder="player@school.edu" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Phone</span>
                    <input className="settings-roster-input" type="tel" value={row.phone} onChange={(event) => onRosterChange(row.key, { phone: event.target.value })} placeholder="503-555-0100" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Role / Description <span className="settings-hint">(used by AI, for example Primary ball handler, shoots 3s)</span></span>
                    <input className="settings-roster-input" value={row.role} onChange={(event) => onRosterChange(row.key, { role: event.target.value })} placeholder="e.g. Primary ball handler, strong defender" />
                  </label>
                  <label className="stats-filter-field">
                    <span>Notes <span className="settings-hint">(injuries, tendencies, rotation notes)</span></span>
                    <textarea className="settings-roster-textarea" value={row.notes} onChange={(event) => onRosterChange(row.key, { notes: event.target.value })} placeholder="e.g. Recovering from ankle sprain, tends to go left" rows={2} />
                  </label>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No players on this roster yet"
          message="Add your first player below to start building the active team roster and AI context."
        />
      )}

      <form className="settings-add-player-form settings-subsection-card" onSubmit={onAddPlayer}>
        <h4 className="settings-sub-heading">Add Player</h4>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Name *</span><input value={newPlayer.name} onChange={(event) => onNewPlayerChange({ name: event.target.value })} placeholder="Player name" /></label>
          <label className="stats-filter-field"><span>Jersey #</span><input value={newPlayer.number} onChange={(event) => onNewPlayerChange({ number: event.target.value })} placeholder="0" /></label>
          <label className="stats-filter-field"><span>Position</span><input value={newPlayer.position} onChange={(event) => onNewPlayerChange({ position: event.target.value })} placeholder="PG" /></label>
          <label className="stats-filter-field"><span>Grade</span><input value={newPlayer.grade} onChange={(event) => onNewPlayerChange({ grade: event.target.value })} placeholder="11" /></label>
          <label className="stats-filter-field"><span>Height</span><input value={newPlayer.height} onChange={(event) => onNewPlayerChange({ height: event.target.value })} placeholder="6'2&quot;" /></label>
          <label className="stats-filter-field"><span>Weight</span><input value={newPlayer.weight} onChange={(event) => onNewPlayerChange({ weight: event.target.value })} placeholder="185 lbs" /></label>
          <label className="stats-filter-field"><span>Email</span><input type="email" value={newPlayer.email} onChange={(event) => onNewPlayerChange({ email: event.target.value })} placeholder="player@school.edu" /></label>
          <label className="stats-filter-field"><span>Phone</span><input type="tel" value={newPlayer.phone} onChange={(event) => onNewPlayerChange({ phone: event.target.value })} placeholder="503-555-0100" /></label>
          <label className="stats-filter-field"><span>Role / Description</span><input value={newPlayer.role} onChange={(event) => onNewPlayerChange({ role: event.target.value })} placeholder="Primary ball handler, shoots 3s" /></label>
          <label className="stats-filter-field stats-filter-field-full"><span>Notes</span><textarea className="settings-roster-textarea" value={newPlayer.notes} onChange={(event) => onNewPlayerChange({ notes: event.target.value })} placeholder="Injuries, tendencies, rotation notes..." rows={2} /></label>
        </div>
        <div className="settings-form-footer">
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving || !newPlayer.name.trim()}>
            {saving ? "Adding..." : "Add to Roster"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface ProfileSectionProps {
  profile: OrganizationProfileDto | null;
  team: TeamDto | null;
  saving: boolean;
  onProfileChange: (patch: Partial<OrganizationProfileDto>) => void;
  onTeamChange: (patch: Partial<TeamDto>) => void;
  onSaveOrganizationProfile: (event: FormEvent<HTMLFormElement>) => void;
  onSaveTeamProfile: (event: FormEvent<HTMLFormElement>) => void;
}

export function ProfileSection({ profile, team, saving, onProfileChange, onTeamChange, onSaveOrganizationProfile, onSaveTeamProfile }: ProfileSectionProps) {
  const teamState = team ?? createDefaultTeam();

  return (
    <div className="settings-profile-grid">
      <form className="stats-page-card settings-section-card" onSubmit={onSaveOrganizationProfile}>
        <div className="stats-page-card-head">
          <div>
            <h3>Organization</h3>
            <p className="settings-section-desc">Your school or athletic program details.</p>
          </div>
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Save</button>
        </div>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Organization Name</span><input value={profile?.organizationName ?? ""} onChange={(event) => onProfileChange({ organizationName: event.target.value })} placeholder="Your School Athletics" /></label>
          <label className="stats-filter-field"><span>Coach Name</span><input value={profile?.coachName ?? ""} onChange={(event) => onProfileChange({ coachName: event.target.value })} placeholder="Coach Name" /></label>
          <label className="stats-filter-field"><span>Coach Email</span><input type="email" value={profile?.coachEmail ?? ""} onChange={(event) => onProfileChange({ coachEmail: event.target.value })} placeholder="coach@school.org" /></label>
        </div>
      </form>

      <form className="stats-page-card settings-section-card" onSubmit={onSaveTeamProfile}>
        <div className="stats-page-card-head">
          <div>
            <h3>Team</h3>
            <p className="settings-section-desc">Team name, abbreviation, season, and identity.</p>
          </div>
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Save</button>
        </div>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Team Name</span><input value={teamState.name} onChange={(event) => onTeamChange({ name: event.target.value })} placeholder="Varsity Boys Basketball" /></label>
          <label className="stats-filter-field"><span>Abbreviation</span><input value={teamState.abbreviation ?? ""} onChange={(event) => onTeamChange({ abbreviation: event.target.value.toUpperCase().slice(0, 12) })} placeholder="VC" /></label>
          <label className="stats-filter-field"><span>Season</span><input value={teamState.season ?? ""} onChange={(event) => onTeamChange({ season: event.target.value })} placeholder="2026" /></label>
        </div>
      </form>
    </div>
  );
}

interface AiSectionProps {
  playingStyle: string;
  teamContext: string;
  customPrompt: string;
  focusInsightsText: string;
  saving: boolean;
  onPlayingStyleChange: (value: string) => void;
  onTeamContextChange: (value: string) => void;
  onCustomPromptChange: (value: string) => void;
  onFocusInsightsChange: (value: string) => void;
  onSave: () => void;
}

export function AiSection({
  playingStyle,
  teamContext,
  customPrompt,
  focusInsightsText,
  saving,
  onPlayingStyleChange,
  onTeamContextChange,
  onCustomPromptChange,
  onFocusInsightsChange,
  onSave,
}: AiSectionProps) {
  return (
    <section className="stats-page-card settings-section-card">
      <div className="stats-page-card-head">
        <div>
          <h3>AI Context</h3>
          <p className="settings-section-desc">Shape the AI insights engine with your coaching philosophy.</p>
        </div>
        <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={onSave}>Save</button>
      </div>
      <div className="settings-ai-grid">
        <label className="stats-filter-field"><span>Playing Style</span><textarea className="settings-ai-textarea" value={playingStyle} onChange={(event) => onPlayingStyleChange(event.target.value)} placeholder="Fast pace, drive and kick. Emphasis on transition offense and ball movement." rows={4} /></label>
        <div className="stats-filter-field"><span>Focus Insights</span><FocusInsightsChips value={focusInsightsText} onChange={onFocusInsightsChange} /></div>
        <label className="stats-filter-field"><span>Team Context</span><textarea className="settings-ai-textarea" value={teamContext} onChange={(event) => onTeamContextChange(event.target.value)} placeholder="Rebounding emphasis and transition defense. Young roster still building chemistry." rows={4} /></label>
        <label className="stats-filter-field"><span>Custom AI Prompt</span><textarea className="settings-ai-textarea" value={customPrompt} onChange={(event) => onCustomPromptChange(event.target.value)} placeholder="Use concise halftime adjustments with risk level. Prioritize rotation and defensive recommendations." rows={4} /></label>
      </div>
    </section>
  );
}

interface MembersSectionProps {
  members: OrganizationMemberDto[];
  currentMember: OrganizationMemberDto | null;
  inviteName: string;
  inviteEmail: string;
  inviteRole: AppMemberRole;
  saving: boolean;
  onMemberChange: (memberId: string, patch: Partial<OrganizationMemberDto>) => void;
  onInviteNameChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onInviteRoleChange: (value: AppMemberRole) => void;
  onInviteMember: (event: FormEvent<HTMLFormElement>) => void;
  onSaveMember: (member: OrganizationMemberDto) => void;
  onResendInvite: (member: OrganizationMemberDto) => void;
  onSendReset: (email: string) => void;
  onRemoveMember: (member: OrganizationMemberDto) => void;
}

export function MembersSection({
  members,
  currentMember,
  inviteName,
  inviteEmail,
  inviteRole,
  saving,
  onMemberChange,
  onInviteNameChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onInviteMember,
  onSaveMember,
  onResendInvite,
  onSendReset,
  onRemoveMember,
}: MembersSectionProps) {
  const canManageMembers = currentMember?.role === "admin";

  return (
    <section className="stats-page-card settings-section-card">
      <div className="stats-page-card-head">
        <div>
          <h3>Team Members</h3>
          <p className="settings-section-desc">
            {currentMember ? `Signed in as ${currentMember.fullName} - ${currentMember.role}` : "Manage staff access to the coach dashboard."}
          </p>
          <p className="stats-page-subcopy org-settings-invite-note">
            Invite Email sends onboarding access. Reset Email sends a password reset link for existing staff login.
          </p>
        </div>
      </div>

      {members.length > 0 ? (
        <div className="settings-members-list">
          {members.map((member) => (
            <div key={member.memberId} className="settings-member-row">
              <div className="settings-member-info">
                <div className="settings-member-avatar">{member.fullName.charAt(0).toUpperCase()}</div>
                <div>
                  <strong className="settings-member-name">
                    <input className="settings-member-name-input" value={member.fullName} onChange={(event) => onMemberChange(member.memberId, { fullName: event.target.value })} readOnly={!canManageMembers} />
                  </strong>
                  <span className="settings-member-email">{member.email}</span>
                </div>
              </div>
              <div className="settings-member-controls">
                <select className="settings-member-role-select" value={member.role} onChange={(event) => onMemberChange(member.memberId, { role: event.target.value as AppMemberRole })} disabled={!canManageMembers}>
                  {MEMBER_ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption.value} value={roleOption.value}>{roleOption.label}</option>
                  ))}
                </select>
                <span className={`settings-status-badge settings-status-${member.status}`}>{member.status}</span>
                {canManageMembers ? (
                  <>
                    <button type="button" className="shell-nav-link shell-nav-link-active" disabled={saving} onClick={() => onSaveMember(member)}>Save</button>
                    <button type="button" className="shell-nav-link" title="Send a fresh invite email with setup access" disabled={saving || !isValidEmail(member.email)} onClick={() => onResendInvite(member)}>Invite Email</button>
                    <button type="button" className="shell-nav-link" title="Send a password reset email to this address" disabled={saving || !isValidEmail(member.email)} onClick={() => onSendReset(member.email)}>Reset Email</button>
                    <button type="button" className="shell-nav-link" disabled={saving || member.memberId === currentMember?.memberId} onClick={() => onRemoveMember(member)}>Remove</button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No team members yet"
          message="Invite coaches, operators, or viewers below so this workspace is accessible to the right staff."
        />
      )}

      <form className="settings-invite-form settings-subsection-card" onSubmit={onInviteMember}>
        <h4 className="settings-sub-heading">Invite Member</h4>
        <div className="setup-grid">
          <label className="stats-filter-field"><span>Full Name</span><input value={inviteName} onChange={(event) => onInviteNameChange(event.target.value)} placeholder="Assistant Coach Lee" /></label>
          <label className="stats-filter-field"><span>Email</span><input type="email" value={inviteEmail} onChange={(event) => onInviteEmailChange(event.target.value)} placeholder="coach2@school.org" /></label>
          <label className="stats-filter-field">
            <span>Role</span>
            <select value={inviteRole} onChange={(event) => onInviteRoleChange(event.target.value as AppMemberRole)}>
              {MEMBER_ROLE_OPTIONS.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>{roleOption.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-form-footer">
          <button type="submit" className="shell-nav-link shell-nav-link-active" disabled={saving}>Send Invite</button>
        </div>
      </form>
    </section>
  );
}

interface BillingSectionProps extends BillingSummaryState {
  onRefreshBilling: () => void;
}

export function BillingSection({
  billingEntitlement,
  billingStatus,
  billingLoading,
  billingLoadFailed,
  onRefreshBilling,
}: BillingSectionProps) {
  return (
    <section className="stats-page-card settings-section-card">
      <div className="stats-page-card-head">
        <div>
          <h3>Billing</h3>
          <p className="settings-section-desc">Manage your subscription, payment method, invoices, and plan access.</p>
        </div>
      </div>
      {billingLoadFailed ? (
        <EmptyState
          title="Billing status unavailable"
          message={billingStatus}
          actions={(
            <>
              <button type="button" className="shell-nav-link shell-nav-link-active" onClick={onRefreshBilling} disabled={billingLoading}>
                {billingLoading ? "Trying Again..." : "Try Again"}
              </button>
              <button type="button" className="shell-nav-link" onClick={() => navigateWithinCoachApp("/billing")}>
                Open Billing from Stripe
              </button>
            </>
          )}
        />
      ) : (
        <>
          <div className="settings-inline-chip-row settings-billing-chip-row">
            <span className={`team-workspace-chip ${billingEntitlement?.accessActive ? "is-primary" : "is-warning"}`}>
              {billingEntitlement?.accessActive ? "Access Active" : "Access Limited"}
            </span>
            {billingEntitlement?.status ? <span className="team-workspace-chip">Status: {billingEntitlement.status}</span> : null}
          </div>
          <p className="stats-page-subcopy settings-billing-copy">
            {billingStatus}
          </p>
          <div className="settings-form-footer" style={{ marginTop: "1rem" }}>
            <button type="button" className="shell-nav-link shell-nav-link-active" onClick={() => navigateWithinCoachApp("/billing")} disabled={billingLoading}>
              Open Billing from Stripe
            </button>
          </div>
        </>
      )}
    </section>
  );
}
