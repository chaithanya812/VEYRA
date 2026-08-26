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
    <div className="-mx-1 overflow-x-auto pb-1">
      <div
        role="tablist"
        aria-label="Workspace sections"
        className="flex w-max items-center gap-1 px-1"
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
                "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
                on
                  ? "border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] text-[var(--color-red-hover)]"
                  : "border-transparent text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]",
              )}
            >
              <span className={cn("shrink-0", on && "text-[var(--color-red)]")}>
                {t.icon}
              </span>
              {t.label}
              {!!t.badge && t.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular",
                    t.alert
                      ? "bg-[var(--color-red)] text-white"
                      : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]",
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  hero,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  /** The single number this panel exists to show. At most one per panel. */
  hero?: boolean;
}) {
  const toneText: Record<Tone, string> = {
    neutral: "text-[var(--color-ink)]",
    green: "text-[var(--color-green)]",
    amber: "text-[var(--color-amber)]",
    red: "text-[var(--color-red)]",
  };
  const toneBorder: Record<Tone, string> = {
    neutral: "border-[var(--color-border)]",
    green: "border-[color-mix(in_srgb,var(--color-green)_25%,white)]",
    amber: "border-[color-mix(in_srgb,var(--color-amber)_30%,white)]",
    red: "border-[color-mix(in_srgb,var(--color-red)_25%,white)]",
  };
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-4",
        toneBorder[tone],
      )}
    >
      <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-semibold tabular",
          hero ? "text-3xl" : "text-xl",
          toneText[tone],
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
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
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
