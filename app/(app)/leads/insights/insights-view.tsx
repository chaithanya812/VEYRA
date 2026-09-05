"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/primitives";
import { AreaTrend, BarList, Donut } from "@/components/ui/charts";
import { DateRangeControl, SegmentedControl } from "@/components/ui/patterns";
import { StatTile, TileGrid } from "../../dashboard/workspace-ui";
import {
  conversionAnalysis,
  countTrend,
  funnelStages,
  inRange,
  ownerSplit,
  sourceBreakdown,
  type FunnelMeasure,
} from "@/lib/lead-insights-model";
import { ALL_TIME, type DateRange, type RangePreset } from "@/lib/date-range";
import { optionLabel } from "@/lib/workspace-model";
import type { LeadInsightsData } from "@/lib/data/lead-management";
import { inr } from "@/lib/utils";

/**
 * Five independent cards, not one dashboard blob — the owner: *"make sure
 * there's a select range and all time… keep it individual, you don't need to
 * clutter."*
 *
 * One global range control at the top; a card with its own toggle (the trend's
 * window, the funnel's measure) overrides only itself. Every percentage is
 * rendered beside the two numbers it came from.
 */
export function LeadInsightsView({ data }: { data: LeadInsightsData }) {
  const { leads, statuses, members, options } = data;

  const [preset, setPreset] = useState<RangePreset>("all_time");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [scope, setScope] = useState<"range" | "all">("all");
  const [trendDays, setTrendDays] = useState(30);
  const [measure, setMeasure] = useState<FunnelMeasure>("count");

  const scoped = useMemo(
    () => (scope === "all" ? leads : inRange(leads, range)),
    [leads, range, scope],
  );

  const conversion = useMemo(
    () => conversionAnalysis(scoped, statuses),
    [scoped, statuses],
  );
  const trend = useMemo(() => countTrend(scoped, trendDays), [scoped, trendDays]);
  const sources = useMemo(
    () => sourceBreakdown(scoped, (slug) => optionLabel(options, "lead_source", slug)),
    [scoped, options],
  );
  const funnel = useMemo(
    () => funnelStages(scoped, statuses, measure),
    [scoped, statuses, measure],
  );
  const owners = useMemo(() => ownerSplit(scoped, members), [scoped, members]);

  // The two different empties. A chart the RANGE emptied has a way back — the
  // control that emptied it is three inches above the box. A chart empty
  // because the tenant has no leads is a different sentence entirely.
  const rangeFiltered = scope === "range" && leads.length > 0;
  const blankHint = rangeFiltered
    ? "Switch to All time above, or widen the selected range."
    : "Capture one with New lead in Lead Management and these charts fill themselves.";

  const strays = funnel.filter((f) => f.unmapped && f.count > 0);
  const strayLeads = strays.reduce((n, f) => n + f.count, 0);
  const strayStages = strays.map((f) => f.label);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-secondary)]">
          <span className="font-medium text-[var(--color-ink)] tabular">
            {scoped.length}
          </span>{" "}
          leads in view
          {scope === "range" && leads.length !== scoped.length && (
            <> of {leads.length} total</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Scope"
            size="sm"
            value={scope}
            onChange={(v) => {
              setScope(v);
              if (v === "range" && preset === "all_time") {
                setPreset("last_30d");
                setRange({ from: isoDaysAgo(29), to: isoDaysAgo(0) });
              }
            }}
            options={[
              { value: "range", label: "Selected range" },
              { value: "all", label: "All time" },
            ]}
          />
          <DateRangeControl
            preset={preset}
            range={range}
            onChange={(p, r) => {
              setPreset(p);
              setRange(r);
              setScope(p === "all_time" ? "all" : "range");
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Card 1: conversion ─────────────────────────────────────────── */}
        <Card className="p-4">
          <CardHead title="Lead conversion analysis" />

          <div className="mb-3 flex items-center justify-between rounded-md bg-[var(--color-surface-sunken)] px-3 py-2">
            <span className="text-[13px] text-[var(--color-ink-secondary)]">
              Unassigned leads
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular text-[var(--color-ink)]">
                {conversion.unassigned}
              </span>
              {conversion.unassigned > 0 && (
                <Link
                  href="/leads"
                  className="text-[12px] font-medium text-[var(--color-red)] hover:underline"
                >
                  Assign them
                </Link>
              )}
            </span>
          </div>

          <TileGrid>
            <StatTile label="Received" value={conversion.received} tone="info" />
            <StatTile label="Converted" value={conversion.converted} tone="positive" />
            <StatTile
              label="Lost"
              value={conversion.lost}
              tone={conversion.lost > 0 ? "negative" : "neutral"}
            />
            <StatTile label="Junk" value={conversion.junk} tone="warning" />
          </TileGrid>

          <div className="mt-3 rounded-[var(--radius-card)] bg-[var(--color-green-tint)] p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xl font-semibold tabular text-[var(--color-green)]">
                {conversion.ratePct}%
              </span>
              {/* The denominator is the point. A bare percentage is not
                  trustworthy (PLAN-V4 §5.2). */}
              <span className="text-[13px] text-[var(--color-ink-secondary)] tabular">
                {conversion.converted} of {conversion.denominator} leads
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-green)_12%,white)]">
              <div
                className="h-full rounded-full bg-[var(--color-green)]"
                style={{ width: `${Math.min(100, conversion.ratePct)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-ink-secondary)]">
              Conversion rate
            </p>
          </div>
        </Card>

        {/* ── Card 4: funnel (tall, sits beside the stack) ────────────────── */}
        <Card className="row-span-2 p-4">
          <CardHead
            title="Sales funnel"
            subtitle="One bar per status in your own ladder, largest first."
            action={
              <div className="flex items-center gap-2">
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
                <ExportButton
                  filename="sales-funnel.csv"
                  rows={[
                    ["Stage", "Leads", "Value", "Share %"],
                    ...funnel.map((f) => [f.label, f.count, f.value, f.pct]),
                  ]}
                />
              </div>
            }
          />
          <BarList
            rows={funnel.map((f) => ({
              key: f.status,
              label: f.unmapped ? `${f.label} (not in your ladder)` : f.label,
              value: measure === "value" ? f.value : f.count,
              display:
                measure === "value"
                  ? `${inr(f.value)} · ${f.pct}%`
                  : `${f.count} · ${f.pct}%`,
              // Grey, not a palette hue: an unconfigured stage is a data
              // problem, not a series.
              color: f.unmapped ? "var(--color-border-strong)" : undefined,
            }))}
            emptyLabel="No leads in this range yet."
          />

          {/* A finding, not a footnote. The competitor leaves seventeen rotted
              stages on this chart and says nothing (103904). */}
          {strayLeads > 0 && (
            <p className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--color-amber)_25%,white)] bg-[var(--color-amber-tint)] px-3 py-2 text-xs text-[var(--color-amber)]">
              {strayLeads} {strayLeads === 1 ? "lead sits" : "leads sit"} on a
              status that is not in your ladder
              {strayStages.length > 0 && <> — {strayStages.join(", ")}</>}. Move
              them to a real stage, or add the stage in Settings, or the funnel
              will keep growing rows nobody configured.
            </p>
          )}
        </Card>

        {/* ── Card 2: trend ──────────────────────────────────────────────── */}
        <Card className="p-4">
          <CardHead
            title="Lead count trends"
            action={
              <SegmentedControl
                label="Window"
                size="sm"
                value={String(trendDays)}
                onChange={(v) => setTrendDays(Number(v))}
                options={[
                  { value: "7", label: "7d" },
                  { value: "30", label: "30d" },
                  { value: "90", label: "90d" },
                ]}
              />
            }
          />
          {scoped.length === 0 ? (
            <Blank
              message={
                rangeFiltered ? "No leads created in this range" : "No leads yet"
              }
              hint={blankHint}
            />
          ) : (
            <AreaTrend points={trend} />
          )}
        </Card>

        {/* ── Card 3: sources ────────────────────────────────────────────── */}
        <Card className="p-4">
          <CardHead
            title="Lead source overview"
            action={
              <ExportButton
                filename="lead-sources.csv"
                rows={[
                  ["Source", "Leads", "Share %"],
                  ...sources.map((s) => [s.label, s.count, s.pct]),
                ]}
              />
            }
          />
          {sources.length === 0 ? (
            <Blank
              message={
                rangeFiltered
                  ? "No sources in this range"
                  : "No sources to break down yet"
              }
              hint={blankHint}
            />
          ) : (
            <Donut slices={sources} centerLabel="leads" />
          )}
        </Card>

        {/* ── Card 5: owners ─────────────────────────────────────────────── */}
        <Card className="p-4 lg:col-span-2">
          <CardHead
            title="Who is carrying them"
            subtitle="Unassigned first — an unowned lead is a problem, not a statistic."
          />
          {owners.length === 0 ? (
            <Blank
              message={
                rangeFiltered
                  ? "No owners in this range"
                  : "No leads to attribute yet"
              }
              hint={blankHint}
            />
          ) : (
            <BarList
              rows={owners.map((o) => ({
                key: o.memberId ?? "__unassigned__",
                label: o.name,
                value: o.count,
                display: `${o.count} · ${inr(o.value)}`,
                color: o.memberId ? undefined : "var(--color-red)",
              }))}
            />
          )}
        </Card>
      </div>
    </>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────────── */

function CardHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * A chart card with nothing to draw. `EmptyState` at panel scale rather than a
 * fourth dashed box — and it always carries the hint, because "no leads to
 * break down yet" alone leaves the reader with no move to make. The hint the
 * call sites pass is scope-aware: a chart emptied by the date range says how to
 * widen it; a chart empty because the tenant has no leads says where they come
 * from.
 */
function Blank({ message, hint }: { message: string; hint: string }) {
  return <EmptyState compact title={message} description={hint} />;
}

function ExportButton({
  rows,
  filename,
}: {
  rows: (string | number)[][];
  filename: string;
}) {
  function download() {
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const v = String(cell ?? "");
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-[12px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-sunken)]"
    >
      <Download className="size-3.5" /> Export
    </button>
  );
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
