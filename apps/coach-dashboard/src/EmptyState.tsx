import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  message: string;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({ title, message, actions, className = "" }: EmptyStateProps) {
  const combinedClassName = className ? `stats-empty-state ${className}` : "stats-empty-state";

  return (
    <div className={combinedClassName}>
      <div className="stats-empty-state-copy">
        <p className="stats-empty-state-eyebrow">No data yet</p>
        <h3 className="stats-empty-state-title">{title}</h3>
        <p className="stats-empty-copy">{message}</p>
      </div>
      {actions ? <div className="stats-empty-state-actions">{actions}</div> : null}
    </div>
  );
}
