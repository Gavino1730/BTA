"use client";

import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { GlassPanel } from "@/components/ui/glass-panel";
import { proofCards } from "@/content/homepage";
import { revealUp, staggerChildren } from "@/lib/motion";

export function SocialProof(): JSX.Element {
  return (
    <section id="results" className="mx-auto w-[min(1200px,92vw)] space-y-10 py-20">
      <SectionHeader
        eyebrow="Results"
        title="Designed to hold hard proof, not soft claims"
        description="These card structures are ready for verified customer outcomes, quotes, and measurable impact metrics."
      />

      <motion.div
        variants={staggerChildren}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        className="grid gap-5 lg:grid-cols-3"
      >
        {proofCards.map((card) => (
          <motion.div
            key={card.quote}
            variants={revealUp}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <GlassPanel className="h-full p-6">
              <p className="text-sm leading-7 text-[var(--text-primary)]">
                &ldquo;{card.quote}&rdquo;
              </p>
              <p className="mt-4 text-sm text-[var(--text-secondary)]">{card.attribution}</p>
              <p className="mt-5 inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--panel-2)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-secondary)]">
                {card.metric}
              </p>
            </GlassPanel>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
