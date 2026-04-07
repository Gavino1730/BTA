import {
  clockToSec,
  formatClockFromDigits,
  formatClockFromSeconds,
} from "../helpers/clock.js";
import { getPeriodDefaultClock } from "@bta/shared-schema";

interface UseClockControlsInput {
  clockEnabled: boolean;
  period: string;
  setClockInput: (value: string | ((current: string) => string)) => void;
  setClockRunning: (running: boolean) => void;
}

interface UseClockControlsReturn {
  handleClockInput: (rawValue: string) => void;
  adjustClock: (deltaSeconds: number) => void;
  resetClockForPeriod: () => void;
}

export function useClockControls({
  clockEnabled,
  period,
  setClockInput,
  setClockRunning,
}: UseClockControlsInput): UseClockControlsReturn {
  function handleClockInput(rawValue: string) {
    if (!clockEnabled) return;
    setClockInput(formatClockFromDigits(rawValue));
  }

  function adjustClock(deltaSeconds: number) {
    if (!clockEnabled) return;
    setClockInput((current) => formatClockFromSeconds(clockToSec(current) + deltaSeconds));
  }

  function resetClockForPeriod() {
    setClockRunning(false);
    setClockInput(getPeriodDefaultClock(period));
  }

  return { handleClockInput, adjustClock, resetClockForPeriod };
}
