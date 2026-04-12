"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

export function AmbientGrid(): JSX.Element {
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const leftOrbY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const rightOrbY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const gridOpacity = useTransform(scrollYProgress, [0, 0.6, 1], [0.34, 0.22, 0.12]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--bg-base)]" />
      <motion.div className="absolute inset-0 grid-overlay" style={{ opacity: gridOpacity }} />
      <motion.div
        className="absolute -left-40 top-12 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(109,135,255,0.42),transparent_62%)] blur-2xl"
        style={{ y: shouldReduceMotion ? 0 : leftOrbY }}
        animate={shouldReduceMotion ? undefined : { x: [0, 30, -10, 0], y: [0, -18, 12, 0] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
        }
      />
      <motion.div
        className="absolute -right-36 bottom-10 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(57,227,207,0.26),transparent_62%)] blur-2xl"
        style={{ y: shouldReduceMotion ? 0 : rightOrbY }}
        animate={shouldReduceMotion ? undefined : { x: [0, -40, 8, 0], y: [0, 20, -15, 0] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 24, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
        }
      />
      <motion.div
        className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,180,99,0.14),transparent_64%)] blur-3xl"
        animate={shouldReduceMotion ? undefined : { x: [0, 18, -12, 0], y: [0, -12, 16, 0] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 26, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
        }
      />
    </div>
  );
}
