import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one skeleton vocabulary (Phase 12 Unit 3).
 *
 * Before this file there were two: `app/(app)/loading.tsx` and
 * `app/(app)/dashboard/workspace-skeleton.tsx` each hand-rolled the same greys,
 * the same `animate-pulse`, the same `aria-busy`. A third would have been
 * written by the next unit that needed a route-shaped fallback. Every skeleton
 * in the app now composes these pieces, so a loading state that looks wrong is
 * wrong in exactly one place.
 *
 * Two rules encoded here rather than remembered:
 *
 * 1. **Neutral greys only.** Red has a closed list of five jobs and chrome is
 *    not one of them, so a skeleton never carries an accent.
 * 2. **A skeleton announces itself.** `aria-busy` plus one `sr-only` sentence,
 *    so a screen reader is told the page is loading instead of reading a wall
 *    of empty divs. The bars themselves are `aria-hidden` by being empty.
 *
 * This module has NO `"use client"`: it is imported by server files
 * (`loading.tsx` is a server component) and a client-module export read from
 * the server is a client reference that typechecks, builds, and throws on every
 * request.
 */

/* ── The wrapper ──────────────────────────────────────────────────────────── */

/**
 * Every skeleton's outermost element. Holds the pulse, the busy flag and the
 * one sentence a screen reader actually hears.
 */
export function SkeletonFrame({
  label = "Loading…",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("animate-pulse", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* ── The atom ─────────────────────────────────────────────────────────────── */

/**
 * One grey bar. `strong` is the darker token, reserved for the line that stands
 * in for a heading or a figure — a skeleton with no contrast at all reads as a
 * rendering failure rather than as a page arriving.
 */
export function SkeletonBar({
  w,
  h = 14,
  strong = false,
  rounded = "rounded",
  className,
}: {
  w?: number | string;
  h?: number;
  strong?: boolean;
  rounded?: string;
  className?: string;
}) {
  return (
    <div
      style={{ width: w, height: h }}
      className={cn(
        rounded,
        strong ? "bg-[var(--color-border-strong)]" : "bg-[var(--color-border)]",
        w === undefined && "flex-1",
        className,
      )}
    />
  );
}

/* ── Page furniture ───────────────────────────────────────────────────────── */

/** `PageHeader`'s shape: title, subtitle, and the one primary action. */
export function SkeletonHeader({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBar w={192} h={24} strong />
        <SkeletonBar w={256} />
      </div>
      {action && <SkeletonBar w={128} h={36} rounded="rounded-[var(--radius-card)]" />}
    </div>
  );
}

/** A `SegmentedControl`'s shape — the tab bar that sits above most bodies. */
export function SkeletonTabs({ widths = [72, 64, 60, 74] }: { widths?: number[] }) {
  return (
    <div className="inline-flex gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1">
      {widths.map((w, i) => (
        <SkeletonBar key={i} w={w} h={36} rounded="rounded-md" />
      ))}
    </div>
  );
}

/** A `TileGrid` of `StatTile`s. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <SkeletonBar w={80} h={12} />
          <SkeletonBar w={96} h={26} strong className="mt-3" />
          <SkeletonBar w={112} h={12} className="mt-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * A filter bar — the row of chips, selects and a search box that the finance
 * screens carry above their table. Worth its own shape: those screens are the
 * ones where the generic tiles-and-rows fallback jumps most on arrival.
 */
export function SkeletonFilterBar({ controls = 4 }: { controls?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      {Array.from({ length: controls }).map((_, i) => (
        <SkeletonBar
          key={i}
          w={i === 0 ? 220 : 104}
          h={32}
          rounded="rounded-[var(--radius-card)]"
        />
      ))}
    </div>
  );
}

/**
 * Skeleton ROWS for a table — the shape this unit exists to guarantee. A
 * spinner over the whole page tells you nothing; rows tell you a table is
 * coming and roughly how much of one.
 */
export function SkeletonTable({
  rows = 6,
  cols = 4,
  head = true,
  lead = false,
}: {
  rows?: number;
  cols?: number;
  head?: boolean;
  /** A leading checkbox/avatar cell, as on the leads and payments tables. */
  lead?: boolean;
}) {
  const tail = Math.max(0, cols - 1);
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {head && (
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <SkeletonBar w={128} />
        </div>
      )}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3.5 last:border-0"
        >
          {lead && <SkeletonBar w={16} h={16} className="shrink-0" />}
          <SkeletonBar />
          {Array.from({ length: tail }).map((_, c) => (
            <SkeletonBar key={c} w={c % 2 === 0 ? 96 : 64} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of cards, for the screens that list cards rather than rows. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <SkeletonBar w={176} h={16} strong />
            <SkeletonBar w={72} h={20} rounded="rounded-full" />
          </div>
          <SkeletonBar w="100%" className="mt-4" />
          <SkeletonBar w="60%" className="mt-2" />
        </div>
      ))}
    </div>
  );
}
