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
        className="absolute -left-40 top-12 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(79,109,255,0.3),transparent_62%)] blur-2xl"
        style={{ y: shouldReduceMotion ? 0 : leftOrbY }}
        animate={shouldReduceMotion ? undefined : { x: [0, 30, -10, 0], y: [0, -18, 12, 0] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
        }
      />
      <motion.div
        className="absolute -right-36 bottom-10 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(37,210,197,0.18),transparent_62%)] blur-2xl"
        style={{ y: shouldReduceMotion ? 0 : rightOrbY }}
        animate={shouldReduceMotion ? undefined : { x: [0, -40, 8, 0], y: [0, 20, -15, 0] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 24, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
        }
      />
    </div>
  );
}
