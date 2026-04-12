"use client";

import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { GlassPanel } from "@/components/ui/glass-panel";

export function WhyDifferent(): JSX.Element {
  return (
    <section className="mx-auto w-[min(1200px,92vw)] space-y-10 py-20">
      <SectionHeader
        eyebrow="Why BTA Courtside"
        title="One operating system instead of disconnected game-day tools"
        description="When stats, film, and insights run in the same flow, decisions get faster and review gets sharper."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel className="p-6">
          <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(153,116,74,0.3),rgba(93,80,177,0.2))]" />
          <div className="relative">
            <h3 className="font-display text-4xl text-[var(--text-primary)]">Disconnected Workflow</h3>
            <ul className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="rounded-lg border border-[var(--border-soft)] bg-[rgba(153,116,74,0.2)] px-3 py-2 text-base">Stats captured in one tool, film clipped in another</li>
              <li className="rounded-lg border border-[var(--border-soft)] bg-[rgba(153,116,74,0.2)] px-3 py-2 text-base">Manual exports delay review and halftime decisions</li>
              <li className="rounded-lg border border-[var(--border-soft)] bg-[rgba(153,116,74,0.2)] px-3 py-2 text-base">Insights arrive too late to change the game</li>
            </ul>
          </div>
        </GlassPanel>

        <GlassPanel className="relative overflow-hidden p-6">
          <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(70,150,133,0.26),rgba(80,112,173,0.18))]" />
          <h3 className="relative font-display text-4xl text-[var(--text-primary)]">BTA Courtside System</h3>
          <motion.ul
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.07,
                },
              },
            }}
            className="relative mt-4 space-y-2 text-base text-[var(--text-secondary)]"
          >
            {[
              "Single event stream powers live stats, dashboard context, and clip links",
              "Operators and coaches work from the same truth in real time",
              "AI prompts are tied directly to possessions and lineup state",
            ].map((item) => (
              <motion.li
                key={item}
                variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }}
                className="rounded-lg border border-[var(--border-soft)] bg-[rgba(70,150,133,0.2)] px-3 py-2"
              >
                {item}
              </motion.li>
            ))}
          </motion.ul>
        </GlassPanel>
      </div>
    </section>
  );
}
