"use client";

import { CircleCheck, CircleX } from "lucide-react";
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
          <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(120,82,45,0.34),rgba(72,58,150,0.24))]" />
          <div className="relative">
            <h3 className="font-display text-4xl text-[var(--text-primary)]">Disconnected Workflow</h3>
            <motion.ul
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
              className="mt-4 space-y-2"
            >
              {[
                "Stats captured in one tool, film clipped in another",
                "Manual exports delay review and halftime decisions",
                "Insights arrive too late to change the game",
              ].map((item) => (
                <motion.li
                  key={item}
                  variants={{ hidden: { opacity: 0, x: 10 }, visible: { opacity: 1, x: 0 } }}
                  className="flex items-start gap-2.5 rounded-lg border border-[rgba(255,93,115,0.25)] bg-[rgba(75,48,26,0.42)] px-3 py-2 text-base text-[var(--text-secondary)]"
                >
                  <CircleX className="mt-0.5 size-4 shrink-0 text-[var(--accent-danger)]" />
                  {item}
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </GlassPanel>

        <GlassPanel className="relative overflow-hidden p-6">
          <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(42,118,103,0.3),rgba(52,86,146,0.24))]" />
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
                className="flex items-start gap-2.5 rounded-lg border border-[rgba(56,227,159,0.25)] bg-[rgba(26,86,74,0.42)] px-3 py-2"
              >
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--accent-success)]" />
                <span>{item}</span>
              </motion.li>
            ))}
          </motion.ul>
        </GlassPanel>
      </div>
    </section>
  );
}
