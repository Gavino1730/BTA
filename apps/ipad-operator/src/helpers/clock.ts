/** Parse "M:SS" or "M:SS.T" → total seconds */
export function clockToSec(clock: string): number {
  const colonIdx = clock.indexOf(":");
  if (colonIdx === -1) return Number(clock) || 0;
  const m = Number(clock.slice(0, colonIdx)) || 0;
  const s = Number(clock.slice(colonIdx + 1)) || 0;
  return m * 60 + s;
}

/** Format total seconds → "M:SS" or "0:SS.T" (tenths below 60 s) */
export function formatClockFromSeconds(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  if (safe < 60) {
    const tenthsTotal = Math.floor((safe * 10) + 1e-6);
    const s = Math.floor(tenthsTotal / 10);
    const t = tenthsTotal % 10;
    return `0:${String(s).padStart(2, "0")}.${t}`;
  }
  const whole = Math.floor(safe + 1e-6);
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Parse digits string (MMSS) → "M:SS" */
export function formatClockFromDigits(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "0:00";
  const minuteDigits = digits.length <= 2 ? "0" : digits.slice(0, -2);
  const secondDigits = digits.length <= 2 ? digits : digits.slice(-2);
  const m = Number.parseInt(minuteDigits || "0", 10) || 0;
  const s = Number.parseInt(secondDigits || "0", 10) || 0;
  return formatClockFromSeconds((m * 60) + Math.min(s, 59));
}

/** Parse raw numpad string (digits + optional single dot for tenths) → formatted clock string */
export function formatClockFromPadInput(raw: string): string {
  if (!raw) return "0:00";
  const dotIdx = raw.indexOf(".");
  if (dotIdx !== -1) {
    const secStr = raw.slice(0, dotIdx) || "0";
    const tenthStr = raw.slice(dotIdx + 1).slice(0, 1) || "0";
    const sec = Math.min(59, parseInt(secStr, 10) || 0);
    const tenth = parseInt(tenthStr, 10) || 0;
    return `0:${String(sec).padStart(2, "0")}.${tenth}`;
  }
  return formatClockFromDigits(raw);
}
