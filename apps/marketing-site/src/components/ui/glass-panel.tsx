import { cn } from "@/lib/utils";

type GlassPanelProps = {
  className?: string;
  children: React.ReactNode;
};

export function GlassPanel({ className, children }: GlassPanelProps): JSX.Element {
  return (
    <div
      className={cn(
        "premium-outline relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(160deg,var(--panel-2),var(--panel-1))] shadow-[var(--shadow-lg)] backdrop-blur-xl",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.09),transparent_26%,transparent_70%,rgba(37,210,197,0.08)_100%)]" />
      {children}
    </div>
  );
}
