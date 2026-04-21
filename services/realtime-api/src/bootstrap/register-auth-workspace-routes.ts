import { randomBytes } from "node:crypto";
import type { Express } from "express";
import type { Server } from "socket.io";
import {
  getBillingStateByScope,
  saveBillingState,
  getLocalAuthAccountByEmail,
  getLocalAuthAccountsByEmailAcrossSchools,
  getLocalAuthAccountsByScope,
  saveLocalAuthAccount,
  deleteLocalAuthAccount,
  recordLocalAuthLogin,
  getOnboardingAccountStateByScope,
  saveOnboardingAccountState,
  getOrganizationMembersByScope,
  saveOrganizationMember,
  deleteOrganizationMember,
  saveOrganizationProfile,
  getSchoolRecord,
  saveSchoolRecord,
  getRosterTeamsByScope,
  saveRosterTeams,
  getTeamById,
  getActivityEventsByScope,
  saveActivityEvent,
  getLiveGameSessionsByScope,
  createLiveGameSessionRecord,
  getLiveGameSessionById,
  saveOperatorSessionRecord,
  getOperatorSessionByLiveSession,
  getUserWorkspaceProfile,
  saveUserWorkspaceProfile,
  listSchoolMembershipsForUser,
  listTeamMembershipsForUser,
  saveSchoolMembership,
  deleteSchoolMembership,
  saveTeamMembership,
  deleteTeamMembership,
  getSchoolMembershipsByScope,
  getTeamMembershipsByScope,
  createGameDurable,
  getSeasonPlayers,
  getRosterPlayers,
} from "../store.js";
import {
  normalizePersonName,
  normalizeNameKey,
  buildOrganizationSlug,
  buildTeamAbbreviation,
  buildUniqueSchoolTeamId,
  sanitizeTextField,
  isValidEmail,
  shouldSyncPrimaryCoachIdentity,
  hashPassword,
  verifyPassword,
  buildRosterPlayer,
  findPlayerRecord,
  buildOrganizationProfilePayload,
  buildOnboardingAccountPayload,
  requireOnboardingIdentity,
  defaultTeamAiSettings,
  extractTeamAiSettings,
} from "../helpers/string-helpers.js";
import {
  type ScopedRequest,
  schoolRoom,
  resolveRequestSchoolId,
  getSchoolIdFromRequest,
  resolveAuthSchoolId,
} from "../helpers/tenant-helpers.js";
import { issueLocalAuthToken } from "../auth.js";
import { normalizeTeamColor } from "@bta/shared-schema";
import { registerAuthCoreRoutes } from "../routes/auth-core-routes.js";
import { registerAuthAccountRoutes } from "../routes/auth-account-routes.js";
import { registerWorkspaceRoutes } from "../routes/workspace-routes.js";
import { registerOnboardingRoutes } from "../routes/onboarding-routes.js";
import { registerOrgMembersRoutes } from "../routes/org-members-routes.js";
import { registerTeamConfigRoutes } from "../routes/team-config-routes.js";
import { registerPlayerRoutes } from "../routes/player-routes.js";
import type { RegisterRoutesOptions } from "./register-routes.js";
import type { createAuthSessionBootstrap } from "./auth-session.js";
import type { createOperatorPresenceManager } from "../sockets/operator-presence-manager.js";
import type { createTenantCompositionHelpers } from "./tenant-composition.js";

type EmitFn = (schoolId: string, teamId: string) => void;

export interface RegisterAuthWorkspaceRoutesExtra {
  requireApiKey: RegisterRoutesOptions["requireApiKey"];
  requireWriteRole: RegisterRoutesOptions["requireWriteRole"];
  authRateLimiter: RegisterRoutesOptions["authRateLimiter"];
  getAuthUserFromContext: RegisterRoutesOptions["getAuthUserFromContext"];
  issueWorkspaceInvitation: RegisterRoutesOptions["issueWorkspaceInvitation"];
  BILLING_PAYWALL_ENABLED: boolean;
  EXPOSE_PASSWORD_RESET_TOKEN: boolean;
  ENABLE_LEGACY_LOCAL_AUTH: boolean;
  passwordResetTokens: ReturnType<typeof createAuthSessionBootstrap>["passwordResetTokens"];
  invitationTokens: ReturnType<typeof createAuthSessionBootstrap>["invitationTokens"];
  passwordResetTokenTtlMs: ReturnType<typeof createAuthSessionBootstrap>["passwordResetTokenTtlMs"];
  buildResetPath: ReturnType<typeof createAuthSessionBootstrap>["buildResetPath"];
  buildInvitePath: ReturnType<typeof createAuthSessionBootstrap>["buildInvitePath"];
  pruneExpiredPasswordResetTokens: ReturnType<typeof createAuthSessionBootstrap>["pruneExpiredPasswordResetTokens"];
  pruneExpiredInvitationTokens: ReturnType<typeof createAuthSessionBootstrap>["pruneExpiredInvitationTokens"];
  deliverPasswordResetEmail: ReturnType<typeof createAuthSessionBootstrap>["deliverPasswordResetEmail"];
  issueMemberInvitation: ReturnType<typeof createAuthSessionBootstrap>["issueMemberInvitation"];
  getPrimaryTeam: ReturnType<typeof createTenantCompositionHelpers>["getPrimaryTeam"];
  persistSchoolTeams: ReturnType<typeof createTenantCompositionHelpers>["persistSchoolTeams"];
  upsertPrimaryTeam: ReturnType<typeof createTenantCompositionHelpers>["upsertPrimaryTeam"];
  buildOnboardingProfileView: ReturnType<typeof createTenantCompositionHelpers>["buildOnboardingProfileView"];
  buildOnboardingCompletionSummary: ReturnType<typeof createTenantCompositionHelpers>["buildOnboardingCompletionSummary"];
  buildAuthSessionResponse: ReturnType<typeof createTenantCompositionHelpers>["buildAuthSessionResponse"];
  buildSuggestedCoachIdentity: ReturnType<typeof createTenantCompositionHelpers>["buildSuggestedCoachIdentity"];
  resolveCurrentOrganizationMember: ReturnType<typeof createTenantCompositionHelpers>["resolveCurrentOrganizationMember"];
  ensureAuthenticatedOrganizationMember: ReturnType<typeof createTenantCompositionHelpers>["ensureAuthenticatedOrganizationMember"];
  ensureOwnerMembership: ReturnType<typeof createTenantCompositionHelpers>["ensureOwnerMembership"];
  requireOrganizationManager: ReturnType<typeof createTenantCompositionHelpers>["requireOrganizationManager"];
  normalizeMemberRole: ReturnType<typeof createTenantCompositionHelpers>["normalizeMemberRole"];
  withSuggestedOnboardingIdentity: ReturnType<typeof createTenantCompositionHelpers>["withSuggestedOnboardingIdentity"];
  activateKnownMemberForAccount: ReturnType<typeof createTenantCompositionHelpers>["activateKnownMemberForAccount"];
  setOperatorLinkSetup: ReturnType<typeof createOperatorPresenceManager>["setOperatorLinkSetup"];
  emitTeamDeleted: EmitFn;
}

export function registerAuthAndWorkspaceRoutes(
  app: Express,
  io: Server,
  _opts: RegisterRoutesOptions,
  extra: RegisterAuthWorkspaceRoutesExtra,
): void {
  const {
    requireApiKey, requireWriteRole, authRateLimiter,
    getAuthUserFromContext, issueWorkspaceInvitation,
    BILLING_PAYWALL_ENABLED, EXPOSE_PASSWORD_RESET_TOKEN, ENABLE_LEGACY_LOCAL_AUTH,
    passwordResetTokens, invitationTokens, passwordResetTokenTtlMs,
    buildResetPath, buildInvitePath, pruneExpiredPasswordResetTokens,
    pruneExpiredInvitationTokens, deliverPasswordResetEmail, issueMemberInvitation,
    getPrimaryTeam, persistSchoolTeams, upsertPrimaryTeam,
    buildOnboardingProfileView, buildOnboardingCompletionSummary,
    buildAuthSessionResponse, buildSuggestedCoachIdentity,
    resolveCurrentOrganizationMember, ensureAuthenticatedOrganizationMember,
    ensureOwnerMembership, requireOrganizationManager, normalizeMemberRole,
    withSuggestedOnboardingIdentity, activateKnownMemberForAccount,
    setOperatorLinkSetup, emitTeamDeleted,
  } = extra;

  registerAuthCoreRoutes(app, {
    authRateLimiter,
    resolveRequestSchoolId,
    getSchoolIdFromRequest,
    getAuthContextFromRequest: (req) => (req as ScopedRequest).authContext,
    buildOnboardingCompletionSummary,
    buildSuggestedCoachIdentity,
    resolveCurrentOrganizationMember,
    getLocalAuthAccountByEmail,
    getLocalAuthAccountsByEmailAcrossSchools,
    getSchoolMembershipsByScope,
    saveSchoolMembership,
    getTeamMembershipsByScope,
    saveTeamMembership,
    buildAuthSessionResponse,
    getUserWorkspaceProfile,
    listSchoolMembershipsForUser,
    sanitizeTextField,
    resolveAuthSchoolId,
    pruneExpiredInvitationTokens,
    invitationTokens,
    isValidEmail,
    hashPassword,
    getOrganizationMembersByScope,
    saveLocalAuthAccount,
    activateKnownMemberForAccount,
    shouldSyncPrimaryCoachIdentity,
    saveOnboardingAccountState,
    issueLocalAuthToken,
    buildInvitePath,
    verifyPassword,
    recordLocalAuthLogin,
    pruneExpiredPasswordResetTokens,
    passwordResetTokens,
    generatePasswordResetToken: () => randomBytes(24).toString("hex"),
    passwordResetTokenTtlMs,
    deliverPasswordResetEmail,
    buildResetPath,
    exposePasswordResetToken: EXPOSE_PASSWORD_RESET_TOKEN,
    getLocalAuthAccountsByScope,
    saveOrganizationMember,
    deleteLocalAuthAccount,
    billingGuardBeforeRegister: BILLING_PAYWALL_ENABLED
      ? (schoolId: string) => {
          const state = getBillingStateByScope({ schoolId });
          const active = state?.status === "active" || state?.status === "trialing";
          return active
            ? { allowed: true }
            : { allowed: false, status: 402, error: "Complete checkout before creating your account" };
        }
      : undefined,
    enableLegacyLocalAuth: ENABLE_LEGACY_LOCAL_AUTH,
  });

  registerAuthAccountRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    requireOrganizationManager,
    sanitizeTextField,
    normalizePersonName,
    isValidEmail,
    hashPassword,
    getLocalAuthAccountByEmail,
    saveLocalAuthAccount,
    getRosterTeamsByScope,
    findPlayerRecord,
    saveOrganizationMember,
    persistSchoolTeams,
    generatePassword: () => Math.random().toString(36).slice(-10),
    saveBillingState: saveBillingState as any,
    enableLegacyLocalAuth: ENABLE_LEGACY_LOCAL_AUTH,
  });

  registerWorkspaceRoutes(app, {
    paywallEnabled: BILLING_PAYWALL_ENABLED,
    requireApiKey,
    requireWriteRole,
    getAuthUser: (req) => getAuthUserFromContext((req as ScopedRequest).authContext),
    sanitizeTextField,
    buildUniqueSchoolTeamId,
    normalizeTeamColor,
    getSchoolRecord,
    saveSchoolRecord,
    getUserWorkspaceProfile,
    saveUserWorkspaceProfile,
    getSchoolMembershipsByScope,
    saveSchoolMembership,
    deleteSchoolMembership,
    getTeamMembershipsByScope,
    saveTeamMembership,
    deleteTeamMembership,
    listSchoolMembershipsForUser,
    listTeamMembershipsForUser,
    getRosterTeamsByScope,
    saveRosterTeams,
    getTeamById,
    getActivityEventsByScope,
    saveActivityEvent,
    getLiveGameSessionsByScope,
    createLiveGameSessionRecord,
    getLiveGameSessionById,
    saveOperatorSessionRecord,
    getOperatorSessionByLiveSession,
    issueLocalAuthToken,
    getBillingStateByScope,
    saveBillingState,
    createGame: createGameDurable,
    setOperatorLinkSetup,
    issueWorkspaceInvitation,
    emitTeamDeleted: (schoolId, teamId) => {
      io.to(schoolRoom(schoolId)).emit("team:deleted", { teamId });
    },
  });

  registerOnboardingRoutes(app, {
    requireApiKey,
    requireWriteRole,
    resolveRequestSchoolId,
    getSchoolIdFromRequest,
    getSuggestedCoachIdentity: (req) => buildSuggestedCoachIdentity((req as ScopedRequest).authContext),
    buildOnboardingProfileView,
    getOnboardingAccountStateByScope,
    getPrimaryTeam,
    withSuggestedOnboardingIdentity,
    requireOnboardingIdentity,
    saveOnboardingAccountState,
    buildOnboardingAccountPayload,
    ensureAuthenticatedOrganizationMember,
    ensureOwnerMembership,
    saveOrganizationProfile,
    buildOrganizationProfilePayload,
    buildOrganizationSlug,
    normalizeNameKey,
    buildRosterPlayer,
    upsertPrimaryTeam,
    persistSchoolTeams,
    sanitizeTextField,
    buildTeamAbbreviation,
  });

  registerOrgMembersRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getOnboardingAccountStateByScope,
    ensureAuthenticatedOrganizationMember,
    requireOrganizationManager,
    getOrganizationMembersByScope,
    sanitizeTextField,
    isValidEmail,
    normalizeMemberRole,
    saveOrganizationMember,
    deleteOrganizationMember,
    issueMemberInvitation,
  });

  registerTeamConfigRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getRosterTeamsByScope,
    defaultTeamAiSettings,
    getPrimaryTeam,
    extractTeamAiSettings,
    upsertPrimaryTeam,
    persistSchoolTeams,
    normalizeNameKey,
    buildRosterPlayer,
    buildTeamAbbreviation,
    sanitizeTextField,
  });

  registerPlayerRoutes(app, {
    requireApiKey,
    requireWriteRole,
    getSchoolIdFromRequest,
    getSeasonPlayers,
    getRosterPlayers,
    normalizeNameKey,
    normalizePersonName,
    getPrimaryTeam,
    buildRosterPlayer,
    findPlayerRecord,
    getRosterTeamsByScope,
    persistSchoolTeams,
    sanitizeTextField,
    isValidEmail,
    getOnboardingAccountStateByScope,
    getOrganizationMembersByScope,
    saveOrganizationMember,
    issueMemberInvitation,
  });
}
