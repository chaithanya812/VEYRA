import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { rollupMilestones, type ProjectMilestone } from "@/lib/milestones-model";
import { fmtDate } from "@/lib/utils";

/**
 * The Milestones cell (PLAN-V4 §8.1, frame `104420`).
 *
 * The owner's verdict on the competitor's version: *the single best idea in
 * this product.* One cell answers "is this project healthy?" without opening
 * it — count, actual against estimated, the last thing finished, the next
 * thing due.
 *
 * Two departures from the frame. The estimate is derived from planned dates
 * rather than hardcoded at 100%, so a project halfway through its schedule
 * reads 50% and the gap means something. And a behind-schedule bar carries an
 * icon as well as its colour, because red alone is too easy to miss
 * (DESIGN-DIRECTION §7).
 */
export function MilestoneCell({
  milestones,
  now,
}: {
  milestones: ProjectMilestone[];
  now?: Date;
}) {
  const r = rollupMilestones(milestones, now);

  if (r.total === 0) {
    return (
      <span className="text-xs text-[var(--color-ink-disabled)]">No plan yet</span>
    );
  }

  const behind = r.actualPct < r.estimatedPct;

  return (
    <div className="min-w-56 max-w-72">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] font-medium tabular text-[var(--color-ink)]">
          <span
            aria-hidden
            className={
              behind
                ? "size-1.5 rounded-full bg-[var(--color-red)]"
                : "size-1.5 rounded-full bg-[var(--color-green)]"
            }
          />
          {r.completed}/{r.total}
        </span>

        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.min(100, r.actualPct)}%`,
              background: behind ? "var(--color-red)" : "var(--color-green)",
            }}
          />
        </span>

        <span className="inline-flex items-center gap-1 text-[12px] font-medium tabular text-[var(--color-ink)]">
          {/* Sighted readers get the icon and the red bar. Everything that
              carried "behind" was either colour or an aria-hidden glyph, so
              the judgement itself was inaudible — the two percentages were
              there but the cell's own verdict was not. */}
          {behind && <AlertTriangle aria-hidden className="size-3 text-[var(--color-red)]" />}
          <span className="sr-only">{behind ? "Behind schedule, " : "On track, "}</span>
          {r.actualPct}%
        </span>
        <span className="text-[11px] tabular text-[var(--color-ink-secondary)]">
          | {r.estimatedPct}% est
        </span>
      </div>

      {r.lastCompleted && (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--color-ink-secondary)]">
          <Check aria-hidden className="size-3 shrink-0 text-[var(--color-green)]" />
          <span className="truncate">{r.lastCompleted.name}</span>
          <span className="ml-auto shrink-0 tabular">
            {fmtDate(r.lastCompleted.actual_end)}
          </span>
        </p>
      )}
      {r.upcoming && (
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--color-ink-secondary)]">
          <ArrowRight aria-hidden className="size-3 shrink-0 text-[var(--color-info)]" />
          <span className="truncate">{r.upcoming.name}</span>
          <span className="ml-auto shrink-0 tabular">
            {fmtDate(r.upcoming.planned_end)}
          </span>
        </p>
      )}
    </div>
  );
}

/** The sub-legend the column header carries in `104420`. */
export function MilestoneLegend() {
  return (
    <span className="ml-2 inline-flex items-center gap-3 text-[10px] font-normal normal-case text-[var(--color-ink-secondary)]">
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="size-1.5 rounded-full bg-[var(--color-green)]" />
        Last completed
      </span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="size-1.5 rounded-full bg-[var(--color-info)]" />
        Upcoming
      </span>
    </span>
  );
}
