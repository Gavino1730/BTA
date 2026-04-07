import { useEffect, useRef } from "react";
import type { FeedbackTone } from "../types.js";
import { getAudioContextCtor } from "../helpers/labels.js";

/**
 * Manages Web Audio feedback tones and haptic vibration for the operator console.
 * Automatically unlocks the AudioContext on the first user gesture (required by
 * Safari) and cleans up on unmount.
 */
export function useFeedback() {
  const audioRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);

  function ensureAudioContext(): AudioContext | null {
    if (audioRef.current) return audioRef.current;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      audioRef.current = ctx;
      return ctx;
    } catch {
      return null;
    }
  }

  async function unlockFeedbackAudio(): Promise<boolean> {
    const ctx = ensureAudioContext();
    if (!ctx) return false;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      if (ctx.state !== "running") return false;

      // Prime audio on first user gesture so Safari allows subsequent playback.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc.frequency.value = 440;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);

      unlockedRef.current = true;
      return true;
    } catch {
      return false;
    }
  }

  function playTone(tone: FeedbackTone) {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== "running") return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";

    const now = ctx.currentTime;
    let frequency = 780;
    let duration = 0.05;
    let volume = 0.03;

    if (tone === "undo") {
      frequency = 500;
      duration = 0.06;
      volume = 0.028;
    } else if (tone === "warning") {
      frequency = 360;
      duration = 0.08;
      volume = 0.03;
    }

    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  function triggerFeedback(tone: FeedbackTone, vibrateMs = 0) {
    if (unlockedRef.current) {
      playTone(tone);
    } else {
      void unlockFeedbackAudio().then((ready) => {
        if (ready) playTone(tone);
      });
    }
    if (vibrateMs > 0) {
      try { navigator.vibrate?.(vibrateMs); } catch { /* empty */ }
    }
  }

  // Auto-unlock on first user gesture
  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return;
      void unlockFeedbackAudio();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      const ctx = audioRef.current;
      if (!ctx) return;
      void ctx.close().catch(() => {});
      audioRef.current = null;
    };
  }, []);

  return { triggerFeedback, unlockFeedbackAudio };
}
