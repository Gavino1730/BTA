import { afterEach, describe, expect, it, vi } from "vitest";
import { apiKeyHeader, fetchOperatorLinkSnapshot, operatorLinkHeaders } from "./network.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("operator link headers", () => {
  it("omits bearer tokens when recovering auth from the coach link", () => {
    expect(operatorLinkHeaders({ schoolId: "varsity-high", })).toEqual({
      Accept: "application/json",
      "x-school-id": "varsity-high",
    });
  });

  it("keeps bearer tokens on normal authenticated API requests", () => {
    expect(apiKeyHeader({ apiKey: "bta.local-token", schoolId: "varsity-high" })).toEqual({
      Authorization: "Bearer bta.local-token",
      "x-school-id": "varsity-high",
    });
  });
});

describe("fetchOperatorLinkSnapshot", () => {
  it("falls back to unscoped lookup when scoped school lookup fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ schoolId: "varsity-high", operatorToken: "bta.new-token" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOperatorLinkSnapshot({
      apiUrl: "https://api.example.com",
      connectionId: "Conn-001",
      schoolId: "stale-school",
    });

    expect(result?.connectionId).toBe("conn-001");
    expect(result?.payload.schoolId).toBe("varsity-high");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when no connection id is provided", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOperatorLinkSnapshot({
      apiUrl: "https://api.example.com",
      schoolId: "varsity-high",
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});