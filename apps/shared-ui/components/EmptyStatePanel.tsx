import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

interface EmptyStatePanelProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  message: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function EmptyStatePanel({
  title,
  message,
  eyebrow,
  actions,
  className,
  ...props
}: EmptyStatePanelProps) {
  return (
    <div className={cx("bta-empty-state", className)} {...props}>
      {eyebrow ? <p className="bta-section-eyebrow">{eyebrow}</p> : null}
      <h3 className="bta-empty-state-title">{title}</h3>
      <p className="bta-empty-state-copy">{message}</p>
      {actions ? <div className="bta-empty-state-actions">{actions}</div> : null}
    </div>
  );
}
