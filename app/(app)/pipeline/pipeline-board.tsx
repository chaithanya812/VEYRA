"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { BarList } from "@/components/ui/charts";
import { SegmentedControl } from "@/components/ui/patterns";
import { Card } from "@/components/ui/primitives";
import { Avatar } from "../dashboard/workspace-ui";
import { setStatusAction } from "../leads/actions";
import {
  daysInStage,
  groupByStatus,
  stageAgeTone,
  type PipelineRow,
} from "@/lib/pipeline-model";
import { statusToneOf, type LeadStatusDef } from "@/lib/lead-management-model";
import { optionLabel, type WorkspaceOption } from "@/lib/workspace-model";
import { cn, fmtDate, inr } from "@/lib/utils";

/**
 * The pipeline, after the Kanban.
 *
 * A funnel strip over a grouped table (PLAN-V4 §6). Same data as the board, an
 * order of magnitude more of it visible: who owns the lead, when the next call
 * is booked, whether it is overdue, and — the number no column could ever show
 * — how many days it has been sitting on this status.
 *
 * Drag-and-drop is deliberately gone. It was the weakest part of the old board
 * and is not what was asked for; the status dropdown moves a lead in one click
 * and works with a keyboard.
 */
export function PipelineBoard({
  rows,
  statuses,
  options,
}: {
  rows: PipelineRow[];
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
}) {
  const [measure, setMeasure] = useState<"count" | "value">("count");
  const [focus, setFocus] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupByStatus(rows, statuses), [rows, statuses]);
  const totalCount = rows.length;
  const totalValue = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  const bars = useMemo(
    () =>
      [...groups]
        .sort((a, b) =>
          measure === "value" ? b.value - a.value : b.count - a.count,
        )
        .map((g) => ({
          key: g.status,
          label: g.label,
          value: measure === "value" ? g.value : g.count,
          display:
            measure === "value"
              ? `${inr(g.value)} · ${pct(g.value, totalValue)}%`
              : `${g.count} · ${pct(g.count, totalCount)}%`,
        })),
    [groups, measure, totalCount, totalValue],
  );

  const shown = focus ? groups.filter((g) => g.status === focus) : groups;

  function toggle(status: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <>
      <Card className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Where the pipeline sits
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
              {focus
                ? "Showing one stage — click it again to see them all."
                : "Click a stage to filter the table below."}
            </p>
          </div>
          <SegmentedControl
            label="Measure"
            size="sm"
            value={measure}
            onChange={setMeasure}
            options={[
              { value: "count", label: "Count" },
              { value: "value", label: "Value" },
            ]}
          />
        </div>

        <BarList
          rows={bars}
          selectedKey={focus}
          onSelect={(key) => setFocus((prev) => (prev === key ? null : key))}
          emptyLabel="No leads yet — create one from Lead Management."
        />
      </Card>

      <div className="flex flex-col gap-3">
        {shown.map((g) => {
          const isCollapsed = collapsed.has(g.status);
          return (
            <section
              key={g.status}
              className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <button
                type="button"
                onClick={() => toggle(g.status)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-sunken)]"
              >
                <span className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="size-4 text-[var(--color-ink-disabled)]" />
                  ) : (
                    <ChevronDown className="size-4 text-[var(--color-ink-disabled)]" />
                  )}
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    {g.label}
                  </span>
                  <span className="rounded-full bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-medium tabular text-[var(--color-ink-secondary)]">
                    {g.count}
                  </span>
                </span>
                <span className="text-[13px] tabular text-[var(--color-ink-secondary)]">
                  {inr(g.value)}
                </span>
              </button>

              {!isCollapsed &&
                (g.rows.length === 0 ? (
                  <p className="border-t border-[var(--color-border)] px-4 py-6 text-center text-xs text-[var(--color-ink-disabled)]">
                    Nothing on this stage.
                  </p>
                ) : (
                  <div className="overflow-x-auto border-t border-[var(--color-border)]">
                    <table className="w-full min-w-[900px] border-collapse text-[13px]">
                      <thead>
                        <tr className="bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                          <Th>Client</Th>
                          <Th>Project</Th>
                          <Th>Budget</Th>
                          <Th>Owner</Th>
                          <Th>Next follow-up</Th>
                          <Th>Days in stage</Th>
                          <Th>Last activity</Th>
                          <Th right>Value</Th>
                          <Th>Stage</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <PipelineRowView
                            key={r.id}
                            row={r}
                            statuses={statuses}
                            options={options}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 font-medium",
        right && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function PipelineRowView({
  row,
  statuses,
  options,
}: {
  row: PipelineRow;
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
}) {
  const days = daysInStage(row);
  const tone = stageAgeTone(days);
  const overdue = row.overdueFollowUps > 0;

  return (
    <tr className="border-t border-[var(--color-border)] odd:bg-[var(--color-surface)] even:bg-[color-mix(in_srgb,var(--color-surface-sunken)_55%,white)] hover:bg-[var(--color-surface-sunken)]">
      <td className="px-3 py-2.5">
        <Link
          href={`/leads/${row.id}`}
          className="font-medium text-[var(--color-ink)] hover:underline"
        >
          {row.name}
        </Link>
      </td>
      <td className="px-3 py-2.5 text-[var(--color-ink-secondary)]">
        {row.project_name || "—"}
      </td>
      <td className="px-3 py-2.5 text-[var(--color-ink-secondary)]">
        {row.budget_band ? optionLabel(options, "budget_band", row.budget_band) : "—"}
      </td>
      <td className="px-3 py-2.5">
        {row.ownerName ? (
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={row.ownerName} />
            <span className="text-[var(--color-ink-secondary)]">{row.ownerName}</span>
          </span>
        ) : (
          <span className="text-[var(--color-red)]">Unassigned</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        {row.nextFollowUpAt ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular",
              overdue
                ? "font-medium text-[var(--color-red)]"
                : "text-[var(--color-ink-secondary)]",
            )}
          >
            {/* Overdue is never red text alone — DESIGN-DIRECTION §7. */}
            {overdue && <AlertTriangle aria-hidden className="size-3.5" />}
            {fmtDate(row.nextFollowUpAt)}
          </span>
        ) : (
          <Link
            href={`/leads/${row.id}?tab=followups`}
            className="text-[var(--color-ink-disabled)] hover:text-[var(--color-ink)] hover:underline"
          >
            Book one
          </Link>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium tabular",
            tone === "red" && "bg-[var(--color-red-tint)] text-[var(--color-red-hover)]",
            tone === "amber" && "bg-[var(--color-amber-tint)] text-[var(--color-amber)]",
            tone === "neutral" && "text-[var(--color-ink-secondary)]",
          )}
        >
          {tone === "red" && <AlertTriangle aria-hidden className="size-3" />}
          {days}d
        </span>
      </td>
      <td className="px-3 py-2.5 text-[var(--color-ink-secondary)] tabular">
        {row.lastActivityAt ? fmtDate(row.lastActivityAt) : "—"}
      </td>
      <td className="px-3 py-2.5 text-right font-medium tabular text-[var(--color-ink)]">
        {inr(row.value)}
      </td>
      <td className="px-3 py-2.5">
        <InlineStage row={row} statuses={statuses} />
      </td>
    </tr>
  );
}

/** The same one-click stage change the leads list has — no drag needed. */
function InlineStage({
  row,
  statuses,
}: {
  row: PipelineRow;
  statuses: LeadStatusDef[];
}) {
  const tone = statusToneOf(statuses, row.status);
  return (
    <form action={setStatusAction} className="inline-flex">
      <input type="hidden" name="id" value={row.id} />
      <select
        name="status"
        // Keyed on the value so a re-render after the action can never leave a
        // stale selection in the DOM — the View-as bug, one screen over.
        key={row.status}
        defaultValue={row.status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={`Stage for ${row.name}`}
        className={cn(
          "h-7 cursor-pointer rounded-full border px-2 text-[12px] font-medium outline-none",
          tone === "green" &&
            "border-[color-mix(in_srgb,var(--color-green)_25%,white)] bg-[var(--color-green-tint)] text-[var(--color-green)]",
          tone === "amber" &&
            "border-[color-mix(in_srgb,var(--color-amber)_30%,white)] bg-[var(--color-amber-tint)] text-[var(--color-amber)]",
          tone === "red" &&
            "border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] text-[var(--color-red-hover)]",
          tone === "neutral" &&
            "border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]",
        )}
      >
        {statuses
          .filter((s) => s.is_active || s.value === row.status)
          .map((s) => (
            <option key={s.id} value={s.value}>
              {s.label}
            </option>
          ))}
      </select>
      <noscript>
        <button type="submit" className="ml-1 text-xs underline">
          Set
        </button>
      </noscript>
    </form>
  );
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}
