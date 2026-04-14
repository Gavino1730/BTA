import { useEffect } from "react";

function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

/**
 * Requests a screen wake lock while `active` is true, reacquiring after
 * visibility changes (e.g. iPad Safari tab switch). Releases on cleanup or
 * when `active` becomes false.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;

    async function acquire() {
      try {
        lock = await (
          navigator as Navigator & { wakeLock: { request(type: string): Promise<WakeLockSentinel> } }
        ).wakeLock.request("screen");
      } catch { /* device may not support it */ }
    }

    void acquire();

    function reacquire() {
      if (document.visibilityState === "visible") void acquire();
    }
    document.addEventListener("visibilitychange", reacquire);

    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      lock?.release().catch((error) => {
        console.warn("[ipad-operator] wake lock release failed", summarizeError(error));
      });
    };
  }, [active]);
}
