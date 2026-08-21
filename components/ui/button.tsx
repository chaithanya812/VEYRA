import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * The one primary action per view is red (DESIGN-DIRECTION §2). Secondary and
 * ghost are black/white outlines. `danger` is red too but reads as destructive.
 */
const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-red)] text-white hover:bg-[var(--color-red-hover)] border border-transparent",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-sunken)]",
  ghost:
    "bg-transparent text-[var(--color-ink)] border border-transparent hover:bg-[var(--color-surface-sunken)]",
  danger:
    "bg-transparent text-[var(--color-red)] border border-[var(--color-red)] hover:bg-[var(--color-red-tint)]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
