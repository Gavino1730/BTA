import { useEffect, useRef } from "react";
import type { FeedbackTone, SoundProfile } from "../types.js";
import { getAudioContextCtor } from "../helpers/labels.js";

interface FeedbackOptions {
  enabled?: boolean;
  profile?: SoundProfile;
  volume?: number;
  hapticsEnabled?: boolean;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error ?? "unknown error");
}

/**
 * Manages Web Audio feedback tones and haptic vibration for the operator console.
 * Automatically unlocks the AudioContext on the first user gesture (required by
 * Safari) and cleans up on unmount.
 */
export function useFeedback(options: FeedbackOptions = {}) {
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

  const soundEnabled = options.enabled ?? true;
  const hapticsEnabled = options.hapticsEnabled ?? true;
  const profile: SoundProfile = options.profile ?? "click";
  const volumeScale = Math.max(0, Math.min(1, (options.volume ?? 70) / 100));

  function profileTone(base: number): number {
    if (profile === "soft") {
      return base * 0.88;
    }
    if (profile === "sharp") {
      return base * 1.15;
    }
    return base;
  }

  function profileDuration(base: number): number {
    if (profile === "soft") {
      return base * 1.15;
    }
    if (profile === "sharp") {
      return base * 0.88;
    }
    return base;
  }

  function profileVolume(base: number): number {
    const scaled = base * volumeScale;
    if (profile === "soft") {
      return scaled * 0.85;
    }
    if (profile === "sharp") {
      return scaled * 1.1;
    }
    return scaled;
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
    if (!ctx || ctx.state !== "running" || !soundEnabled || volumeScale <= 0) return;

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.connect(ctx.destination);

    let frequency = 980;
    let harmonic = 520;
    let duration = 0.024;
    let volume = 0.036;
    let wave: OscillatorType = "square";

    if (tone === "toggle") {
      frequency = 1120;
      harmonic = 620;
      duration = 0.02;
      volume = 0.03;
    } else if (tone === "confirm" || tone === "event") {
      frequency = 760;
      harmonic = 420;
      duration = 0.032;
      volume = 0.04;
      wave = "triangle";
    } else if (tone === "modal") {
      frequency = 680;
      harmonic = 360;
      duration = 0.028;
      volume = 0.033;
    } else if (tone === "undo") {
      frequency = 540;
      harmonic = 320;
      duration = 0.038;
      volume = 0.03;
      wave = "triangle";
    } else if (tone === "warning" || tone === "danger") {
      frequency = 420;
      harmonic = 250;
      duration = 0.05;
      volume = 0.032;
      wave = "sawtooth";
    }

    const f1 = profileTone(frequency);
    const f2 = profileTone(harmonic);
    const d = profileDuration(duration);
    const v = profileVolume(volume);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = wave;
    oscB.type = "triangle";

    oscA.frequency.setValueAtTime(f1, now);
    oscB.frequency.setValueAtTime(f2, now);

    const gainA = ctx.createGain();
    const gainB = ctx.createGain();
    gainA.gain.setValueAtTime(0.0001, now);
    gainB.gain.setValueAtTime(0.0001, now);
    gainA.gain.exponentialRampToValueAtTime(v, now + 0.002);
    gainA.gain.exponentialRampToValueAtTime(0.0001, now + d);
    gainB.gain.exponentialRampToValueAtTime(v * 0.46, now + 0.002);
    gainB.gain.exponentialRampToValueAtTime(0.0001, now + d * 0.9);

    oscA.connect(gainA);
    oscB.connect(gainB);
    gainA.connect(master);
    gainB.connect(master);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + d + 0.01);
    oscB.stop(now + d + 0.01);
  }

  function triggerFeedback(tone: FeedbackTone, vibrateMs = 0) {
    if (unlockedRef.current) {
      playTone(tone);
    } else {
      void unlockFeedbackAudio().then((ready) => {
        if (ready) playTone(tone);
      });
    }
    if (hapticsEnabled && vibrateMs > 0) {
      try { navigator.vibrate?.(vibrateMs); } catch { /* empty */ }
    }
  }

  // Auto-unlock on first user gesture
  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return;
      void unlockFeedbackAudio();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void unlockFeedbackAudio();
    };
    const handlePageShow = () => {
      void unlockFeedbackAudio();
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      const ctx = audioRef.current;
      if (!ctx) return;
      void ctx.close().catch((error) => {
        console.warn("[ipad-operator] closing AudioContext failed", summarizeError(error));
      });
      audioRef.current = null;
    };
  }, []);

  return { triggerFeedback, unlockFeedbackAudio };
}
