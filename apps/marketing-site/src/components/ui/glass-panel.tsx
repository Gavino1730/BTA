import { cn } from "@/lib/utils";

type GlassPanelProps = {
  className?: string;
  children: React.ReactNode;
};

export function GlassPanel({ className, children }: GlassPanelProps): JSX.Element {
  return (
    <div
      className={cn(
        "premium-outline relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(160deg,rgba(21,26,48,0.96),rgba(28,35,64,0.94))] shadow-[var(--shadow-lg)] backdrop-blur-xl",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(110,91,255,0.08),transparent_28%,transparent_70%,rgba(70,215,255,0.06)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[rgba(201,205,227,0.16)]" />
      {children}
    </div>
  );
}
