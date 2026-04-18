import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useFeedback } from "./useFeedback.js";

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {} as AudioDestinationNode;

  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => {
    throw new Error("close failed");
  });

  createOscillator() {
    return {
      type: "triangle",
      frequency: {
        value: 0,
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createGain() {
    return {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }
}

function FeedbackHarness({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useFeedback>) => void;
}) {
  const api = useFeedback();
  onReady(api);
  return null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, "AudioContext", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe("useFeedback", () => {
  it("logs a warning when AudioContext close fails during cleanup", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    Object.defineProperty(window, "AudioContext", {
      value: FakeAudioContext,
      configurable: true,
      writable: true,
    });

    let hookApi: ReturnType<typeof useFeedback> | null = null;
    const { unmount } = render(<FeedbackHarness onReady={(api) => { hookApi = api; }} />);

    await hookApi?.unlockFeedbackAudio();
    unmount();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      "[ipad-operator] closing AudioContext failed",
      "close failed"
    );
  });

  it("re-attempts unlock when AudioContext is suspended after a prior unlock", async () => {
    // Simulates iOS suspending the context after the app is backgrounded.
    const ctx = new FakeAudioContext();
    ctx.close = vi.fn(async () => undefined); // suppress close-fail warning
    ctx.state = "running" as AudioContextState;

    const Ctor = vi.fn(() => ctx);
    Object.defineProperty(window, "AudioContext", {
      value: Ctor,
      configurable: true,
      writable: true,
    });

    let hookApi: ReturnType<typeof useFeedback> | null = null;
    const { unmount } = render(<FeedbackHarness onReady={(api) => { hookApi = api; }} />);

    // First unlock succeeds
    await hookApi!.unlockFeedbackAudio();

    // iOS suspends the context (e.g. app backgrounded)
    ctx.state = "suspended" as AudioContextState;
    ctx.resume = vi.fn(async () => {
      ctx.state = "running" as AudioContextState;
    });

    // triggerFeedback should detect ctx.state !== "running" and call resume
    hookApi!.triggerFeedback("confirm");
    await Promise.resolve();

    expect(ctx.resume).toHaveBeenCalled();
    unmount();
  });

  it("resets unlock state on visibilitychange so next gesture re-unlocks", async () => {
    const ctx = new FakeAudioContext();
    ctx.close = vi.fn(async () => undefined);
    // After resume, context goes back to running
    ctx.resume = vi.fn(async () => {
      ctx.state = "running" as AudioContextState;
    });

    const Ctor = vi.fn(() => ctx);
    Object.defineProperty(window, "AudioContext", {
      value: Ctor,
      configurable: true,
      writable: true,
    });

    let hookApi: ReturnType<typeof useFeedback> | null = null;
    const { unmount } = render(<FeedbackHarness onReady={(api) => { hookApi = api; }} />);

    // Unlock initially
    await hookApi!.unlockFeedbackAudio();

    // Simulate iOS suspending then app becoming visible again (no user gesture)
    ctx.state = "suspended" as AudioContextState;
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    // After visibilitychange the context state is back to running via resume attempt
    // triggerFeedback should work again on next tap (resume was called)
    expect(ctx.resume).toHaveBeenCalled();
    unmount();
  });
});
