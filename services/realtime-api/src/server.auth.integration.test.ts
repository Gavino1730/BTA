import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";

const API_PORT = "4100";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

function collectWarnLogPayloads(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((call) => {
      const raw = call[0];
      if (typeof raw !== "string") {
        return null;
      }
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function collectLogPayloads(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((call) => {
      const raw = call[0];
      if (typeof raw !== "string") {
        return null;
      }
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

async function waitForLog(
  spy: ReturnType<typeof vi.spyOn>,
  predicate: (payload: Record<string, unknown>) => boolean,
  timeoutMs = 500,
): Promise<Record<string, unknown> | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const match = collectLogPayloads(spy).find(predicate);
    if (match) {
      return match;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

describe("server auth integration", () => {
  let startServer: (overridePort?: number) => Promise<number>;
  let stopServer: () => Promise<void>;

  beforeAll(async () => {
    process.env.BTA_AUTH_TEST_MODE = "1";
    process.env.BTA_REQUIRE_TENANT = "1";
    process.env.BTA_JWT_WRITE_REQUIRED = "1";
    process.env.BTA_API_KEY = "rollout-api-key";
    process.env.BTA_LOCAL_AUTH_SECRET = "integration-local-auth-secret";
    process.env.NODE_ENV = "test";
    process.env.PORT = API_PORT;

    vi.resetModules();
    const serverModule = await import("./server.js");
    startServer = serverModule.startServer;
    stopServer = serverModule.stopServer;
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
    delete process.env.BTA_AUTH_TEST_MODE;
    delete process.env.BTA_REQUIRE_TENANT;
    delete process.env.BTA_JWT_WRITE_REQUIRED;
    delete process.env.BTA_API_KEY;
    delete process.env.BTA_LOCAL_AUTH_SECRET;
    delete process.env.PORT;
  });

  it("applies defensive security headers on API responses", async () => {
    const response = await fetch(`${API_BASE}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns a structured JSON error for malformed JSON payloads", async () => {
    const response = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "rollout-api-key",
        "x-school-id": "error-shape-school"
      },
      body: "{\"name\":"
    });

    expect(response.status).toBe(400);
    const body = await response.json() as {
      error?: string;
      code?: string;
      requestId?: string;
    };

    expect(body.error).toBe("Invalid JSON payload");
    expect(body.code).toBe("invalid_json");
    expect(typeof body.requestId).toBe("string");
    expect((body.requestId ?? "").length).toBeGreaterThan(0);
  });

  it("emits structured http.request logs for 4xx error paths", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const requestId = "http-4xx-log-req-1";
      const response = await fetch(`${API_BASE}/api/team`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-school-id": "log-school",
          "x-request-id": requestId,
        },
        body: JSON.stringify({ name: "Denied Team" }),
      });

      expect(response.status).toBe(401);

      const requestLog = collectLogPayloads(logSpy).find((payload) => {
        if (payload.message !== "http.request") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.path === "/api/team" && context?.requestId === requestId;
      });

      expect(requestLog).toBeTruthy();
      const context = (requestLog?.context ?? {}) as Record<string, unknown>;
      expect(context.statusCode).toBe(401);
      expect(context.method).toBe("POST");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("emits structured diagnostics for 5xx unhandled request paths", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const requestId = "http-5xx-log-req-1";
      const response = await fetch(`${API_BASE}/__test/error500`, {
        headers: {
          "x-request-id": requestId,
          "x-school-id": "diag-school",
        },
      });

      expect(response.status).toBe(500);
      const body = await response.json() as {
        error?: string;
        code?: string;
        requestId?: string;
      };
      expect(body.error).toBe("Internal server error");
      expect(body.code).toBe("internal_error");
      expect(typeof body.requestId).toBe("string");
      expect((body.requestId ?? "").length).toBeGreaterThan(0);

      const requestLog = collectLogPayloads(logSpy).find((payload) => {
        if (payload.message !== "http.request") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.path === "/__test/error500" && context?.requestId === requestId;
      });

      expect(requestLog).toBeTruthy();
      const requestContext = (requestLog?.context ?? {}) as Record<string, unknown>;
      expect(requestContext.statusCode).toBe(500);
      expect(requestContext.method).toBe("GET");

      const errorLog = errorSpy.mock.calls
        .map((call) => {
          const raw = call[0];
          if (typeof raw !== "string") {
            return null;
          }
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .find((payload) => {
          if (!payload || payload.message !== "request.unhandled_error") {
            return false;
          }
          const context = payload.context as Record<string, unknown> | undefined;
          return context?.path === "/__test/error500";
        });

      expect(errorLog).toBeTruthy();
      const errorContext = (errorLog?.context ?? {}) as Record<string, unknown>;
      expect(errorContext.status).toBe(500);
      expect(errorContext.code).toBe("internal_error");
      expect(String(errorContext.error ?? "")).toContain("simulated_test_unhandled_error");
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("allows API-key fallback for roster reads when JWT auth is enabled", async () => {
    const response = await fetch(`${API_BASE}/config/roster-teams`, {
      headers: {
        "x-api-key": "rollout-api-key",
        "x-school-id": "rollout-school"
      }
    });

    expect(response.status).toBe(200);
  });

  it("allows tenant-scoped roster reads without credentials when only writes require JWT", async () => {
    const response = await fetch(`${API_BASE}/config/roster-teams`, {
      headers: {
        "x-school-id": "public-read-school"
      }
    });

    expect(response.status).toBe(200);
  });

  it("denies write endpoint for viewer role and allows coach role", async () => {
    const viewerToken = makeTestToken({
      sub: "viewer-user",
      schoolId: "rbac-school",
      role: "viewer"
    });
    const coachToken = makeTestToken({
      sub: "coach-user",
      schoolId: "rbac-school",
      role: "coach"
    });

    const denied = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "rbac-school"
      },
      body: JSON.stringify({ name: "RBAC Team" })
    });

    expect(denied.status).toBe(403);

    const allowed = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${coachToken}`,
        "Content-Type": "application/json",
        "x-school-id": "rbac-school"
      },
      body: JSON.stringify({ name: "RBAC Team" })
    });

    expect(allowed.status).toBe(201);
  });

  it("rejects request when token tenant and requested tenant mismatch", async () => {
    const token = makeTestToken({
      sub: "coach-user",
      schoolId: "alpha",
      role: "coach"
    });

    const response = await fetch(`${API_BASE}/api/teams`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "beta"
      }
    });

    expect(response.status).toBe(403);
  });

  it("emits security telemetry with requestId on HTTP tenant mismatch", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const token = makeTestToken({
        sub: "telemetry-user",
        schoolId: "alpha",
        role: "coach"
      });
      const requestId = "http-telemetry-req-123";

      const response = await fetch(`${API_BASE}/api/teams`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-school-id": "beta",
          "x-request-id": requestId,
        }
      });

      expect(response.status).toBe(403);

      const securityEvent = collectWarnLogPayloads(warnSpy).find((payload) => {
        if (payload.message !== "security.event") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.event === "requestTenantMismatch";
      });

      expect(securityEvent).toBeTruthy();
      const context = (securityEvent?.context ?? {}) as Record<string, unknown>;
      expect(context.requestId).toBe(requestId);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not leak HTTP auth credentials in denial security logs", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const leakedAuthHeader = "Bearer super-secret-http-token";
      const leakedApiKey = "super-secret-http-api-key";

      const response = await fetch(`${API_BASE}/api/team`, {
        method: "POST",
        headers: {
          Authorization: leakedAuthHeader,
          "x-api-key": leakedApiKey,
          "Content-Type": "application/json",
          "x-school-id": "redaction-school",
          "x-request-id": "http-redaction-req-123",
        },
        body: JSON.stringify({ name: "Denied Team" }),
      });

      expect(response.status).toBe(401);

      const rawWarnOutput = warnSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");
      expect(rawWarnOutput).not.toContain(leakedAuthHeader);
      expect(rawWarnOutput).not.toContain(leakedApiKey);

      const securityEvent = collectWarnLogPayloads(warnSpy).find((payload) => {
        if (payload.message !== "security.event") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.event === "unauthorizedHttp";
      });

      expect(securityEvent).toBeTruthy();
      const context = (securityEvent?.context ?? {}) as Record<string, unknown>;
      expect(["missing-valid-credentials", "jwt-write-required"]).toContain(String(context.reason));
      expect(context.requestId).toBe("http-redaction-req-123");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("creates an isolated school workspace when a public user registers without a preset school id", async () => {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: "Public Coach",
        email: "public-coach@example.org",
        password: "supersecure123"
      })
    });

    expect(response.status).toBe(201);
    const body = await response.json() as {
      user?: { schoolId?: string };
      token?: string | null;
    };

    expect(body.user?.schoolId).toBeTruthy();
    expect(body.user?.schoolId).not.toBe("default");
    expect(body.token).toBeTruthy();
  });

  it("restores the auth session from the bearer token without requiring a public default school id", async () => {
    const registerResponse = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: "Session Coach",
        email: "session-coach@example.org",
        password: "supersecure123"
      })
    });

    expect(registerResponse.status).toBe(201);
    const registerBody = await registerResponse.json() as {
      token?: string | null;
      user?: { schoolId?: string } | null;
      onboarding?: { completed?: boolean } | null;
    };

    const sessionResponse = await fetch(`${API_BASE}/api/auth/session`, {
      headers: {
        Authorization: `Bearer ${registerBody.token ?? ""}`
      }
    });

    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json() as {
      authenticated?: boolean;
      user?: { email?: string; schoolId?: string } | null;
      onboarding?: { completed?: boolean } | null;
    };

    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.user?.email).toBe("session-coach@example.org");
    expect(sessionBody.user?.schoolId).toBe(registerBody.user?.schoolId);
    expect(sessionBody.user?.schoolId).not.toBe("default");
    expect(sessionBody.onboarding?.completed).toBe(false);
  });

  it("returns an unauthenticated session payload when no school scope or token is provided", async () => {
    const response = await fetch(`${API_BASE}/api/auth/session`);

    expect(response.status).toBe(200);
    const body = await response.json() as {
      authenticated?: boolean;
      onboarding?: {
        completed?: boolean;
        hasAccount?: boolean;
        hasProfile?: boolean;
        hasTeam?: boolean;
        teamCount?: number;
      };
    };

    expect(body.authenticated).toBe(false);
    expect(body.onboarding?.completed).toBe(false);
    expect(body.onboarding?.hasAccount).toBe(false);
    expect(body.onboarding?.hasProfile).toBe(false);
    expect(body.onboarding?.hasTeam).toBe(false);
    expect(body.onboarding?.teamCount).toBe(0);
  });

  it("returns auth-derived onboarding coach suggestions when no account is saved yet", async () => {
    const token = makeTestToken({
      sub: "setup-coach",
      schoolId: "prefill-school",
      role: "coach",
      email: "coach@school.org",
      name: "Coach Rivera"
    });

    const response = await fetch(`${API_BASE}/api/onboarding/account`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "prefill-school"
      }
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      account: null;
      suggestedCoach?: { coachName?: string; coachEmail?: string };
    };

    expect(body.account).toBeNull();
    expect(body.suggestedCoach?.coachName).toBe("Coach Rivera");
    expect(body.suggestedCoach?.coachEmail).toBe("coach@school.org");
  });

  it("bootstraps the authenticated coach as the owner member and supports invited members", async () => {
    const token = makeTestToken({
      sub: "org-owner-1",
      schoolId: "member-school",
      role: "coach",
      email: "owner@school.org",
      name: "Owner Coach"
    });

    const completeResponse = await fetch(`${API_BASE}/api/onboarding/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-school-id": "member-school"
      },
      body: JSON.stringify({
        organizationName: "Member School Athletics",
        teamName: "Member School",
        season: "2026"
      })
    });

    expect(completeResponse.status).toBe(201);

    const inviteResponse = await fetch(`${API_BASE}/api/org/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-school-id": "member-school"
      },
      body: JSON.stringify({
        fullName: "Assistant Coach",
        email: "assistant@school.org",
        role: "analyst"
      })
    });

    expect(inviteResponse.status).toBe(201);

    const membersResponse = await fetch(`${API_BASE}/api/org/members`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "member-school"
      }
    });

    expect(membersResponse.status).toBe(200);
    const body = await membersResponse.json() as {
      currentMember?: { email: string; role: string; status: string } | null;
      members: Array<{ email: string; role: string; status: string }>;
    };

    expect(body.currentMember?.email).toBe("owner@school.org");
    expect(body.currentMember?.role).toBe("owner");
    expect(body.currentMember?.status).toBe("active");
    expect(body.members.some((member) => member.email === "assistant@school.org" && member.role === "analyst" && member.status === "invited")).toBe(true);
  });

  it("accepts an invited member on first authenticated request by matching email", async () => {
    const ownerToken = makeTestToken({
      sub: "invite-owner-1",
      schoolId: "accept-school",
      role: "coach",
      email: "owner@school.org",
      name: "Owner Coach"
    });

    await fetch(`${API_BASE}/api/onboarding/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "accept-school"
      },
      body: JSON.stringify({
        organizationName: "Accept School Athletics",
        teamName: "Accept School",
        season: "2026"
      })
    });

    const inviteResponse = await fetch(`${API_BASE}/api/org/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "accept-school"
      },
      body: JSON.stringify({
        fullName: "Analyst Dana",
        email: "dana@school.org",
        role: "analyst"
      })
    });

    expect(inviteResponse.status).toBe(201);

    const invitedToken = makeTestToken({
      sub: "analyst-user-1",
      schoolId: "accept-school",
      role: "coach",
      email: "dana@school.org",
      name: "Analyst Dana"
    });

    const membersResponse = await fetch(`${API_BASE}/api/org/members`, {
      headers: {
        Authorization: `Bearer ${invitedToken}`,
        "x-school-id": "accept-school"
      }
    });

    expect(membersResponse.status).toBe(200);
    const body = await membersResponse.json() as {
      currentMember?: { email: string; authSubject?: string; status: string } | null;
      members: Array<{ email: string; authSubject?: string; status: string }>;
    };

    expect(body.currentMember?.email).toBe("dana@school.org");
    expect(body.currentMember?.status).toBe("active");
    expect(body.members.some((member) => member.email === "dana@school.org" && member.authSubject === "analyst-user-1" && member.status === "active")).toBe(true);
  });

  it("allows coach member management and protects the last owner", async () => {
    const ownerToken = makeTestToken({
      sub: "owner-guard-1",
      schoolId: "guard-school",
      role: "coach",
      email: "owner@school.org",
      name: "Owner Guard"
    });

    await fetch(`${API_BASE}/api/onboarding/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "guard-school"
      },
      body: JSON.stringify({
        organizationName: "Guard School Athletics",
        teamName: "Guard School",
        season: "2026"
      })
    });

    const inviteResponse = await fetch(`${API_BASE}/api/org/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "guard-school"
      },
      body: JSON.stringify({
        fullName: "Assistant Coach",
        email: "assistant@school.org",
        role: "coach"
      })
    });

    const invited = await inviteResponse.json() as { member: { memberId: string } };
    const assistantToken = makeTestToken({
      sub: "assistant-guard-1",
      schoolId: "guard-school",
      role: "coach",
      email: "assistant@school.org",
      name: "Assistant Coach"
    });

    await fetch(`${API_BASE}/api/org/members`, {
      headers: {
        Authorization: `Bearer ${assistantToken}`,
        "x-school-id": "guard-school"
      }
    });

    const coachManagedUpdate = await fetch(`${API_BASE}/api/org/members/${invited.member.memberId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${assistantToken}`,
        "Content-Type": "application/json",
        "x-school-id": "guard-school"
      },
      body: JSON.stringify({ role: "owner", fullName: "Assistant Coach" })
    });

    expect(coachManagedUpdate.status).toBe(200);

    const ownerMembersRes = await fetch(`${API_BASE}/api/org/members`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "x-school-id": "guard-school"
      }
    });
    const ownerMembersBody = await ownerMembersRes.json() as {
      members: Array<{ memberId: string; email: string }>;
    };
    const ownerMember = ownerMembersBody.members.find((member) => member.email === "owner@school.org");
    expect(ownerMember).toBeDefined();

    const lastOwnerDemotion = await fetch(`${API_BASE}/api/org/members/${ownerMember?.memberId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "guard-school"
      },
      body: JSON.stringify({ role: "coach", fullName: "Owner Guard" })
    });

    expect(lastOwnerDemotion.status).toBe(200);

    const lastOwnerDemotionAttempt = await fetch(`${API_BASE}/api/org/members/${invited.member.memberId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${assistantToken}`,
        "Content-Type": "application/json",
        "x-school-id": "guard-school"
      },
      body: JSON.stringify({ role: "coach", fullName: "Assistant Coach" })
    });

    expect(lastOwnerDemotionAttempt.status).toBe(400);

    const selfDelete = await fetch(`${API_BASE}/api/org/members/${ownerMember?.memberId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "x-school-id": "guard-school"
      }
    });

    expect(selfDelete.status).toBe(400);
  });

  it("creates coach accounts and supports password reset", async () => {
    const ownerToken = makeTestToken({
      sub: "coach-account-owner-1",
      schoolId: "coach-account-school",
      role: "coach",
      email: "owner@school.org",
      name: "Owner Coach"
    });

    await fetch(`${API_BASE}/api/onboarding/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "coach-account-school"
      },
      body: JSON.stringify({
        organizationName: "Coach Account School Athletics",
        teamName: "Coach Account School",
        season: "2026"
      })
    });

    const createResponse = await fetch(`${API_BASE}/api/auth/coach-account`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "coach-account-school"
      },
      body: JSON.stringify({
        fullName: "Assistant Riley",
        email: "assistant-riley@school.org",
        role: "coach",
        password: "TempPass123!"
      })
    });

    expect(createResponse.status).toBe(201);

    const loginBeforeReset = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": "coach-account-school"
      },
      body: JSON.stringify({
        email: "assistant-riley@school.org",
        password: "TempPass123!"
      })
    });

    expect(loginBeforeReset.status).toBe(200);

    const resetResponse = await fetch(`${API_BASE}/api/auth/coach-account/reset-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "coach-account-school"
      },
      body: JSON.stringify({
        email: "assistant-riley@school.org",
        password: "UpdatedPass123!"
      })
    });

    expect(resetResponse.status).toBe(200);

    const oldPasswordLogin = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": "coach-account-school"
      },
      body: JSON.stringify({
        email: "assistant-riley@school.org",
        password: "TempPass123!"
      })
    });

    expect(oldPasswordLogin.status).toBe(401);

    const updatedPasswordLogin = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": "coach-account-school"
      },
      body: JSON.stringify({
        email: "assistant-riley@school.org",
        password: "UpdatedPass123!"
      })
    });

    expect(updatedPasswordLogin.status).toBe(200);
  });

  it("supports self-service password reset request and confirm flow", async () => {
    const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Reset Flow Coach",
        email: "reset-flow@school.org",
        password: "OldReset123!"
      })
    });

    expect(registerRes.status).toBe(201);
    const registerBody = await registerRes.json() as {
      user?: { schoolId?: string };
    };
    const schoolId = registerBody.user?.schoolId ?? "";
    expect(schoolId).toBeTruthy();

    const requestRes = await fetch(`${API_BASE}/api/auth/password-reset/request`, {
      method: "POST",
      headers: {
        "x-api-key": "rollout-api-key",
        "x-school-id": schoolId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email: "reset-flow@school.org" })
    });

    expect(requestRes.status).toBe(200);
    const requestBody = await requestRes.json() as {
      resetToken?: string;
      resetPath?: string;
      message?: string;
    };
    expect(requestBody.message).toBeTruthy();
    expect(requestBody.resetToken).toBeTruthy();
    expect(requestBody.resetPath).toContain("/reset-password?token=");

    const oldPasswordLogin = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": schoolId
      },
      body: JSON.stringify({ email: "reset-flow@school.org", password: "OldReset123!" })
    });
    expect(oldPasswordLogin.status).toBe(200);

    const confirmRes = await fetch(`${API_BASE}/api/auth/password-reset/confirm`, {
      method: "POST",
      headers: {
        "x-api-key": "rollout-api-key",
        "x-school-id": schoolId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token: requestBody.resetToken, password: "NewReset456!" })
    });

    expect(confirmRes.status).toBe(200);

    const staleTokenRes = await fetch(`${API_BASE}/api/auth/password-reset/confirm`, {
      method: "POST",
      headers: {
        "x-api-key": "rollout-api-key",
        "x-school-id": schoolId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token: requestBody.resetToken, password: "Another789!" })
    });
    expect(staleTokenRes.status).toBe(400);

    const oldLoginAfterReset = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": schoolId
      },
      body: JSON.stringify({ email: "reset-flow@school.org", password: "OldReset123!" })
    });
    expect(oldLoginAfterReset.status).toBe(401);

    const newLoginAfterReset = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": schoolId
      },
      body: JSON.stringify({ email: "reset-flow@school.org", password: "NewReset456!" })
    });
    expect(newLoginAfterReset.status).toBe(200);
  });

  it("exposes prometheus security metrics to authorized write role", async () => {
    const token = makeTestToken({
      sub: "metrics-coach",
      schoolId: "rbac-school",
      role: "coach"
    });

    const response = await fetch(`${API_BASE}/admin/security-metrics/prometheus`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "rbac-school"
      }
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("bta_security_unauthorized_http_total");
    expect(text).toContain("bta_security_forbidden_write_role_total");
    expect(text).toContain("bta_ai_budget_exceeded_total");
    expect(text).toContain("bta_ai_total_estimated_cost_usd");
  });

  it("exposes combined admin metrics including AI alert counters", async () => {
    const token = makeTestToken({
      sub: "metrics-coach-json",
      schoolId: "rbac-school",
      role: "coach"
    });

    const response = await fetch(`${API_BASE}/admin/security-metrics`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": "rbac-school"
      }
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      unauthorizedHttp?: number;
      aiBudgetExceeded?: number;
      aiCostThresholdExceeded?: number;
      aiTokenThresholdExceeded?: number;
      aiTotalTokensUsed?: number;
      aiTotalEstimatedCostUsd?: number;
      aiActiveGames?: number;
    };

    expect(typeof body.unauthorizedHttp).toBe("number");
    expect(typeof body.aiBudgetExceeded).toBe("number");
    expect(typeof body.aiCostThresholdExceeded).toBe("number");
    expect(typeof body.aiTokenThresholdExceeded).toBe("number");
    expect(typeof body.aiTotalTokensUsed).toBe("number");
    expect(typeof body.aiTotalEstimatedCostUsd).toBe("number");
    expect(typeof body.aiActiveGames).toBe("number");
  });

  it("increments security counters for unauthorized and tenant-mismatch denials", async () => {
    const adminToken = makeTestToken({
      sub: "metrics-delta-coach",
      schoolId: "rbac-school",
      role: "coach",
    });

    const readMetrics = async (): Promise<{
      unauthorizedHttp: number;
      requestTenantMismatch: number;
    }> => {
      const response = await fetch(`${API_BASE}/admin/security-metrics`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "x-school-id": "rbac-school",
        },
      });
      expect(response.status).toBe(200);
      const body = await response.json() as {
        unauthorizedHttp?: number;
        requestTenantMismatch?: number;
      };
      return {
        unauthorizedHttp: Number(body.unauthorizedHttp ?? 0),
        requestTenantMismatch: Number(body.requestTenantMismatch ?? 0),
      };
    };

    const before = await readMetrics();

    const unauthorizedRes = await fetch(`${API_BASE}/api/team`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": "rbac-school",
      },
      body: JSON.stringify({ name: "Denied Team" }),
    });
    expect(unauthorizedRes.status).toBe(401);

    const mismatchToken = makeTestToken({
      sub: "metrics-mismatch-user",
      schoolId: "alpha-metrics",
      role: "coach",
    });
    const mismatchRes = await fetch(`${API_BASE}/api/teams`, {
      headers: {
        Authorization: `Bearer ${mismatchToken}`,
        "x-school-id": "beta-metrics",
      },
    });
    expect(mismatchRes.status).toBe(403);

    const after = await readMetrics();
    expect(after.unauthorizedHttp).toBeGreaterThanOrEqual(before.unauthorizedHttp + 1);
    expect(after.requestTenantMismatch).toBeGreaterThanOrEqual(before.requestTenantMismatch + 1);
  });

  it("rejects socket connection on tenant mismatch and allows matching scope", async () => {
    const mismatchToken = makeTestToken({
      sub: "socket-user",
      schoolId: "alpha",
      role: "coach"
    });

    const mismatchError = await new Promise<string>((resolve) => {
      const client: Socket = io(API_BASE, {
        transports: ["websocket"],
        auth: {
          token: mismatchToken,
          schoolId: "beta"
        }
      });

      client.on("connect", () => {
        client.disconnect();
        resolve("unexpected-connect");
      });

      client.on("connect_error", (error) => {
        client.disconnect();
        resolve(String(error.message ?? ""));
      });
    });

    expect(mismatchError.toLowerCase()).toContain("mismatch");

    const okToken = makeTestToken({
      sub: "socket-user-ok",
      schoolId: "alpha",
      role: "coach"
    });

    const connected = await new Promise<boolean>((resolve) => {
      const client: Socket = io(API_BASE, {
        transports: ["websocket"],
        auth: {
          token: okToken,
          schoolId: "alpha"
        }
      });

      client.on("connect", () => {
        client.disconnect();
        resolve(true);
      });

      client.on("connect_error", () => {
        client.disconnect();
        resolve(false);
      });
    });

    expect(connected).toBe(true);
  });

  it("emits socket.connected log with correlated requestId", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const token = makeTestToken({
        sub: "socket-log-user",
        schoolId: "socket-log-school",
        role: "coach"
      });
      const requestId = "socket-connect-req-123";

      const connected = await new Promise<boolean>((resolve) => {
        const client: Socket = io(API_BASE, {
          transports: ["websocket"],
          auth: {
            token,
            schoolId: "socket-log-school",
            requestId,
          }
        });

        client.on("connect", () => {
          client.disconnect();
          resolve(true);
        });

        client.on("connect_error", () => {
          client.disconnect();
          resolve(false);
        });
      });

      expect(connected).toBe(true);

      const socketConnectedLog = collectLogPayloads(logSpy).find((payload) => {
        if (payload.message !== "socket.connected") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.requestId === requestId && context?.schoolId === "socket-log-school";
      });

      expect(socketConnectedLog).toBeTruthy();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("emits socket.disconnected log with correlated requestId", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const token = makeTestToken({
        sub: "socket-disconnect-user",
        schoolId: "socket-disconnect-school",
        role: "coach"
      });
      const requestId = "socket-disconnect-req-123";

      const disconnected = await new Promise<boolean>((resolve) => {
        const client: Socket = io(API_BASE, {
          transports: ["websocket"],
          auth: {
            token,
            schoolId: "socket-disconnect-school",
            requestId,
          }
        });

        client.on("connect", () => {
          client.disconnect();
        });

        client.on("disconnect", () => {
          resolve(true);
        });

        client.on("connect_error", () => {
          client.disconnect();
          resolve(false);
        });
      });

      expect(disconnected).toBe(true);

      const disconnectedLog = await waitForLog(logSpy, (payload) => {
        if (payload.message !== "socket.disconnected") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.requestId === requestId && context?.schoolId === "socket-disconnect-school";
      });

      expect(disconnectedLog).toBeTruthy();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("emits security telemetry with requestId on unauthorized socket auth", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const requestId = "socket-telemetry-req-123";

      const connectError = await new Promise<string>((resolve) => {
        const client: Socket = io(API_BASE, {
          transports: ["websocket"],
          auth: {
            schoolId: "socket-school",
          },
          extraHeaders: {
            "x-request-id": requestId,
          },
        });

        client.on("connect", () => {
          client.disconnect();
          resolve("unexpected-connect");
        });

        client.on("connect_error", (error) => {
          client.disconnect();
          resolve(String(error.message ?? ""));
        });
      });

      expect(connectError.toLowerCase()).toContain("unauthorized");

      const securityEvent = collectWarnLogPayloads(warnSpy).find((payload) => {
        if (payload.message !== "security.event") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.event === "unauthorizedSocket";
      });

      expect(securityEvent).toBeTruthy();
      const context = (securityEvent?.context ?? {}) as Record<string, unknown>;
      expect(context.requestId).toBe(requestId);
      expect(context.reason).toBe("missing-valid-credentials");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not leak socket auth credentials in security logs", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const leakedToken = "Bearer very-secret-token";
      const leakedApiKey = "super-secret-api-key";

      const connectError = await new Promise<string>((resolve) => {
        const client: Socket = io(API_BASE, {
          transports: ["websocket"],
          auth: {
            schoolId: "socket-school",
            token: leakedToken,
            apiKey: leakedApiKey,
          },
          extraHeaders: {
            Authorization: leakedToken,
            "x-api-key": leakedApiKey,
          },
        });

        client.on("connect", () => {
          client.disconnect();
          resolve("unexpected-connect");
        });

        client.on("connect_error", (error) => {
          client.disconnect();
          resolve(String(error.message ?? ""));
        });
      });

      expect(connectError.toLowerCase()).toContain("unauthorized");

      const rawWarnOutput = warnSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");
      expect(rawWarnOutput).not.toContain(leakedToken);
      expect(rawWarnOutput).not.toContain(leakedApiKey);

      const securityEvent = collectWarnLogPayloads(warnSpy).find((payload) => {
        if (payload.message !== "security.event") {
          return false;
        }
        const context = payload.context as Record<string, unknown> | undefined;
        return context?.event === "unauthorizedSocket";
      });

      expect(securityEvent).toBeTruthy();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("blocks player role from mutation endpoints (write-role enforcement)", async () => {
    const playerToken = makeTestToken({
      sub: "player-user-1",
      schoolId: "player-school",
      role: "player"
    });

    const res = await fetch(`${API_BASE}/api/games`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${playerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "player-school"
      },
      body: JSON.stringify({ gameId: "player-block-game", homeTeamId: "home", awayTeamId: "away" })
    });

    expect(res.status).toBe(403);

    const eventRes = await fetch(`${API_BASE}/api/games/player-block-game/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${playerToken}`,
        "Content-Type": "application/json",
        "x-school-id": "player-school"
      },
      body: JSON.stringify({ id: "e1", type: "rebound", playerId: "p1", offensive: false })
    });

    expect(eventRes.status).toBe(403);
  });

  it("allows operator-link tokens to create games when write auth is required", async () => {
    const schoolId = "operator-write-school";
    const connectionId = "operator-write-123";

    const publishRes = await fetch(`${API_BASE}/api/operator-links/${connectionId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "rollout-api-key",
        "x-school-id": schoolId,
      },
      body: JSON.stringify({
        gameId: "operator-write-game",
        myTeamId: "vc-varsity",
        myTeamName: "VC Varsity",
        opponentName: "Opponent",
        vcSide: "home",
      }),
    });
    expect(publishRes.status).toBe(200);

    const linkRes = await fetch(`${API_BASE}/api/operator-links/${connectionId}`, {
      headers: {
        "x-school-id": schoolId,
      },
    });
    expect(linkRes.status).toBe(200);

    const linkPayload = await linkRes.json() as { operatorToken?: string };
    expect(linkPayload.operatorToken).toBeTruthy();

    const createRes = await fetch(`${API_BASE}/api/games`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${linkPayload.operatorToken}`,
        "Content-Type": "application/json",
        "x-school-id": schoolId,
      },
      body: JSON.stringify({
        gameId: "operator-write-game",
        homeTeamId: "vc-varsity",
        awayTeamId: "opp-team",
      }),
    });

    expect(createRes.status).toBe(201);
  });

  it("allows self-service profile update and enforces current-password check on credential change", async () => {
    const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Self Update Coach",
        email: "self-update@school.org",
        password: "OldPass123!"
      })
    });

    expect(registerRes.status).toBe(201);
    const { token } = await registerRes.json() as { token: string };

    // Wrong current password is rejected
    const wrongPassRes = await fetch(`${API_BASE}/api/auth/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ currentPassword: "WrongPass!", newPassword: "Another123!" })
    });

    expect(wrongPassRes.status).toBe(401);

    // Correct current password is accepted
    const correctPassRes = await fetch(`${API_BASE}/api/auth/me`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentPassword: "OldPass123!",
        newPassword: "NewPass456!",
        profilePhotoDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sVhM0sAAAAASUVORK5CYII=",
      })
    });

    expect(correctPassRes.status).toBe(200);
    const updateBody = await correctPassRes.json() as {
      user?: { profilePhotoDataUrl?: string | null } | null;
    };
    expect(updateBody.user?.profilePhotoDataUrl).toContain("data:image/png;base64,");

    // New password works at login
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "self-update@school.org", password: "NewPass456!" })
    });

    expect(loginRes.status).toBe(200);
  });

  it("revokes prior local tokens when signing out all sessions", async () => {
    const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Revoke Coach",
        email: "revoke-all@school.org",
        password: "RevokePass123!"
      })
    });

    expect(registerRes.status).toBe(201);
    const registerBody = await registerRes.json() as {
      token?: string;
      user?: { schoolId?: string };
    };
    const token = registerBody.token ?? "";
    const schoolId = registerBody.user?.schoolId ?? "";
    expect(token).toBeTruthy();
    expect(schoolId).toBeTruthy();

    const revokeRes = await fetch(`${API_BASE}/api/auth/logout-all`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "x-api-key": "rollout-api-key"
      },
    });
    expect(revokeRes.status).toBe(204);

    const staleProfileRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
      },
    });
    expect(staleProfileRes.status).toBe(401);

    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": schoolId,
      },
      body: JSON.stringify({
        email: "revoke-all@school.org",
        password: "RevokePass123!",
      }),
    });
    expect(loginRes.status).toBe(200);
  });

  it("supports self-service account deletion with password confirmation", async () => {
    const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Delete Coach",
        email: "delete-me@school.org",
        password: "DeletePass123!"
      })
    });

    expect(registerRes.status).toBe(201);
    const registerBody = await registerRes.json() as {
      token?: string;
      user?: { schoolId?: string };
    };
    const token = registerBody.token ?? "";
    const schoolId = registerBody.user?.schoolId ?? "";
    expect(token).toBeTruthy();
    expect(schoolId).toBeTruthy();

    const deleteRes = await fetch(`${API_BASE}/api/auth/me`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-school-id": schoolId,
        "x-api-key": "rollout-api-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "DeletePass123!",
        confirmation: "DELETE",
      }),
    });
    expect(deleteRes.status).toBe(204);

    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-school-id": schoolId,
      },
      body: JSON.stringify({
        email: "delete-me@school.org",
        password: "DeletePass123!",
      }),
    });
    expect(loginRes.status).toBe(401);
  });
});
