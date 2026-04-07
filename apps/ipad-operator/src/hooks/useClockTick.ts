import { useEffect } from "react";
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

  // Main countdown tick
  useEffect(() => {
    if (gamePhase !== "live" || !clockRunning || !clockEnabled || !trackClock) return;
    const currentSeconds = clockToSec(clockInput);
    const step = currentSeconds <= 60 ? 0.1 : 1;
    const delayMs = step === 0.1 ? 100 : 1000;
    const id = setTimeout(() => {
      setClockInput((current) => {
        const sec = clockToSec(current);
        if (sec <= step) {
          setClockRunning(false);
          return formatClockFromSeconds(0);
        }
        const next = Math.max(0, Math.round((sec - step) * 10) / 10);
        return formatClockFromSeconds(next);
      });
    }, delayMs);
    return () => clearTimeout(id);
  }, [clockRunning, gamePhase, clockEnabled, clockInput, trackClock, setClockInput, setClockRunning]);

  // Stop clock if tracking is disabled mid-game
  useEffect(() => {
    if ((!clockEnabled || !trackClock) && clockRunning) {
      setClockRunning(false);
    }
  }, [clockEnabled, clockRunning, trackClock, setClockRunning]);
}
