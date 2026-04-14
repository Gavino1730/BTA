import { afterEach, describe, expect, it, vi } from "vitest";
import { redirectToBillingIfRequired } from "./platform.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redirectToBillingIfRequired", () => {
  it("returns false for non-402 responses", async () => {
    const response = new Response(JSON.stringify({ code: "billing_required" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const redirected = await redirectToBillingIfRequired(response);

    expect(redirected).toBe(false);
  });

  it("returns false for 402 responses without billing_required code", async () => {
    const response = new Response(JSON.stringify({ code: "other_error" }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });

    const redirected = await redirectToBillingIfRequired(response);

    expect(redirected).toBe(false);
  });

  it("redirects to /billing for 402 billing_required responses", async () => {
    const replaceState = vi.fn();
    const dispatchEvent = vi.fn();

    vi.stubGlobal("PopStateEvent", class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    });

    vi.stubGlobal("window", {
      history: {
        replaceState,
      },
      dispatchEvent,
    });

    const response = new Response(JSON.stringify({ code: "billing_required" }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });

    const redirected = await redirectToBillingIfRequired(response);

    expect(redirected).toBe(true);
    expect(replaceState).toHaveBeenCalledWith({}, "", "/billing");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
