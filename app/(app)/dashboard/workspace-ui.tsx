"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { Tone } from "@/lib/workspace-model";

/**
 * The workspace's shared building blocks.
 *
 * The brief was "keep every box they have, lose the clutter". So the vocabulary
 * here is deliberately small — a stat tile, a section, a row, a disclosure for
 * forms — and every panel is built from those four. Red stays on its closed
 * list (DESIGN-DIRECTION §2): the active tab, the one primary action per panel,
 * and genuine alerts. Never a decorative accent.
 */

/* ── Tab bar ──────────────────────────────────────────────────────────────── */

export interface TabDef {
  id: string;
  label: string;
  icon: ReactNode;
  /** Rendered as a count badge beside the label; hidden when 0 or undefined. */
  badge?: number;
  /** Show the badge as a genuine alert rather than a neutral count. */
  alert?: boolean;
}

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        role="tablist"
        aria-label="Workspace sections"
        className="inline-flex w-max items-center gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => onSelect(t.id)}
              className={cn(
                "relative inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-red)]",
                on
                  ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(23,23,26,0.06),0_1px_1px_rgba(23,23,26,0.04)]"
                  : "text-[var(--color-ink-secondary)] hover:bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] hover:text-[var(--color-ink)]",
              )}
            >
              <span
                className={cn(
                  "shrink-0",
                  on ? "text-[var(--color-red)]" : "text-[var(--color-ink-disabled)]",
                )}
              >
                {t.icon}
              </span>
              {t.label}
              {!!t.badge && t.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular",
                    t.alert
                      ? "bg-[var(--color-red)] text-white"
                      : on
                        ? "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]"
                        : "bg-[var(--color-surface)] text-[var(--color-ink-secondary)]",
                  )}
                >
                  {t.badge}
                </span>
              )}
              {/* Active marker — "active navigation" is on red's closed list. */}
              {on && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-[var(--color-red)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────────── */

/**
 * Semantic tile tones (PLAN-V4 §4.2). The colour carries the meaning exactly
 * like a status chip does — `positive` is money in / on time / done, `warning`
 * is pending, `negative` is a genuine alert, `info` is a notable-but-calm
 * count. Four flat grey boxes give the eye nowhere to land; a tinted tile says
 * what kind of number it is before you read it.
 *
 * `negative` stays rare. It is red's "genuine alert" job, not decoration — a
 * tile is never negative just because it is important.
 *
 * The green/amber/red aliases exist because the shared `Tone` vocabulary
 * (StatusChip, chips, rows) already speaks them and dozens of call sites pass
 * them. They map onto the semantic names rather than duplicating the palette.
 */
export type TileTone = Tone | "positive" | "warning" | "negative" | "info";

type ToneSkin = { bg: string; border: string; value: string; label: string };

const TILE_TONES: Record<
  "neutral" | "positive" | "warning" | "negative" | "info",
  ToneSkin
> = {
  neutral: {
    bg: "bg-[var(--color-surface)]",
    border: "border-[var(--color-border)]",
    value: "text-[var(--color-ink)]",
    label: "text-[var(--color-ink-secondary)]",
  },
  positive: {
    bg: "bg-[var(--color-green-tint)]",
    border: "border-[color-mix(in_srgb,var(--color-green)_22%,white)]",
    value: "text-[var(--color-green)]",
    label: "text-[color-mix(in_srgb,var(--color-green)_75%,var(--color-ink))]",
  },
  warning: {
    bg: "bg-[var(--color-amber-tint)]",
    border: "border-[color-mix(in_srgb,var(--color-amber)_25%,white)]",
    value: "text-[var(--color-amber)]",
    label: "text-[color-mix(in_srgb,var(--color-amber)_75%,var(--color-ink))]",
  },
  negative: {
    bg: "bg-[var(--color-red-tint)]",
    border: "border-[color-mix(in_srgb,var(--color-red)_22%,white)]",
    value: "text-[var(--color-red)]",
    label: "text-[color-mix(in_srgb,var(--color-red)_70%,var(--color-ink))]",
  },
  info: {
    bg: "bg-[var(--color-info-tint)]",
    border: "border-[color-mix(in_srgb,var(--color-info)_22%,white)]",
    value: "text-[var(--color-info)]",
    label: "text-[color-mix(in_srgb,var(--color-info)_70%,var(--color-ink))]",
  },
};

const TONE_ALIAS: Record<TileTone, keyof typeof TILE_TONES> = {
  neutral: "neutral",
  green: "positive",
  positive: "positive",
  amber: "warning",
  warning: "warning",
  red: "negative",
  negative: "negative",
  info: "info",
};

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  hero,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: TileTone;
  /**
   * The single number this panel exists to show. At most one per panel — a
   * grid where everything is the hero has no hero.
   */
  hero?: boolean;
  icon?: ReactNode;
}) {
  const skin = TILE_TONES[TONE_ALIAS[tone]];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] border p-4",
        skin.bg,
        skin.border,
        // The hero earns its weight from size and a lift, not from a sixth use
        // of red: a neutral hero stays neutral.
        hero && "p-5 shadow-[0_1px_3px_rgba(23,23,26,0.07),0_1px_2px_rgba(23,23,26,0.04)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-[12px] font-medium uppercase tracking-wide",
            skin.label,
          )}
        >
          {label}
        </p>
        {icon && <span className={cn("shrink-0 opacity-70", skin.value)}>{icon}</span>}
      </div>
      <p
        className={cn(
          "mt-1.5 font-semibold tabular",
          hero ? "text-[32px] leading-[1.1]" : "text-xl",
          skin.value,
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">{hint}</p>
      )}
    </div>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
  );
}

/* ── Section ──────────────────────────────────────────────────────────────── */

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── List + row ───────────────────────────────────────────────────────────── */

export function List({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {children}
    </div>
  );
}

export function Row({
  title,
  meta,
  chips,
  right,
  alert,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  chips?: ReactNode;
  right?: ReactNode;
  /** A true alert row (overdue) gets the red left border + tint wash. */
  alert?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-4 py-3 transition-colors hover:bg-[var(--color-surface-sunken)]",
        alert && "border-l-2 border-l-[var(--color-red)] bg-[var(--color-red-tint)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-ink)]">
              {title}
            </span>
            {chips}
          </div>
          {meta && (
            <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
              {meta}
            </p>
          )}
        </div>
        {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--color-ink)]">{message}</p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">{hint}</p>
      )}
    </div>
  );
}

/* ── Disclosure form ──────────────────────────────────────────────────────── */

/**
 * Forms live folded away behind one button. This is the anti-clutter move: a
 * panel shows its numbers and its list, and the form only exists when asked
 * for — no modal stack, no permanently open form competing for attention.
 */
export function Disclosure({
  label,
  children,
  defaultOpen,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] [&[open]>summary_.chev]:rotate-180"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4 text-[var(--color-ink-secondary)]" />
          {label}
        </span>
        <ChevronDown className="chev size-4 shrink-0 text-[var(--color-ink-secondary)] transition-transform" />
      </summary>
      <div className="border-t border-[var(--color-border)] p-4">{children}</div>
    </details>
  );
}

/* ── Form plumbing ────────────────────────────────────────────────────────── */

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-3 py-2 text-[13px] text-[var(--color-red-hover)]"
    >
      {error}
    </p>
  );
}

/** Primary submit that disables and relabels itself while the action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  /** Block submission on a rule the form itself knows about — e.g. a payment
   *  schedule that does not yet total 100%. The server re-checks regardless. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
      className={className}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}

/** Small inline action inside a row (status flips, approvals, deletes). */
export function RowAction({
  children,
  variant = "ghost",
  title,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} title={title}>
      {children}
    </Button>
  );
}

/* ── Chips ────────────────────────────────────────────────────────────────── */

export function Chip({ tone, label }: { tone: Tone; label: string }) {
  return <StatusChip tone={tone} label={label} />;
}

/** Initials bubble for an assignee, sized for a dense row. */
export function Avatar({ name, title }: { name: string; title?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      title={title ?? name}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-sunken)] text-[10px] font-semibold text-[var(--color-ink-secondary)] ring-1 ring-[var(--color-border)]"
    >
      {initials || "?"}
    </span>
  );
}
