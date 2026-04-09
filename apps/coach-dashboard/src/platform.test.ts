import { describe, expect, it } from "vitest";
import { decodeTokenExpiryMs } from "./platform.js";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("decodeTokenExpiryMs", () => {
  it("reads exp from local bta token payload", () => {
    const exp = 1_900_000_000;
    const payload = toBase64Url(JSON.stringify({ exp, schoolId: "valley-catholic" }));
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
