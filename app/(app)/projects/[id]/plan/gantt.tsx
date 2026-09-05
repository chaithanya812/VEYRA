"use client";

import { useMemo } from "react";
import { AlertTriangle, CalendarOff } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/primitives";
import { GANTT_LEGEND, buildGantt, type BarTone } from "@/lib/gantt-model";
import type { ProjectMilestone } from "@/lib/milestones-model";
import { cn, fmtDate } from "@/lib/utils";

/**
 * The Gantt tab (PLAN-V4 §9.2; the only Gantt in the frames is `104406`).
 *
 * All the arithmetic lives in `lib/gantt-model.ts` — this file positions
 * `div`s at percentages it is handed. That split is why the chart is testable.
 *
 * **What is deliberately not copied from `104406`:** every bar there is the
 * same red, so a project that is merely unfinished looks identical to one that
 * is overdue, and red stops meaning anything (DESIGN-DIRECTION §2). Here red is
 * reserved for genuine lateness, and every bar carries its state in words as
 * well as in colour (§8: never colour alone).
 */

const BAR_STYLE: Record<BarTone, { bar: string; dot: string }> = {
  done: { bar: "bg-[var(--color-green)]", dot: "var(--color-green)" },
  active: { bar: "bg-[var(--color-chart-1)]", dot: "var(--color-chart-1)" },
  planned: { bar: "bg-[var(--color-border-strong)]", dot: "var(--color-border-strong)" },
  late: { bar: "bg-[var(--color-red)]", dot: "var(--color-red)" },
};

export function GanttChart({
  milestones,
  deps,
}: {
  milestones: ProjectMilestone[];
  deps: Record<string, string[]>;
}) {
  const chart = useMemo(
    () => buildGantt(milestones, new Map(Object.entries(deps))),
    [milestones, deps],
  );
  const nameById = useMemo(
    () => new Map(milestones.map((m) => [m.id, m.name])),
    [milestones],
  );

  if (chart.bars.length === 0) {
    return (
      <EmptyState
        icon={<CalendarOff className="size-8" />}
        title="Nothing to chart yet"
        description="A milestone needs at least one date before it can be drawn. Add planned dates on the Milestone tab and they appear here."
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--color-ink-secondary)]">
          <span className="tabular text-[var(--color-ink)]">{chart.bars.length}</span>{" "}
          milestones from{" "}
          <span className="tabular text-[var(--color-ink)]">{fmtDate(chart.start)}</span> to{" "}
          <span className="tabular text-[var(--color-ink)]">{fmtDate(chart.end)}</span>
        </p>
        <ul className="flex flex-wrap items-center gap-3">
          {GANTT_LEGEND.map((l) => (
            <li
              key={l.tone}
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-ink-secondary)]"
            >
              <span
                className="size-2 rounded-full"
                style={{ background: BAR_STYLE[l.tone].dot }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="relative min-w-[820px]">
            {/* Today, drawn through every row — `104406`'s one genuinely good idea. */}
            {chart.todayPct != null && (
              <div className="pointer-events-none absolute inset-y-0 left-[240px] right-4 z-10">
                <span
                  style={{ left: `${chart.todayPct}%` }}
                  className="absolute inset-y-0 w-px -translate-x-1/2 bg-[var(--color-red)] opacity-60"
                />
                <span
                  style={{ left: `${chart.todayPct}%` }}
                  className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--color-ink)] px-1.5 py-px text-[10px] font-medium text-white"
                >
                  Today
                </span>
              </div>
            )}

            {/* Month axis */}
            <div className="relative h-7 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
              <div className="absolute inset-y-0 left-[240px] right-4">
                {chart.ticks.map((t) => (
                  <span
                    key={t.key}
                    style={{ left: `${t.leftPct}%` }}
                    className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap text-[11px] tabular text-[var(--color-ink-secondary)]"
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>

            <ul>
              {chart.bars.map((b) => (
                <li
                  key={b.id}
                  className="relative flex items-center border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                >
                  <span className="w-[240px] shrink-0 px-4 py-2.5">
                    <span className="block truncate text-[13px] font-medium text-[var(--color-ink)]">
                      {b.name}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[var(--color-ink-secondary)]">
                      {b.tone === "late" && (
                        <AlertTriangle
                          className="size-3 text-[var(--color-red)]"
                          aria-hidden
                        />
                      )}
                      <span className={cn(b.tone === "late" && "text-[var(--color-red)]")}>
                        {b.stateLabel}
                      </span>
                      {b.dependsOn.length > 0 && (
                        <span
                          title={`Waits for ${b.dependsOn
                            .map((d) => nameById.get(d) ?? "another milestone")
                            .join(", ")}`}
                        >
                          · waits for {b.dependsOn.length}
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="relative mr-4 h-9 flex-1">
                    {/* The track */}
                    <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-border)]" />

                    <span
                      style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                      title={`${b.name} · ${b.dateLabel} · ${b.stateLabel}`}
                      className={cn(
                        "absolute top-1/2 flex h-5 min-w-1 -translate-y-1/2 items-center overflow-hidden rounded-[3px]",
                        BAR_STYLE[b.tone].bar,
                        // A bar drawn from actual dates is solid; a planned one
                        // is outlined, so the eye can tell a promise from a fact.
                        !b.actual && "opacity-80 ring-1 ring-inset ring-white/40",
                      )}
                    >
                      <span className="truncate px-1.5 text-[10px] font-medium tabular text-white">
                        {b.dateLabel}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {chart.undated.length > 0 && (
        <Card className="mt-3 p-4">
          <p className="text-[13px] font-medium text-[var(--color-ink)]">
            <span className="tabular">{chart.undated.length}</span> not on the chart
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
            These carry no dates at all, so there is nowhere honest to draw them.
            Give them a planned start and end on the Milestone tab.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {chart.undated.map((m) => (
              <li
                key={m.id}
                className="rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-[12px] text-[var(--color-ink-secondary)]"
              >
                {m.name}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
