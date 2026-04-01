import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";

const API_PORT = "4100";
const API_BASE = `http://localhost:${API_PORT}`;

function makeTestToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `test.${encoded}`;
}

describe("server auth integration", () => {
  let startServer: (() => Promise<void>) | undefined;
  let stopServer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    process.env.BTA_AUTH_TEST_MODE = "1";
    process.env.BTA_REQUIRE_TENANT = "1";
    process.env.BTA_JWT_WRITE_REQUIRED = "1";
    process.env.BTA_API_KEY = "rollout-api-key";
    process.env.NODE_ENV = "test";
    process.env.PORT = API_PORT;

    vi.resetModules();
    const serverModule = await import("./server.js");
    startServer = serverModule.startServer;
    stopServer = serverModule.stopServer;
    await startServer();
  });

  afterAll(async () => {
    if (stopServer) {
      await stopServer();
    }
    delete process.env.BTA_AUTH_TEST_MODE;
    delete process.env.BTA_REQUIRE_TENANT;
    delete process.env.BTA_JWT_WRITE_REQUIRED;
    delete process.env.BTA_API_KEY;
    delete process.env.PORT;
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

  it("restricts member management to org owners and protects the last owner", async () => {
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

    const forbiddenUpdate = await fetch(`${API_BASE}/api/org/members/${invited.member.memberId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${assistantToken}`,
        "Content-Type": "application/json",
        "x-school-id": "guard-school"
      },
      body: JSON.stringify({ role: "owner", fullName: "Assistant Coach" })
    });

    expect(forbiddenUpdate.status).toBe(403);

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

    expect(lastOwnerDemotion.status).toBe(400);

    const selfDelete = await fetch(`${API_BASE}/api/org/members/${ownerMember?.memberId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "x-school-id": "guard-school"
      }
    });

    expect(selfDelete.status).toBe(400);
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
});
