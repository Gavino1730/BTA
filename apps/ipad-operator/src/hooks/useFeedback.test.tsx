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
});
