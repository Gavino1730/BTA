import { cn } from "@/lib/utils";

type GlassPanelProps = {
  className?: string;
  children: React.ReactNode;
};

export function GlassPanel({ className, children }: GlassPanelProps): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(155deg,var(--panel-2),var(--panel-1))] shadow-[var(--shadow-lg)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}
