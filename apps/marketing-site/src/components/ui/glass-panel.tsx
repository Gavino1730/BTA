import { cn } from "@/lib/utils";

type GlassPanelProps = {
  className?: string;
  children: React.ReactNode;
};

export function GlassPanel({ className, children }: GlassPanelProps): JSX.Element {
  return (
    <div
      className={cn(
        "premium-outline relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(160deg,rgba(68,54,154,0.72),rgba(45,37,111,0.76))] shadow-[var(--shadow-lg)] backdrop-blur-xl",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.1),transparent_24%,transparent_68%,rgba(143,241,223,0.06)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[rgba(255,255,255,0.26)]" />
      {children}
    </div>
  );
}
