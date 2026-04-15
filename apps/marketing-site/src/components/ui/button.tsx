import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border text-sm font-semibold tracking-wide transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--bta-accent-violet)] bg-[linear-gradient(135deg,var(--bta-accent-violet),var(--bta-accent-violet-dark)_62%,var(--bta-accent-cyan))] text-[var(--bta-accent-on)] shadow-[0_0_32px_-10px_var(--bta-accent-glow)] hover:brightness-110",
        secondary:
          "border-[var(--border-strong)] bg-[rgba(21,26,48,0.9)] text-[var(--text-primary)] hover:border-[var(--bta-accent-cyan)] hover:bg-[rgba(28,35,64,0.98)]",
        ghost:
          "border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[rgba(28,35,64,0.9)]",
      },
      size: {
        md: "px-5",
        lg: "min-h-12 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
