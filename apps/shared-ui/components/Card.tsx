import type { HTMLAttributes } from "react";
import { cx } from "./cx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a subtle top-glow accent */
  glow?: "violet" | "cyan" | "none";
  padding?: "sm" | "md" | "lg";
}

const glowClasses: Record<NonNullable<CardProps["glow"]>, string> = {
  violet: "bta-card-glow-violet",
  cyan:   "bta-card-glow-cyan",
  none:   "",
};

const paddingClasses: Record<NonNullable<CardProps["padding"]>, string> = {
  sm: "bta-card-pad-sm",
  md: "bta-card-pad-md",
  lg: "bta-card-pad-lg",
};

export function Card({
  glow = "none",
  padding = "md",
  className = "",
  children,
  ...props
}: CardProps) {
  const classes = cx("bta-card", glowClasses[glow], paddingClasses[padding], className);

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
