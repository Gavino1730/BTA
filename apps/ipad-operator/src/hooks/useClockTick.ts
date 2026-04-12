import { useEffect, useRef } from "react";
import { clockToSec, formatClockFromSeconds } from "../helpers/clock.js";

/**
 * Drives the game clock countdown while `running` is true and the game is live.
 * Switches to 0.1 s ticks under 60 s. Stops the clock and zeros it when it
 * reaches 0. No-ops when the clock or game phase is disabled.
 */
export function useClockTick(opts: {
  gamePhase: string;
  clockRunning: boolean;
  clockEnabled: boolean;
  trackClock: boolean;
  clockInput: string;
  setClockInput: React.Dispatch<React.SetStateAction<string>>;
  setClockRunning: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { gamePhase, clockRunning, clockEnabled, trackClock, clockInput, setClockInput, setClockRunning } = opts;
  const clockInputRef = useRef(clockInput);
  const lastTickValueRef = useRef<string>(clockInput);

  useEffect(() => {
    clockInputRef.current = clockInput;
  }, [clockInput]);

  // Main countdown tick (elapsed-time based to avoid interval drift)
  useEffect(() => {
    if (gamePhase !== "live" || !clockRunning || !clockEnabled || !trackClock) return;

    let endAtMs = performance.now() + (clockToSec(clockInputRef.current) * 1000);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      let remainingSec = Math.max(0, (endAtMs - now) / 1000);

      // If the operator edits the clock while running, re-anchor to that value.
      const observedClock = clockInputRef.current;
      if (observedClock !== lastTickValueRef.current) {
        const observedSec = Math.max(0, clockToSec(observedClock));
        if (Math.abs(observedSec - remainingSec) > 0.11) {
          endAtMs = now + (observedSec * 1000);
          remainingSec = observedSec;
        }
      }

      if (remainingSec <= 0) {
        const zero = formatClockFromSeconds(0);
        lastTickValueRef.current = zero;
        setClockInput(zero);
        setClockRunning(false);
        return;
      }

      const nextClock = formatClockFromSeconds(remainingSec);
      lastTickValueRef.current = nextClock;
      setClockInput((current) => (current === nextClock ? current : nextClock));

      const delayMs = remainingSec <= 60 ? 50 : 200;
      timeoutId = setTimeout(tick, delayMs);
    };

    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [clockRunning, gamePhase, clockEnabled, trackClock, setClockInput, setClockRunning]);

  // Stop clock if tracking is disabled mid-game
  useEffect(() => {
    if ((!clockEnabled || !trackClock) && clockRunning) {
      setClockRunning(false);
    }
  }, [clockEnabled, clockRunning, trackClock, setClockRunning]);
}
