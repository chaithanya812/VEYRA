import { isWithin, type DateRange } from "./date-range";
import { pctOf } from "./schedule-model";
import type { LeadRow, LeadStatusDef } from "./lead-management-model";

/**
 * Lead Insights (PLAN-V4 §5.2, frame `103904`) — the maths, pure.
 *
 * Two rules run through every function here, and both come from reading the
 * competitor's version of this screen:
 *
 * 1. **Stages come from `lead_statuses`, never a hardcoded list.** `103904`
 *    shows seventeen stages including `Sid_DemoDone`, `ToBeDeleted` and
 *    `Lead Duplicacy` — what hardcoding produces after two years. VEYRA's
 *    statuses are tenant-owned rows, so every roll-up here is driven by them.
 *
 * 2. **A percentage always travels with its denominator.** `6.12%` alone is
 *    not trustworthy; `6.12% — 9 of 147 leads` is. Every ratio this file
 *    returns carries the two numbers it came from.
 */

/** The subset of a lead these aggregations need. */
export type InsightLead = Pick<
  LeadRow,
  "id" | "created_at" | "status" | "value" | "source" | "sales_owner_id" | "assigned_to"
>;

export function inRange(leads: InsightLead[], range: DateRange): InsightLead[] {
  if (!range.from && !range.to) return leads;
  return leads.filter((l) => isWithin(range, l.created_at));
}

/* ── Card 1: conversion analysis ──────────────────────────────────────────── */

export interface ConversionAnalysis {
  received: number;
  converted: number;
  lost: number;
  junk: number;
  unassigned: number;
  /** converted ÷ received, as a percentage. */
  ratePct: number;
  /** Always rendered next to the rate — "9 of 147 leads". */
  denominator: number;
}

/**
 * `junk` is called out separately from `lost` because the two mean different
 * things to a sales manager: lost is a deal you fought for, junk was never a
 * deal. The slug is the seeded system one; a tenant that retires it simply
 * reports zero rather than breaking.
 */
export const JUNK_SLUG = "junk";

export function conversionAnalysis(
  leads: InsightLead[],
  statuses: LeadStatusDef[],
): ConversionAnalysis {
  const byValue = new Map(statuses.map((s) => [s.value, s]));

  let converted = 0;
  let lost = 0;
  let junk = 0;
  let unassigned = 0;

  for (const l of leads) {
    const def = byValue.get(l.status);
    if (l.status === JUNK_SLUG) junk++;
    else if (def?.is_won) converted++;
    else if (def?.is_lost) lost++;
    if (!l.sales_owner_id && !l.assigned_to) unassigned++;
  }

  return {
    received: leads.length,
    converted,
    lost,
    junk,
    unassigned,
    ratePct: pctOf(converted, leads.length),
    denominator: leads.length,
  };
}

/* ── Card 2: count trend ──────────────────────────────────────────────────── */

export interface TrendPoint {
  /** `yyyy-mm-dd`. */
  date: string;
  count: number;
}

/**
 * Leads created per day across the window — including the days nobody created
 * one. A trend that silently skips empty days draws a flat line over a quiet
 * week and calls it steady.
 */
export function countTrend(
  leads: InsightLead[],
  days: number,
  now: Date = new Date(),
): TrendPoint[] {
  const buckets = new Map<string, number>();
  const out: TrendPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    buckets.set(key, 0);
    out.push({ date: key, count: 0 });
  }

  for (const l of leads) {
    const key = (l.created_at ?? "").slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  for (const p of out) p.count = buckets.get(p.date) ?? 0;
  return out;
}

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ── Card 3: source breakdown ─────────────────────────────────────────────── */

export interface SourceSlice {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export function sourceBreakdown(
  leads: InsightLead[],
  labelOf: (slug: string) => string = (s) => s,
): SourceSlice[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const key = (l.source ?? "").trim() || "__none__";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key === "__none__" ? "No source" : labelOf(key),
      count,
      pct: pctOf(count, leads.length),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* ── Card 4: sales funnel ─────────────────────────────────────────────────── */

export interface FunnelStage {
  status: string;
  label: string;
  count: number;
  value: number;
  /** Share of the chosen measure — count or value — as a percentage. */
  pct: number;
  /**
   * True when leads carry a `status` that is not a row in `lead_statuses` at
   * all — legacy values left behind by an older ladder. They are counted (the
   * leads are real) and flagged (the stage is not), so the funnel never
   * silently grows six extra stages nobody configured.
   */
  unmapped: boolean;
}

export type FunnelMeasure = "count" | "value";

/**
 * One bar per live status, sorted by the chosen measure descending. Retired
 * statuses that still hold leads are kept — hiding them would lose the leads,
 * and the sum would stop matching "Received".
 */
export function funnelStages(
  leads: InsightLead[],
  statuses: LeadStatusDef[],
  measure: FunnelMeasure = "count",
): FunnelStage[] {
  const known = new Set(statuses.map((s) => s.value));
  const counts = new Map<string, { count: number; value: number }>();
  for (const s of statuses) {
    if (s.is_active) counts.set(s.value, { count: 0, value: 0 });
  }
  for (const l of leads) {
    const bucket = counts.get(l.status) ?? { count: 0, value: 0 };
    bucket.count++;
    bucket.value += Number(l.value) || 0;
    counts.set(l.status, bucket);
  }

  const labelOf = new Map(statuses.map((s) => [s.value, s.label]));
  const totalCount = leads.length;
  const totalValue = leads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);

  return [...counts.entries()]
    .map(([status, b]) => ({
      status,
      label: labelOf.get(status) ?? status,
      count: b.count,
      value: b.value,
      unmapped: !known.has(status),
      pct:
        measure === "value"
          ? pctOf(b.value, totalValue)
          : pctOf(b.count, totalCount),
    }))
    .sort((a, b) =>
      measure === "value" ? b.value - a.value : b.count - a.count,
    );
}

/* ── Card 5: assigned / unassigned ────────────────────────────────────────── */

export interface OwnerSplitRow {
  memberId: string | null;
  name: string;
  count: number;
  value: number;
}

/**
 * Per-owner counts with **unassigned first**. `104329` shows 97 of 112
 * projects with "No Project Owner" rendered as a neutral row halfway down the
 * list — a data-quality catastrophe presented as a statistic. Unassigned leads
 * are the first thing this card says.
 */
export function ownerSplit(
  leads: InsightLead[],
  members: { id: string; name: string }[],
): OwnerSplitRow[] {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const rows = new Map<string | null, OwnerSplitRow>();

  for (const l of leads) {
    const id = l.sales_owner_id ?? l.assigned_to ?? null;
    const key = id && nameById.has(id) ? id : null;
    const row =
      rows.get(key) ??
      ({
        memberId: key,
        name: key ? (nameById.get(key) as string) : "Unassigned",
        count: 0,
        value: 0,
      } satisfies OwnerSplitRow);
    row.count++;
    row.value += Number(l.value) || 0;
    rows.set(key, row);
  }

  const list = [...rows.values()];
  const unassigned = list.filter((r) => r.memberId === null);
  const assigned = list
    .filter((r) => r.memberId !== null)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return [...unassigned, ...assigned];
}
