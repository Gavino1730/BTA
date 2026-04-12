import { motion } from "motion/react";

import { revealUp } from "@/lib/motion";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function SectionHeader({ eyebrow, title, description }: SectionHeaderProps): JSX.Element {
  return (
    <motion.div variants={revealUp} className="max-w-3xl space-y-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
        {eyebrow}
      </p>
      <h2 className="font-display text-5xl leading-[0.98] text-[var(--text-primary)] md:text-6xl">
        {title}
      </h2>
      <p className="max-w-2xl text-lg leading-8 text-[var(--text-secondary)] md:text-xl">{description}</p>
    </motion.div>
  );
}
