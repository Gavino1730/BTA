"use client";

import { motion, useReducedMotion } from "motion/react";

const objects = [
  { label: "Shot Dot Cluster", value: "L-Wing 62%", x: "8%", y: "30%" },
  { label: "Player Tag", value: "#3 Pike", x: "83%", y: "28%" },
  { label: "Timeline Marker", value: "Q3 04:51", x: "17%", y: "62%" },
  { label: "Substitution", value: "#12 IN", x: "74%", y: "64%" },
  { label: "AI Insight Badge", value: "Switch Early", x: "46%", y: "17%" },
  { label: "Coordinate Node", value: "x:14 y:22", x: "54%", y: "74%" },
] as const;

export function FloatingDataObjects(): JSX.Element {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none fixed inset-0 z-10 hidden lg:block">
      {objects.map((item, idx) => (
        <motion.div
          key={item.label}
          className="absolute rounded-xl border border-[var(--border-soft)] bg-[var(--panel-1)]/80 px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)] shadow-[var(--shadow-md)] backdrop-blur-md"
          style={{ left: item.x, top: item.y }}
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  y: [0, idx % 2 === 0 ? -16 : 12, 0],
                  x: [0, idx % 3 === 0 ? 6 : -4, 0],
                  opacity: [0.6, 1, 0.7],
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
          <p>{item.label}</p>
          <p className="mt-1 text-[11px] normal-case tracking-normal text-[var(--text-primary)]">
            {item.value}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
