"use client";

import { motion } from "motion/react";

import { trustItems } from "@/content/homepage";

export function TrustStrip(): JSX.Element {
  return (
    <section className="mx-auto w-[min(1200px,92vw)] pb-20">
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-1)] px-5 py-6 md:px-8">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
          Trusted across competitive basketball environments
        </p>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.07,
              },
            },
          }}
          className="flex flex-wrap gap-2"
        >
          {trustItems.map((item) => (
            <motion.span
              key={item}
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-2)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
            >
              {item}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
