"use client";

import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

const ambientNodes = [
  { left: "10%", top: "14%" },
  { left: "24%", top: "66%" },
  { left: "42%", top: "25%" },
  { left: "58%", top: "70%" },
  { left: "73%", top: "36%" },
  { left: "88%", top: "58%" },
] as const;

export function FinalCta(): JSX.Element {
  return (
    <section className="mx-auto w-[min(1200px,92vw)] py-20">
      <div className="premium-outline relative overflow-hidden rounded-3xl border border-[var(--border-soft)] bg-[linear-gradient(160deg,rgba(54,43,123,0.9),rgba(40,32,96,0.9))] px-7 py-16 text-center shadow-[var(--shadow-xl)] backdrop-blur-xl md:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_85%_at_50%_0%,rgba(255,255,255,0.12),transparent_68%),radial-gradient(70%_90%_at_85%_65%,rgba(143,241,223,0.1),transparent_66%),radial-gradient(50%_80%_at_12%_70%,rgba(255,211,156,0.1),transparent_66%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_35%,rgba(25,20,68,0.18)_100%)]" />

        {ambientNodes.map((node, idx) => (
          <motion.span
            key={`${node.left}-${node.top}`}
            className="absolute size-2 rounded-full bg-[var(--accent-secondary)]/70 shadow-[0_0_14px_rgba(143,241,223,0.55)]"
            style={{ left: node.left, top: node.top }}
            animate={{ y: [0, idx % 2 === 0 ? -18 : 14, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 4 + idx * 0.35, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          />
        ))}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto max-w-2xl"
        >
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Build under pressure, with control
          </p>
          <h2 className="font-display text-5xl leading-[0.98] text-[var(--text-primary)] md:text-6xl">
            Bring your stats, film, and coaching intelligence into one live command center.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[var(--text-secondary)]">
            Schedule a product session and see how BTA Courtside runs from game entry to review in a single workflow.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => window.location.assign("/demo-signup")}>Book a Product Session</Button>
            <Button size="lg" variant="ghost" onClick={() => window.location.assign("/pricing")}>
              Download Overview
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
