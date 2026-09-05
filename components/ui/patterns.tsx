"use client";

import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarRange, Check, Eye, EyeOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/field";
import {
  RANGE_PRESETS,
  rangeLabel,
  resolveRange,
  type DateRange,
  type RangePreset,
} from "@/lib/date-range";
import { toBar, type Segment } from "@/lib/segments-model";
import type { Variance } from "@/lib/schedule-model";
import { cn } from "@/lib/utils";

/**
 * The patterns that recur across the whole plan (PLAN-V4 §3 / FRAME-REGISTER
 * "Cross-cutting patterns"). Each is built once here and imported by every
 * module that needs it — the alternative is the competitor's product, where
 * the same idea is drawn five slightly different ways.
 *
 * Red discipline holds throughout: none of these spends red on decoration.
 * The only red here is the active segment's underline (active navigation) and
 * a genuine variance alert.
 */

/* ── SegmentedControl ─────────────────────────────────────────────────────
   `Listing | Analytics`, `Count | Value`, `Chart | Table`, `Milestones |
   Tasks` — the same control on a dozen frames. Same visual language as the
   workspace TabBar: a sunken track, the active choice lifted onto a white
   card. */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Accessible name for the group — what these segments choose between. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex w-max items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors",
              size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]",
              on
                ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(23,23,26,0.08)]"
                : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
            )}
          >
            {o.icon}
            {o.label}
            {o.badge != null && o.badge > 0 && (
              <span className="rounded-full bg-[var(--color-surface-sunken)] px-1.5 text-[11px] tabular text-[var(--color-ink-secondary)]">
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── SegmentedCountBar ────────────────────────────────────────────────────
   One count split across stages: a proportional bar and a legend that always
   carries the numbers (frames 105729 / 105913 / 110458). Never colour alone —
   every legend entry is a dot *and* a label *and* a count
   (DESIGN-DIRECTION §8). */

export function SegmentedCountBar({
  segments,
  label,
  total: totalLabel,
  legend = true,
  className,
}: {
  segments: Segment[];
  /** What the bar is counting, e.g. "Total items". */
  label?: string;
  /** Overrides the computed total in the header, e.g. "177 items". */
  total?: string;
  legend?: boolean;
  className?: string;
}) {
  const { slices, total } = toBar(segments);

  return (
    <div className={className}>
      {(label || totalLabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && (
            <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
              {label}
            </span>
          )}
          <span className="text-sm font-semibold tabular text-[var(--color-ink)]">
            {totalLabel ?? total}
          </span>
        </div>
      )}

      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunken)]"
        role="img"
        aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(", ")}
      >
        {slices
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              style={{ width: `${s.pct}%`, background: s.color }}
              title={`${s.label} — ${s.value} (${s.pct}%)`}
            />
          ))}
      </div>

      {legend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {slices.map((s) => (
            <li
              key={s.key}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-secondary)]"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
              <span className="font-medium tabular text-[var(--color-ink)]">
                ({s.value})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── PlannedVsActual ──────────────────────────────────────────────────────
   The three-line Timeline cell from 105010: planned, actual, variance. The
   competitor renders "351 days overdue" as plain grey text (104529); here a
   late variance is red *with an icon*, because red text alone is too easy to
   miss (DESIGN-DIRECTION §7). */

export function PlannedVsActual({
  plannedLabel,
  actualLabel,
  variance,
  compact,
}: {
  plannedLabel: string;
  /** Null renders the "Actual Start → Actual End" placeholder, as 105010 does. */
  actualLabel: string | null;
  variance: Variance;
  compact?: boolean;
}) {
  const late = variance.state === "late";
  return (
    <div className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1")}>
      <span className="text-[13px] tabular text-[var(--color-ink)]">
        {plannedLabel}
      </span>
      <span
        className={cn(
          "text-[13px] tabular",
          actualLabel
            ? "text-[var(--color-ink-secondary)]"
            : "text-[var(--color-ink-disabled)]",
        )}
      >
        {actualLabel ?? "Actual start → Actual end"}
      </span>
      {variance.state !== "pending" && (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            late
              ? "bg-[var(--color-red-tint)] text-[var(--color-red-hover)]"
              : variance.state === "early"
                ? "bg-[var(--color-green-tint)] text-[var(--color-green)]"
                : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]",
          )}
        >
          {late && <AlertTriangle aria-hidden className="size-3" />}
          {variance.label}
        </span>
      )}
    </div>
  );
}

/* ── MultiValueCell ───────────────────────────────────────────────────────
   `Chaganram +6 more`, `Carpentry Woodwork + 2` (frames 105818 / 110215 /
   105729). The overflow is a real popover, not a truncated string — the
   values behind "+6" are the reason someone opened the column. */

export function MultiValueCell({
  values,
  max = 1,
  render,
  emptyLabel = "—",
}: {
  values: string[];
  max?: number;
  render?: (value: string) => ReactNode;
  emptyLabel?: string;
}) {
  if (values.length === 0) {
    return <span className="text-[var(--color-ink-disabled)]">{emptyLabel}</span>;
  }

  const shown = values.slice(0, max);
  const rest = values.slice(max);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {shown.map((v) => (
        <span key={v} className="text-[13px] text-[var(--color-ink)]">
          {render ? render(v) : v}
        </span>
      ))}
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-secondary)] transition-colors hover:text-[var(--color-ink)]"
            >
              +{rest.length} more
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <ul className="flex flex-col gap-1">
              {rest.map((v) => (
                <li key={v} className="text-[13px] text-[var(--color-ink)]">
                  {render ? render(v) : v}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/* ── ClientVisibleToggle ──────────────────────────────────────────────────
   One boolean, honoured everywhere: milestones (105010), site photos
   (105527), labour (105620) — and it is what the Progress Report's "Client
   Visible Only" filter reads (104636). Labelled VISIBLE / HIDDEN, never a
   bare colour. */

export function ClientVisibleToggle({
  checked,
  onChange,
  name,
  disabled,
  compact,
  readOnly,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** When set, the state is also submitted with a surrounding form. */
  name?: string;
  disabled?: boolean;
  compact?: boolean;
  /**
   * Render the chip, not a control — for the case where something OUTSIDE
   * already is the control. `/projects/[id]/plan` wraps this in a
   * `<button type="submit">`, and a `<button>` inside a `<button>` is invalid
   * HTML: the parser hoists the inner one out, so the submit button was left
   * with no accessible name at all and the a11y tree showed twelve nameless
   * buttons on that one table. Read-only also reads `checked` straight through
   * instead of holding it in state, so it can never disagree with the row it
   * is describing after a re-render (§11).
   */
  readOnly?: boolean;
}) {
  const [on, setOn] = useState(checked);
  const toggle = useCallback(() => {
    if (disabled) return;
    setOn((prev) => {
      onChange?.(!prev);
      return !prev;
    });
  }, [disabled, onChange]);

  const shown = readOnly ? checked : on;
  const chip = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50",
    compact && "px-1.5",
    shown
      ? "border-[color-mix(in_srgb,var(--color-green)_25%,white)] bg-[var(--color-green-tint)] text-[var(--color-green)]"
      : "border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]",
  );
  const face = (
    <>
      {shown ? <Eye aria-hidden className="size-3" /> : <EyeOff aria-hidden className="size-3" />}
      {/* Compact drops the word visually but never from the accessibility
          tree: the state must not be carried by the icon and the tint alone. */}
      <span className={compact ? "sr-only" : undefined}>{shown ? "Visible" : "Hidden"}</span>
    </>
  );

  if (readOnly) {
    return (
      <>
        {name && <input type="hidden" name={name} value={shown ? "true" : "false"} />}
        <span className={chip}>{face}</span>
      </>
    );
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={on ? "true" : "false"} />}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Visible to the client"
        disabled={disabled}
        onClick={toggle}
        className={chip}
      >
        {face}
      </button>
    </>
  );
}

/* ── DateRangeControl ─────────────────────────────────────────────────────
   One range control per analytic page (frames 103904 / 104314 / 110521). The
   FY preset is Indian — 1 April to 31 March — and the button says which FY,
   not "This FY". */

export function DateRangeControl({
  preset,
  range,
  onChange,
  now = new Date(),
}: {
  preset: RangePreset;
  range: DateRange;
  onChange: (preset: RangePreset, range: DateRange) => void;
  now?: Date;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(range);

  const pick = (p: RangePreset) => {
    if (p === "custom") {
      onChange("custom", draft);
      return;
    }
    onChange(p, resolveRange(p, now));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-sunken)]"
        >
          <CalendarRange className="size-4 text-[var(--color-ink-secondary)]" />
          {rangeLabel(preset, range, now)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <ul className="flex flex-col">
          {RANGE_PRESETS.filter((p) => p.value !== "custom").map((p) => (
            <li key={p.value}>
              <button
                type="button"
                onClick={() => pick(p.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-[var(--color-surface-sunken)]",
                  preset === p.value
                    ? "font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-secondary)]",
                )}
              >
                {p.value === "this_fy" ? rangeLabel("this_fy", range, now) : p.label}
                {preset === p.value && (
                  <Check className="size-3.5 text-[var(--color-ink)]" />
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-2 border-t border-[var(--color-border)] pt-2">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-disabled)]">
            Custom
          </p>
          <div className="flex items-center gap-1.5 px-2">
            <Input
              type="date"
              aria-label="From"
              className="h-8 text-[12px]"
              value={draft.from ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || null }))}
            />
            <span className="text-[var(--color-ink-disabled)]">→</span>
            <Input
              type="date"
              aria-label="To"
              className="h-8 text-[12px]"
              value={draft.to ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || null }))}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onChange("custom", draft);
              setOpen(false);
            }}
            className="mt-2 w-full rounded-md bg-[var(--color-surface-sunken)] px-2 py-1.5 text-[13px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-border)]"
          >
            Apply custom range
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
