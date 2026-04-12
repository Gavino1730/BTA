import { cn } from "@/lib/utils";

type DataChipProps = {
  label: string;
  value?: string;
  className?: string;
};

export function DataChip({ label, value, className }: DataChipProps): JSX.Element {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text-secondary)]",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_12px_var(--accent-glow)]" />
      <span>{label}</span>
      {value ? <span className="text-[var(--text-primary)]">{value}</span> : null}
    </div>
  );
}
