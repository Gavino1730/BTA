"use client";

import { Activity, ArrowRight, Radar, ShieldCheck, Timer } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { DataChip } from "@/components/ui/data-chip";
import { GlassPanel } from "@/components/ui/glass-panel";

export function Hero(): JSX.Element {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative mx-auto mt-10 grid w-[min(1200px,92vw)] gap-10 pb-20 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
      <div className="space-y-8">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.14)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]"
        >
          <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_12px_var(--accent-glow)]" />
          Live Basketball Intelligence
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="font-display text-6xl leading-[0.92] text-[var(--text-primary)] md:text-[5.4rem]"
        >
          Run stats, film, and coaching decisions
          <span className="block bg-[linear-gradient(120deg,#fffaff_0%,#f6ecff_32%,#cffff2_72%,#ffe0b8_100%)] bg-clip-text text-transparent">
            from one live system.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="max-w-xl text-lg leading-8 text-[var(--text-secondary)] md:text-[1.35rem]"
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
          <Button size="lg" onClick={() => window.location.assign("/demo-signup")}>Request a Live Walkthrough</Button>
          <Button size="lg" variant="ghost" onClick={() => window.location.assign("/features")}>
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

      <div className="relative min-h-[500px]">
        <GlassPanel className="relative h-full min-h-[500px] overflow-hidden p-5 md:p-6">
          <motion.div
            className="absolute inset-0"
            animate={shouldReduceMotion ? undefined : { opacity: [0.9, 1, 0.9] }}
            transition={shouldReduceMotion ? undefined : { duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            style={{
              background:
                "radial-gradient(92% 80% at 50% 0%, rgba(255,248,255,0.24), transparent 60%), radial-gradient(70% 80% at 84% 72%, rgba(143,241,223,0.18), transparent 70%), radial-gradient(60% 70% at 8% 82%, rgba(255,211,156,0.18), transparent 72%)",
            }}
          />
          <div className="relative flex h-full flex-col gap-4">
            <div className="rounded-xl border border-[var(--border-soft)] bg-[rgba(112,93,201,0.24)] p-4 backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[var(--accent-secondary)] shadow-[0_0_8px_rgba(37,210,197,0.7)]" />
                  Command Center Feed
                </span>
                <span>Q3 05:12</span>
              </div>
              <div className="grid gap-3 md:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.16)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Score Widget</p>
                    <ShieldCheck className="size-4 text-[var(--accent-secondary)]" />
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="font-display text-4xl text-[var(--text-primary)]">62</p>
                    <ArrowRight className="mb-2 size-4 text-[var(--text-tertiary)]" />
                    <p className="font-display text-4xl text-[var(--text-primary)]">55</p>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">Home run: 11-4 over last 7 possessions</p>
                </div>

                <div className="rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.16)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Possession Arrow</p>
                    <Activity className="size-4 text-[var(--accent-primary)]" />
                  </div>
                  <div className="space-y-2">
                    {[72, 44, 86].map((w, idx) => (
                      <div key={w} className="space-y-1">
                        <p className="text-[10px] text-[var(--text-tertiary)]">Sequence {idx + 1}</p>
                        <div className="h-2 rounded-full bg-[var(--panel-3)]">
                          <motion.div
                            className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))]"
                            initial={{ width: 0 }}
                            whileInView={{ width: `${w}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1, delay: idx * 0.12 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.65, delay: 0.08 }}
                className="rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.16)] p-4"
              >
                <div className="mb-3 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                  <span>Shot Dot Layer</span>
                  <Radar className="size-4 text-[var(--accent-secondary)]" />
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 49 }).map((_, idx) => (
                    <motion.span
                      key={idx}
                      className="aspect-square rounded-full"
                      style={{
                        background:
                          idx % 9 === 0
                            ? "var(--accent-signal)"
                            : idx % 7 === 0
                              ? "var(--accent-primary)"
                              : idx % 5 === 0
                                ? "var(--accent-secondary)"
                                : "var(--panel-3)",
                      }}
                      animate={shouldReduceMotion ? undefined : { y: [0, idx % 2 === 0 ? -3 : 2, 0], scale: [1, 1.06, 1] }}
                      transition={
                        shouldReduceMotion
                          ? undefined
                          : {
                              duration: 3.5 + (idx % 4) * 0.4,
                              repeat: Number.POSITIVE_INFINITY,
                              ease: "easeInOut",
                            }
                      }
                    />
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.65, delay: 0.12 }}
                className="rounded-xl border border-[var(--border-soft)] bg-[rgba(255,255,255,0.16)] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-[var(--text-tertiary)]">AI Timeline Markers</p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                    <Timer className="size-3" />
                    Live
                  </span>
                </div>
                <div className="space-y-2.5">
                  {[
                    "04:50  High tag available after weakside drift.",
                    "04:21  #12 mismatch detected at nail coverage.",
                    "03:58  Clip marker saved for halftime sequence.",
                  ].map((item) => (
                    <p
                      key={item}
                      className="rounded-lg border border-[var(--border-soft)] bg-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </section>
  );
}
