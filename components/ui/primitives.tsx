import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ── Card ─────────────────────────────────────────────────────────────── */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Page header ──────────────────────────────────────────────────────── */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Status chip (dot + label; never colour alone — DESIGN-DIRECTION §8) ── */
type Tone = "neutral" | "red" | "green" | "amber";

const toneClasses: Record<Tone, string> = {
  neutral:
    "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)] border-[var(--color-border)]",
  red: "bg-[var(--color-red-tint)] text-[var(--color-red-hover)] border-[color-mix(in_srgb,var(--color-red)_25%,white)]",
  green:
    "bg-[var(--color-green-tint)] text-[var(--color-green)] border-[color-mix(in_srgb,var(--color-green)_25%,white)]",
  amber:
    "bg-[var(--color-amber-tint)] text-[var(--color-amber)] border-[color-mix(in_srgb,var(--color-amber)_30%,white)]",
};

const dotColor: Record<Tone, string> = {
  neutral: "var(--color-ink-secondary)",
  red: "var(--color-red)",
  green: "var(--color-green)",
  amber: "var(--color-amber)",
};

export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
      )}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: dotColor[tone] }}
      />
      {label}
    </span>
  );
}

/* ── Empty state (icon + line + action — DESIGN-DIRECTION §6) ──────────── */

/**
 * The ONE empty state. Two rules it exists to enforce:
 *
 * 1. **An empty state says what to DO**, and names the control that would
 *    change the result. "No X yet" on its own is a dead end — the reader is
 *    told a fact and given no move.
 * 2. **"Nothing yet" and "nothing matches your filter" are different states.**
 *    The first teaches what the thing is for; the second offers the way back,
 *    which means an `action` that clears the filter.
 *
 * It is never red and never an alert: arriving at an empty list is ordinary
 * navigation, not a failure the reader caused (§2 rule 7).
 *
 * `compact` is the same state at panel scale — the size the dashboard panels,
 * the quotation builder and the project workspace need. It exists so those do
 * NOT hand-roll a second dashed box each time, which is exactly what they had
 * been doing.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Panel scale: shorter, smaller type, no page-sized breathing room. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] text-center",
        compact ? "gap-2 px-6 py-10" : "gap-3 px-6 py-16",
      )}
    >
      {icon && <div className="text-[var(--color-ink-disabled)]">{icon}</div>}
      <div>
        <p
          className={cn(
            "font-medium text-[var(--color-ink)]",
            compact && "text-sm",
          )}
        >
          {title}
        </p>
        {description && (
          <p
            className={cn(
              "mt-1 text-[var(--color-ink-secondary)]",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
