"use client";

import { motion, useReducedMotion } from "motion/react";

const streamItems = [
  "Shot Dot: L-Corner +3",
  "Substitution: #12 IN",
  "Possession Arrow: Home",
  "Film Cue: 04:12 Q2",
  "AI Badge: Weakside Tag",
  "Heat Fragment: Slot 56%",
  "Score Widget: 62 - 55",
  "Timeline Marker: ATO",
] as const;

export function DataStream(): JSX.Element {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="mx-auto w-[min(1200px,92vw)] py-8">
      <div className="premium-outline relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(135deg,var(--panel-2),var(--panel-1))] px-4 py-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Live Data Fabric</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--panel-3)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            <span className="size-1.5 rounded-full bg-[var(--accent-secondary)] shadow-[0_0_8px_rgba(37,210,197,0.8)]" />
            Streaming
          </span>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--bg-base)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--bg-base)] to-transparent" />
        <motion.div
          className="flex w-max gap-2 pb-1"
          animate={shouldReduceMotion ? undefined : { x: [0, -900] }}
          transition={
            shouldReduceMotion
              ? undefined
              : { duration: 28, repeat: Number.POSITIVE_INFINITY, ease: "linear" }
          }
        >
          {Array.from({ length: 2 }).flatMap((_, repeatIdx) =>
            streamItems.map((item, idx) => (
              <span
                key={`${repeatIdx}-${item}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--panel-4)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      idx % 4 === 0
                        ? "var(--accent-primary)"
                        : idx % 3 === 0
                          ? "var(--accent-secondary)"
                          : "rgba(194, 208, 243, 0.85)",
                  }}
                />
                {item}
              </span>
            ))
          )}
        </motion.div>
      </div>
    </section>
  );
}
