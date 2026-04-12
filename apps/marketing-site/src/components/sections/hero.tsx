"use client";

import { Activity, ArrowRightLeft, BrainCircuit, Film, Radar, Timer } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { DataChip } from "@/components/ui/data-chip";
import { GlassPanel } from "@/components/ui/glass-panel";

const floatingItems = [
  { label: "Q3 Possession", value: "+4 swing", icon: Activity, x: "8%", y: "14%" },
  { label: "Film Cue", value: "02:18", icon: Film, x: "78%", y: "18%" },
  { label: "Lineup Delta", value: "+11 net", icon: ArrowRightLeft, x: "71%", y: "70%" },
  { label: "AI Alert", value: "Switch high", icon: BrainCircuit, x: "10%", y: "75%" },
] as const;

export function Hero(): JSX.Element {
  return (
    <section className="relative mx-auto mt-10 grid w-[min(1200px,92vw)] gap-10 pb-20 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
      <div className="space-y-8">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--panel-2)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]"
        >
          <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_12px_var(--accent-glow)]" />
          Live Basketball Intelligence
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="font-display text-5xl leading-[0.96] text-[var(--text-primary)] md:text-7xl"
        >
          Run stats, film, and coaching decisions
          <span className="block bg-[linear-gradient(120deg,#f4f7ff_0%,#9eb1ff_58%,#56e5d8_100%)] bg-clip-text text-transparent">
            from one live system.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="max-w-xl text-base leading-7 text-[var(--text-secondary)] md:text-lg"
        >
          BTA Courtside gives coaches and operators precise control on game day, synchronized
          postgame review, and AI guidance grounded in real possessions.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65, delay: 0.15 }}
          className="flex flex-wrap items-center gap-3"
        >
          <Button size="lg">Request a Live Walkthrough</Button>
          <Button size="lg" variant="ghost">
            View Product Tour
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap gap-2"
        >
          <DataChip label="Operator feed" value="Connected" />
          <DataChip label="Possessions captured" value="143" />
          <DataChip label="Insights queued" value="9" />
        </motion.div>
      </div>

      <div className="relative min-h-[460px]">
        <GlassPanel className="relative h-full min-h-[460px] overflow-hidden p-5 md:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(100%_80%_at_50%_0%,rgba(79,109,255,0.28),transparent_60%)]" />
          <div className="relative grid h-full gap-4 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.65 }}
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--panel-2)] p-4"
            >
              <div className="mb-3 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span>Live Possession Rail</span>
                <span>Q3 05:12</span>
              </div>
              <div className="space-y-3">
                {[72, 44, 86, 60].map((w, idx) => (
                  <div key={w} className="space-y-1">
                    <p className="text-[11px] text-[var(--text-tertiary)]">Sequence {idx + 1}</p>
                    <div className="h-2 rounded-full bg-[var(--panel-3)]">
                      <motion.div
                        className="h-full rounded-full bg-[var(--accent-primary)]"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${w}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: idx * 0.12 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.65, delay: 0.1 }}
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--panel-2)] p-4"
            >
              <div className="mb-3 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span>Shot Quality Matrix</span>
                <Radar className="size-4 text-[var(--accent-secondary)]" />
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: 42 }).map((_, idx) => (
                  <motion.span
                    key={idx}
                    className="aspect-square rounded-full"
                    style={{
                      background:
                        idx % 7 === 0
                          ? "var(--accent-primary)"
                          : idx % 5 === 0
                            ? "var(--accent-secondary)"
                            : "var(--panel-3)",
                    }}
                    animate={{ y: [0, idx % 2 === 0 ? -3 : 2, 0] }}
                    transition={{
                      duration: 3.4 + (idx % 4) * 0.4,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.65, delay: 0.12 }}
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--panel-2)] p-4 md:col-span-2"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-[var(--text-tertiary)]">AI Coaching Stream</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                  <Timer className="size-3" />
                  Live
                </span>
              </div>
              <div className="space-y-2.5">
                {[
                  "Switch to 2-3 zone on sideline out-of-bounds.",
                  "Lineup 2 has +18 paint touches in 6 possessions.",
                  "Tag weakside rotation clip for halftime review.",
                ].map((item) => (
                  <p
                    key={item}
                    className="rounded-lg border border-[var(--border-soft)] bg-[var(--panel-1)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </motion.div>
          </div>
        </GlassPanel>

        {floatingItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              className="absolute hidden rounded-xl border border-[var(--border-soft)] bg-[var(--panel-1)]/90 px-3 py-2 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-md)] lg:block"
              style={{ left: item.x, top: item.y }}
              animate={{ y: [0, idx % 2 === 0 ? -10 : 8, 0] }}
              transition={{ duration: 4 + idx, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            >
              <p className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                <Icon className="size-3.5 text-[var(--accent-secondary)]" />
                {item.label}
              </p>
              <p className="text-[var(--text-primary)]">{item.value}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
