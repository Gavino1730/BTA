import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div className={cx("bta-section-header", className)} {...props}>
      <div className="bta-section-header-copy">
        {eyebrow ? <p className="bta-section-eyebrow">{eyebrow}</p> : null}
        <h2 className="bta-section-title">{title}</h2>
        {subtitle ? <p className="bta-section-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="bta-section-actions">{actions}</div> : null}
    </div>
  );
}
