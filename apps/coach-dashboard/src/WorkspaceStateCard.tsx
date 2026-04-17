import type { ReactNode } from "react";

export function WorkspaceStateCard({
  eyebrow,
  title,
  message,
  tone = "neutral",
  actions,
}: {
  eyebrow: string;
  title: string;
  message: string;
  tone?: "neutral" | "warning";
  actions?: ReactNode;
}) {
  return (
    <div className="stats-page">
      <section className={`stats-page-card workspace-state-card ${tone === "warning" ? "is-warning" : ""}`}>
        <p className="stats-page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="stats-page-subtitle">{message}</p>
        {actions ? <div className="system-status-actions workspace-state-actions">{actions}</div> : null}
      </section>
    </div>
  );
}
