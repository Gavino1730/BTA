import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useWakeLock } from "./useWakeLock.js";

function WakeLockHarness({ active }: { active: boolean }) {
  useWakeLock(active);
  return null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "wakeLock", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe("useWakeLock", () => {
  it("logs a warning when wake lock release fails during cleanup", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const release = vi.fn().mockRejectedValue(new Error("release failed"));
    const request = vi.fn().mockResolvedValue({ release });

    Object.defineProperty(navigator, "wakeLock", {
      value: { request },
      configurable: true,
      writable: true,
    });

    const { unmount } = render(<WakeLockHarness active />);
    await Promise.resolve();

    unmount();
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith("screen");
    expect(release).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[ipad-operator] wake lock release failed",
      "release failed"
    );
  });
});
