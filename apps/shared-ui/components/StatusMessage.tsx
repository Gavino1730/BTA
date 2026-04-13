interface StatusMessageProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  className?: string;
}

const typeClasses: Record<NonNullable<StatusMessageProps["type"]>, string> = {
  success: "bta-status bta-status-success",
  error:   "bta-status bta-status-error",
  info:    "bta-status bta-status-info",
  warning: "bta-status bta-status-warning",
};

export function StatusMessage({ message, type = "info", className = "" }: StatusMessageProps) {
  if (!message) return null;
  return (
    <p
      className={[typeClasses[type], className].filter(Boolean).join(" ")}
      aria-live="polite"
      role={type === "error" ? "alert" : undefined}
    >
      {message}
    </p>
  );
}
