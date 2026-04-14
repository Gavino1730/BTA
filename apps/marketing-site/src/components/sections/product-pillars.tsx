"use client";

import { Activity, Film, LayoutDashboard, Sparkles, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { DataChip } from "@/components/ui/data-chip";
import { GlassPanel } from "@/components/ui/glass-panel";
import { pillars } from "@/content/homepage";
import { revealUp, staggerChildren } from "@/lib/motion";

const pillarIcons: LucideIcon[] = [Activity, LayoutDashboard, Film, Sparkles];

const pillarCardTints = [
  "linear-gradient(160deg, rgba(96,82,180,0.42), rgba(80,112,173,0.22))",
  "linear-gradient(160deg, rgba(93,80,177,0.42), rgba(70,150,133,0.2))",
  "linear-gradient(160deg, rgba(93,80,177,0.42), rgba(153,116,74,0.2))",
  "linear-gradient(160deg, rgba(96,82,180,0.44), rgba(114,90,165,0.22))",
] as const;

const outcomeTints = [
  "rgba(195,221,255,0.16)",
  "rgba(170,240,220,0.16)",
  "rgba(245,203,152,0.16)",
  "rgba(214,198,249,0.16)",
] as const;

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
        {pillars.map((pillar, index) => (
          <motion.div
            key={pillar.title}
            variants={revealUp}
            whileHover={{ y: -6, transition: { duration: 0.18 } }}
          >
            <GlassPanel className="h-full p-6" >
              <div className="absolute inset-0" style={{ background: pillarCardTints[index % pillarCardTints.length] }} />
              <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    {(() => {
                      const Icon = pillarIcons[index % pillarIcons.length];
                      return (
                        <div className="mb-3 inline-flex items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[rgba(110,91,255,0.14)] p-2.5">
                          <Icon className="size-5 text-[var(--accent-secondary)]" />
                        </div>
                      );
                    })()}
                    <h3 className="font-display text-3xl leading-tight text-[var(--text-primary)]">{pillar.title}</h3>
                  </div>
                  <DataChip label="Outcome" value={pillar.stat} className="shrink-0" />
                </div>
                <p className="mb-5 text-[var(--text-secondary)]">{pillar.summary}</p>
                <div className="space-y-2">
                  {pillar.outcomes.map((outcome) => (
                    <p
                      key={outcome}
                      className="rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                      style={{ background: outcomeTints[index % outcomeTints.length] }}
                    >
                      {outcome}
                    </p>
                  ))}
                </div>
              </div>
            </GlassPanel>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
