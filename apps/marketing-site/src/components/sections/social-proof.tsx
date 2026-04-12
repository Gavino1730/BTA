"use client";

import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { GlassPanel } from "@/components/ui/glass-panel";
import { proofCards } from "@/content/homepage";
import { revealUp, staggerChildren } from "@/lib/motion";

const proofTints = [
  "linear-gradient(160deg, rgba(153,116,74,0.28), rgba(93,80,177,0.2))",
  "linear-gradient(160deg, rgba(70,150,133,0.28), rgba(93,80,177,0.2))",
  "linear-gradient(160deg, rgba(80,112,173,0.28), rgba(93,80,177,0.2))",
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
                <p className="mt-5 inline-flex rounded-full border border-[var(--border-strong)] bg-[rgba(255,255,255,0.14)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">
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
