"use client";

import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { DataChip } from "@/components/ui/data-chip";
import { GlassPanel } from "@/components/ui/glass-panel";
import { pillars } from "@/content/homepage";
import { revealUp, staggerChildren } from "@/lib/motion";

export function ProductPillars(): JSX.Element {
  return (
    <section id="pillars" className="mx-auto w-[min(1200px,92vw)] space-y-10 py-20">
      <SectionHeader
        eyebrow="Core Platform"
        title="Built for speed on game day and clarity after the buzzer"
        description="Every pillar is tuned for the same objective: make better basketball decisions faster with one connected system."
      />

      <motion.div
        variants={staggerChildren}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        className="grid gap-5 md:grid-cols-2"
      >
        {pillars.map((pillar) => (
          <motion.div
            key={pillar.title}
            variants={revealUp}
            whileHover={{ y: -6, transition: { duration: 0.18 } }}
          >
            <GlassPanel className="h-full p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <h3 className="font-display text-3xl leading-tight text-[var(--text-primary)]">{pillar.title}</h3>
                <DataChip label="Outcome" value={pillar.stat} className="shrink-0" />
              </div>
              <p className="mb-5 text-[var(--text-secondary)]">{pillar.summary}</p>
              <div className="space-y-2">
                {pillar.outcomes.map((outcome) => (
                  <p
                    key={outcome}
                    className="rounded-lg border border-[var(--border-soft)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                  >
                    {outcome}
                  </p>
                ))}
              </div>
            </GlassPanel>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
