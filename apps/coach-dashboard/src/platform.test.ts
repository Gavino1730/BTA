import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTH_SESSION_KEY, clearAuthSession, decodeTokenExpiryMs, readStoredAuthSession, storeAuthSession, type StoredAuthSession } from "./platform.js";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function installBrowserEnvironment() {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const cookieJar = new Map<string, string>();

  const windowMock = {
    localStorage,
    sessionStorage,
    location: {
      protocol: "https:",
      hostname: "dashboard.btaintel.com",
      origin: "https://dashboard.btaintel.com",
    },
  } as unknown as Window & typeof globalThis;

  const documentMock = {
    get cookie(): string {
      return Array.from(cookieJar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(value: string) {
      const [pair, ...attrs] = value.split(";");
      const separatorIndex = pair.indexOf("=");
      const name = separatorIndex >= 0 ? pair.slice(0, separatorIndex).trim() : pair.trim();
      const rawValue = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : "";
      const expiresAttr = attrs.find((entry) => entry.trim().toLowerCase().startsWith("expires="));
      if (expiresAttr) {
        const expiresValue = expiresAttr.trim().slice("expires=".length);
        if (Date.parse(expiresValue) <= Date.now()) {
          cookieJar.delete(name);
          return;
        }
      }
      cookieJar.set(name, rawValue);
    },
  } as unknown as Document;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock,
  });

  return { cookieJar, localStorage, sessionStorage };
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

function restoreGlobalProperty(property: "window" | "document", descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(globalThis, property, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, property);
}

let browserEnv: ReturnType<typeof installBrowserEnvironment>;

beforeEach(() => {
  browserEnv = installBrowserEnvironment();
});

afterEach(() => {
  restoreGlobalProperty("window", originalWindowDescriptor);
  restoreGlobalProperty("document", originalDocumentDescriptor);
});

function createSession(overrides: Partial<StoredAuthSession> = {}): StoredAuthSession {
  return {
    token: "bta.token.signature",
    email: "coach@program.org",
    fullName: "Coach Example",
    role: "coach",
    schoolId: "demo-school",
    lastLoginAtIso: null,
    ...overrides,
  };
}

describe("decodeTokenExpiryMs", () => {
  it("reads exp from local bta token payload", () => {
    const exp = 1_900_000_000;
    const payload = toBase64Url(JSON.stringify({ exp, schoolId: "demo-school" }));
    const token = `bta.${payload}.signature`;
    expect(decodeTokenExpiryMs(token)).toBe(exp * 1000);
  });

  it("reads exp from JWT payload", () => {
    const exp = 1_900_000_500;
    const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = toBase64Url(JSON.stringify({ sub: "coach-1", exp }));
    const token = `${header}.${payload}.sig`;
    expect(decodeTokenExpiryMs(token)).toBe(exp * 1000);
  });

  it("returns null for malformed or exp-less tokens", () => {
    const noExpPayload = toBase64Url(JSON.stringify({ sub: "coach-1" }));
    expect(decodeTokenExpiryMs(`bta.${noExpPayload}.sig`)).toBeNull();
    expect(decodeTokenExpiryMs("not-a-token")).toBeNull();
    expect(decodeTokenExpiryMs(undefined)).toBeNull();
  });
});

describe("auth session persistence", () => {
  it("stores non-remembered sessions in sessionStorage only", () => {
    const session = createSession();

    storeAuthSession(session, { persistence: "session" });

    expect(browserEnv.sessionStorage.getItem(AUTH_SESSION_KEY)).toContain(session.token);
    expect(browserEnv.localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(browserEnv.cookieJar.size).toBe(0);
    expect(readStoredAuthSession()).toEqual(session);
  });

  it("stores remembered sessions in localStorage and cookie fallback", () => {
    const session = createSession({ token: "remembered-token" });

    storeAuthSession(session, { persistence: "local" });

    expect(browserEnv.localStorage.getItem(AUTH_SESSION_KEY)).toContain(session.token);
    expect(browserEnv.sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(browserEnv.cookieJar.get("bta_coach_auth")).toBeTruthy();
    expect(readStoredAuthSession()).toEqual(session);
  });

  it("preserves the existing session-only persistence on later token refreshes", () => {
    storeAuthSession(createSession({ token: "session-token" }), { persistence: "session" });

    storeAuthSession(createSession({ token: "refreshed-token" }));

    expect(browserEnv.sessionStorage.getItem(AUTH_SESSION_KEY)).toContain("refreshed-token");
    expect(browserEnv.localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(browserEnv.cookieJar.size).toBe(0);
  });

  it("clears remembered and session-only auth state together", () => {
    storeAuthSession(createSession({ token: "remembered-token" }), { persistence: "local" });
    storeAuthSession(createSession({ token: "session-token" }), { persistence: "session" });

    clearAuthSession();

    expect(browserEnv.localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(browserEnv.sessionStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(browserEnv.cookieJar.size).toBe(0);
    expect(readStoredAuthSession()).toBeNull();
  });
});
