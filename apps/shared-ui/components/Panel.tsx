import type { HTMLAttributes } from "react";
import { cx } from "./cx";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "article" | "div";
  tone?: "default" | "violet" | "cyan";
  padding?: "sm" | "md" | "lg";
}

const toneClasses: Record<NonNullable<PanelProps["tone"]>, string> = {
  default: "",
  violet: "bta-panel-accent-violet",
  cyan: "bta-panel-accent-cyan",
};

const paddingClasses: Record<NonNullable<PanelProps["padding"]>, string> = {
  sm: "bta-panel-pad-sm",
  md: "bta-panel-pad-md",
  lg: "bta-panel-pad-lg",
};

export function Panel({
  as = "section",
  tone = "default",
  padding = "md",
  className,
  children,
  ...props
}: PanelProps) {
  const Component = as;

  return (
    <Component
      className={cx("bta-panel", toneClasses[tone], paddingClasses[padding], className)}
      {...props}
    >
      {children}
    </Component>
  );
}
