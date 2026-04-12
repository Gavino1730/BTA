"use client";

import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { GlassPanel } from "@/components/ui/glass-panel";
import { proofCards } from "@/content/homepage";
import { revealUp, staggerChildren } from "@/lib/motion";

const proofTints = [
  "linear-gradient(160deg, rgba(120,82,45,0.32), rgba(72,58,150,0.24))",
  "linear-gradient(160deg, rgba(42,118,103,0.32), rgba(72,58,150,0.24))",
  "linear-gradient(160deg, rgba(52,86,146,0.32), rgba(72,58,150,0.24))",
] as const;

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
        {proofCards.map((card, index) => (
          <motion.div
            key={card.quote}
            variants={revealUp}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <GlassPanel className="h-full p-6">
              <div className="absolute inset-0" style={{ background: proofTints[index % proofTints.length] }} />
              <div className="relative">
                <p className="text-base leading-8 text-[var(--text-primary)]">
                  &ldquo;{card.quote}&rdquo;
                </p>
                <p className="mt-4 text-sm text-[var(--text-secondary)]">{card.attribution}</p>
                <p className="mt-5 inline-flex rounded-full border border-[var(--border-strong)] bg-[rgba(30,24,77,0.44)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                  {card.metric}
                </p>
              </div>
            </GlassPanel>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
