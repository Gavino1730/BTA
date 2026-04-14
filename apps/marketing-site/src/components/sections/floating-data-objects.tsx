"use client";

import { motion, useReducedMotion } from "motion/react";

const objects = [
  { label: "Shot Dot Cluster", value: "L-Wing 62%", x: "7%", y: "27%", tone: "primary" },
  { label: "Player Tag", value: "#3 Pike", x: "82%", y: "23%", tone: "teal" },
  { label: "Timeline Marker", value: "Q3 04:51", x: "13%", y: "59%", tone: "signal" },
  { label: "Possession Arrow", value: "Home Push", x: "71%", y: "64%", tone: "primary" },
  { label: "AI Badge", value: "Switch Early", x: "46%", y: "16%", tone: "teal" },
  { label: "Score Widget", value: "62 - 55", x: "53%", y: "75%", tone: "signal" },
] as const;

export function FloatingDataObjects(): JSX.Element {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 hidden h-[1200px] overflow-hidden xl:block" aria-hidden="true">
      {objects.map((item, idx) => (
        <motion.div
          key={item.label}
          className="premium-outline absolute rounded-xl border border-[var(--border-soft)] bg-[var(--panel-4)]/70 px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)] opacity-70 shadow-[var(--shadow-md)] backdrop-blur-md"
          style={{ left: item.x, top: item.y }}
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  y: [0, idx % 2 === 0 ? -16 : 12, 0],
                  x: [0, idx % 3 === 0 ? 6 : -4, 0],
                  opacity: [0.56, 1, 0.7],
                  scale: [1, 1.02, 1],
                }
          }
          transition={
            shouldReduceMotion
              ? undefined
              : {
                  duration: 7 + idx,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }
          }
        >
          <span
            className="absolute -left-1.5 top-1/2 size-2.5 -translate-y-1/2 rounded-full"
            style={{
              backgroundColor:
                item.tone === "primary"
                  ? "var(--accent-primary)"
                  : item.tone === "teal"
                    ? "var(--accent-secondary)"
                    : "var(--accent-signal)",
              boxShadow:
                item.tone === "primary"
                  ? "0 0 14px rgba(79,109,255,0.65)"
                  : item.tone === "teal"
                    ? "0 0 14px rgba(37,210,197,0.65)"
                    : "0 0 14px rgba(247,159,82,0.65)",
            }}
          />
          <p>{item.label}</p>
          <p className="mt-1 text-[11px] normal-case tracking-normal text-[var(--text-primary)]">
            {item.value}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
