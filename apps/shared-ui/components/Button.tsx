import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:   "bta-btn bta-btn-primary",
  secondary: "bta-btn bta-btn-secondary",
  ghost:     "bta-btn bta-btn-ghost",
  danger:    "bta-btn bta-btn-danger",
  success:   "bta-btn bta-btn-success",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "bta-btn-sm",
  md: "",
  lg: "bta-btn-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = [
    variantStyles[variant],
    sizeStyles[size],
    fullWidth ? "bta-btn-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
