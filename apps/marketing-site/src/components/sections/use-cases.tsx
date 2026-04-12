"use client";

import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useCases } from "@/content/homepage";
import { revealUp, staggerChildren } from "@/lib/motion";

const useCaseTints = [
  "linear-gradient(160deg, rgba(70,150,133,0.24), rgba(93,80,177,0.2))",
  "linear-gradient(160deg, rgba(80,112,173,0.24), rgba(93,80,177,0.2))",
  "linear-gradient(160deg, rgba(153,116,74,0.24), rgba(93,80,177,0.2))",
  "linear-gradient(160deg, rgba(114,90,165,0.24), rgba(93,80,177,0.22))",
] as const;

export function UseCases(): JSX.Element {
  return (
    <section id="use-cases" className="mx-auto w-[min(1200px,92vw)] space-y-10 py-20">
      <SectionHeader
        eyebrow="Use Cases"
        title="Purpose-built for every role around the bench"
        description="From game operators to development staff, each workflow is tuned for clear decisions and fast handoff."
      />

      <motion.div
        variants={staggerChildren}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        className="grid gap-5 md:grid-cols-2"
      >
        {useCases.map((item, index) => (
          <motion.div
            key={item.role}
            variants={revealUp}
            whileHover={{ y: -5, transition: { duration: 0.18 } }}
          >
            <GlassPanel className="h-full p-6">
              <div className="absolute inset-0" style={{ background: useCaseTints[index % useCaseTints.length] }} />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Role</p>
                <h3 className="mt-2 font-display text-3xl text-[var(--text-primary)]">{item.role}</h3>
                <p className="mt-3 text-[var(--text-secondary)]">{item.detail}</p>
              </div>
            </GlassPanel>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
