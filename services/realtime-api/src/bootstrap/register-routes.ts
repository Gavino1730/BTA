import type { Express, RequestHandler, Request } from "express";
import type { Server } from "socket.io";
import {
  getGameState,
  getGameInsights,
  isGameSubmitted,
  patchGameLineup,
  refreshGameAiInsights,
} from "../store.js";
import {
  type ScopedRequest,
  schoolRoom,
  gameRoom,
  deviceRoom,
  connectionRoom,
  getSchoolIdFromSocket,
} from "../helpers/tenant-helpers.js";
import { isJwtAuthEnabled, type AuthContext } from "../auth.js";
import { hasWriteRole } from "../tenant-guards.js";
import { registerRealtimeConnectionHandlers } from "../sockets/realtime-connection.js";
import { registerAuthAndWorkspaceRoutes } from "./register-auth-workspace-routes.js";
import { registerGameAndInsightsRoutes } from "./register-game-insights-routes.js";
import { registerBillingAndAdminRoutes } from "./register-billing-admin-routes.js";
import type { createAuthSessionBootstrap } from "./auth-session.js";
import type { createOperatorPresenceManager } from "../sockets/operator-presence-manager.js";
import type { createGameBroadcastManager } from "../sockets/game-broadcast-manager.js";
import type { createTenantCompositionHelpers } from "./tenant-composition.js";
import type { EmailDeliveryResult } from "../email.js";

type AuthSessionBootstrap = ReturnType<typeof createAuthSessionBootstrap>;
type OperatorPresenceManager = ReturnType<typeof createOperatorPresenceManager>;
type GameBroadcastManager = ReturnType<typeof createGameBroadcastManager>;
type TenantCompositionHelpers = ReturnType<typeof createTenantCompositionHelpers>;

export type RegisterRoutesOptions = AuthSessionBootstrap
  & OperatorPresenceManager
  & GameBroadcastManager
  & TenantCompositionHelpers
  & {
    requireApiKey: RequestHandler;
    requireWriteRole: RequestHandler;
    authRateLimiter: RequestHandler;
    eventRateLimiter: RequestHandler;
    getAuthUserFromContext: (authContext: AuthContext | undefined) => { userId?: string; email?: string; fullName?: string };
    issueWorkspaceInvitation: (req: Request, input: {
      schoolId: string;
      membershipId: string;
      email: string;
      fullName: string;
      roleLabel: string;
    }) => Promise<{
      inviteToken?: string;
      invitePath: string;
      emailDelivery: EmailDeliveryResult;
      warning?: string;
    }>;
    resolveCoachRedirectOrigin: (req: Request) => string;
    API_KEY: string | undefined;
    WRITE_API_KEY: string | undefined;
    JWT_WRITE_REQUIRED: boolean;
    BILLING_PAYWALL_ENABLED: boolean;
    BILLING_STRIPE_TEST_MODE: boolean;
    BILLING_STRIPE_SECRET_KEY: string | undefined;
    BILLING_STRIPE_WEBHOOK_SECRET: string | undefined;
    BILLING_STRIPE_PRICE_ID_MONTHLY: string | undefined;
    BILLING_STRIPE_PRICE_ID_YEARLY: string | undefined;
    EXPOSE_PASSWORD_RESET_TOKEN: boolean;
    ENABLE_LEGACY_LOCAL_AUTH: boolean;
  };

export function registerAllRoutes(
  app: Express,
  io: Server,
  opts: RegisterRoutesOptions,
): void {
  const {
    requireApiKey,
    requireWriteRole,
    authRateLimiter,
    eventRateLimiter,
    getAuthUserFromContext,
    issueWorkspaceInvitation,
    resolveCoachRedirectOrigin,
    API_KEY,
    WRITE_API_KEY,
    JWT_WRITE_REQUIRED,
    BILLING_PAYWALL_ENABLED,
    BILLING_STRIPE_TEST_MODE,
    BILLING_STRIPE_SECRET_KEY,
    BILLING_STRIPE_WEBHOOK_SECRET,
    BILLING_STRIPE_PRICE_ID_MONTHLY,
    BILLING_STRIPE_PRICE_ID_YEARLY,
    EXPOSE_PASSWORD_RESET_TOKEN,
    ENABLE_LEGACY_LOCAL_AUTH,
    // auth session bootstrap
    passwordResetTokens,
    invitationTokens,
    passwordResetTokenTtlMs,
    buildResetPath,
    buildInvitePath,
    pruneExpiredPasswordResetTokens,
    pruneExpiredInvitationTokens,
    deliverPasswordResetEmail,
    issueMemberInvitation,
    // operator presence manager
    operatorPresenceBySocketId,
    operatorPresenceByDeviceId,
    normalizeConnectionKey,
    listSchoolIdsForConnection,
    getOperatorsByConnectionId,
    refreshOperatorConnectionIndex,
    buildConnectionPresencePayload,
    getOperatorLinkSetup,
    setOperatorLinkSetup,
    getLatestOperatorLinkSetup,
    clearOperatorLinksForSchool,
    emitPresenceForDevice,
    emitPresenceForConnection,
    // game broadcast manager
    emitToGameRooms,
    broadcastGameStateWithDebounce,
    // tenant composition helpers
    getPrimaryTeam,
    persistSchoolTeams,
    upsertPrimaryTeam,
    buildOnboardingProfileView,
    buildOnboardingCompletionSummary,
    buildAuthSessionResponse,
    buildSuggestedCoachIdentity,
    resolveCurrentOrganizationMember,
    ensureAuthenticatedOrganizationMember,
    ensureOwnerMembership,
    requireOrganizationManager,
    normalizeMemberRole,
    withSuggestedOnboardingIdentity,
    activateKnownMemberForAccount,
  } = opts;

  async function refreshAndBroadcastInsights(schoolId: string, gameId: string): Promise<void> {
    const insights = await refreshGameAiInsights(gameId, undefined, { schoolId });
    if (insights) {
      emitToGameRooms(schoolId, gameId, "game:insights", insights);
    }
  }

  registerAuthAndWorkspaceRoutes(app, io, opts, {
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
    setOperatorLinkSetup,
    emitTeamDeleted: (schoolId: string, teamId: string) => { io.to(schoolRoom(schoolId)).emit("team:deleted", { teamId }); },
  });

  registerGameAndInsightsRoutes(app, io, opts, {
    requireApiKey, requireWriteRole, eventRateLimiter,
    BILLING_PAYWALL_ENABLED,
    emitToGameRooms, broadcastGameStateWithDebounce, refreshAndBroadcastInsights,
    normalizeConnectionKey, setOperatorLinkSetup, getOperatorLinkSetup,
    getLatestOperatorLinkSetup, listSchoolIdsForConnection,
  });

  registerRealtimeConnectionHandlers(io, {
    getSchoolIdFromSocket,
    schoolRoom,
    normalizeConnectionKey,
    apiKey: API_KEY,
    writeApiKey: WRITE_API_KEY,
    isJwtAuthEnabled,
    jwtWriteRequired: JWT_WRITE_REQUIRED,
    hasWriteRole,
    getOperatorsByConnectionId,
    operatorPresenceBySocketId,
    operatorPresenceByDeviceId,
    refreshOperatorConnectionIndex,
    gameRoom,
    deviceRoom,
    emitPresenceForDevice,
    connectionRoom,
    emitPresenceForConnection,
    patchGameLineup,
    emitToGameRooms,
    isGameSubmitted,
    getGameState,
    getGameInsights,
    refreshAndBroadcastInsights,
    buildConnectionPresencePayload,
  });

  registerBillingAndAdminRoutes(app, opts, {
    requireApiKey, requireWriteRole,
    BILLING_PAYWALL_ENABLED, BILLING_STRIPE_TEST_MODE,
    BILLING_STRIPE_SECRET_KEY, BILLING_STRIPE_WEBHOOK_SECRET,
    BILLING_STRIPE_PRICE_ID_MONTHLY, BILLING_STRIPE_PRICE_ID_YEARLY,
    resolveCoachRedirectOrigin,
    clearOperatorLinksForSchool,
  });
}

