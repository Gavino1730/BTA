"use client";

import { Play, TrendingUp } from "lucide-react";
import { motion } from "motion/react";

import { SectionHeader } from "@/components/sections/section-header";
import { GlassPanel } from "@/components/ui/glass-panel";

const timeline = [
  { time: "08:44", event: "Horns set - weakside tag", score: "41-37" },
  { time: "07:56", event: "Paint touch + kickout", score: "44-37" },
  { time: "06:31", event: "Deflection leading to runout", score: "48-39" },
  { time: "05:18", event: "ATO flare action", score: "50-41" },
] as const;

export function ProductShowcase(): JSX.Element {
  return (
    <section id="showcase" className="mx-auto w-[min(1200px,92vw)] space-y-10 py-20">
      <SectionHeader
        eyebrow="Product Showcase"
        title="From possession timeline to clip review in one movement"
        description="The interface keeps live context and postgame study connected, so staff can move from what happened to why it happened without searching across tools."
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div whileHover={{ y: -4, transition: { duration: 0.18 } }}>
          <GlassPanel className="overflow-hidden p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                Game Summary Board
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Enterprise game operations surface</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.18)] px-3 py-1 text-xs text-[var(--text-secondary)]">
              <TrendingUp className="size-4 text-[var(--accent-secondary)]" />
              Last 6 possessions
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {["Live", "Bench Unit", "ATO", "Crunch Time"].map((tab, idx) => (
              <span
                key={tab}
                className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs"
                style={{
                  color: idx === 0 ? "var(--text-primary)" : "var(--text-secondary)",
                  background: idx === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)",
                  boxShadow: idx === 0 ? "0 0 0 1px rgba(255,255,255,0.22)" : "none",
                }}
              >
                {tab}
              </span>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {["Effective FG", "Turnover %", "Paint Attempts"].map((label, idx) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: idx * 0.08 }}
                className="rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.16)] p-4"
              >
                <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
                <p className="mt-3 font-display text-3xl text-[var(--text-primary)]">
                  {idx === 0 ? "58.1%" : idx === 1 ? "11.3%" : "19"}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]">
                  <motion.div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))]"
                    initial={{ width: 0 }}
                    whileInView={{ width: idx === 0 ? "81%" : idx === 1 ? "52%" : "67%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.1 + idx * 0.08 }}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">Updated live every event commit</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.16)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-[var(--text-secondary)]">Possession Timeline</p>
              <button className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.14)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                <Play className="size-3" />
                Open Synced Film
              </button>
            </div>

            <div className="space-y-2">
              {timeline.map((item, idx) => (
                <motion.div
                  key={item.time}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: idx * 0.07 }}
                  className="grid grid-cols-[70px_1fr_56px] items-center gap-3 rounded-lg border border-[var(--border-soft)] bg-[rgba(255,255,255,0.12)] px-3 py-2"
                >
                  <span className="text-xs text-[var(--text-tertiary)]">{item.time}</span>
                  <span className="text-sm text-[var(--text-secondary)]">{item.event}</span>
                  <span className="text-right text-xs text-[var(--text-primary)]">{item.score}</span>
                </motion.div>
              ))}
            </div>
          </div>
          </GlassPanel>
        </motion.div>

        <motion.div whileHover={{ y: -4, transition: { duration: 0.18 } }}>
          <GlassPanel className="p-5 md:p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            Player Snapshot
          </p>
          <div className="space-y-3">
            {[
              ["#3 Jordan Pike", "24 pts | 7 ast | 4 stl", "usage 31%"],
              ["#12 Amir West", "13 reb | 5 deflections", "rim impact +9"],
              ["#21 Levi Moore", "+14 on floor | 3 charges", "foul draw 4"],
            ].map(([name, line, badge], idx) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: idx * 0.06 }}
                className="rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.16)] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
                  <span className="rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.18)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent-secondary)]">
                    {badge}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{line}</p>
              </motion.div>
            ))}
          </div>
          </GlassPanel>
        </motion.div>
      </div>
    </section>
  );
}
