import { dayDiff } from "./schedule-model";
import { statusOf, type ProjectMilestone } from "./milestones-model";

/**
 * The Gantt engine (PLAN-V4 §9.2 — the second tab of `105010`; the only Gantt
 * in the frames is `104406`, Project Insights' timeline).
 *
 * Pure geometry: milestones in, bars positioned as percentages of a date
 * window out. Nothing here draws anything, which is what makes it testable —
 * "does this bar start in the right place" is a question about arithmetic, not
 * about SVG.
 *
 * Two decisions worth stating.
 *
 * **The window is derived from the work, not from the calendar.** A plan that
 * runs Jul-25 → May-26 gets a Jul-25 → May-26 axis, padded a little. Fixing the
 * axis to "this month" (which `104406` does) hides most of a project.
 *
 * **Colour is not the only signal.** `104406` paints every bar the same red,
 * which is exactly the failure DESIGN-DIRECTION §2 names — when everything is
 * red, red means nothing. Here a bar carries a `tone` AND a `state` label, so
 * the caller renders red *plus* a word, and only genuine lateness is red.
 */

export type BarTone = "done" | "active" | "planned" | "late";

export interface GanttBar {
  id: string;
  name: string;
  /** Percent of the window where the bar starts / how wide it is. */
  leftPct: number;
  widthPct: number;
  tone: BarTone;
  /** The state in words — never colour alone (DESIGN-DIRECTION §8). */
  stateLabel: string;
  /** What to print on or beside the bar. */
  dateLabel: string;
  progressPct: number;
  /** Ids this milestone waits on, for the dependency links. */
  dependsOn: string[];
  /** True when the bar is drawn from actual dates rather than planned ones. */
  actual: boolean;
}

export interface GanttTick {
  /** yyyy-mm-01 for the month this tick opens. */
  key: string;
  label: string;
  leftPct: number;
}

export interface GanttChart {
  bars: GanttBar[];
  ticks: GanttTick[];
  /** Window bounds as yyyy-mm-dd. */
  start: string;
  end: string;
  /** Where "today" sits, or null when today is outside the window. */
  todayPct: number | null;
  /** Milestones that carry no dates at all and therefore cannot be drawn. */
  undated: ProjectMilestone[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-${`${d.getUTCDate()}`.padStart(2, "0")}`;
}

function parse(day: string): Date {
  return new Date(`${day.slice(0, 10)}T00:00:00Z`);
}

function shortDate(day: string): string {
  const d = parse(day);
  if (Number.isNaN(d.getTime())) return day;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${`${d.getUTCFullYear()}`.slice(2)}`;
}

/** The dates a bar is actually drawn between, and whether they are the real ones. */
function span(m: ProjectMilestone): { from: string; to: string; actual: boolean } | null {
  const aFrom = m.actual_start;
  const aTo = m.actual_end;
  const pFrom = m.planned_start;
  const pTo = m.planned_end;

  // Actual dates win when both exist — a finished milestone should show when it
  // really ran, which is the whole point of the planned-vs-actual column.
  if (aFrom && aTo) return { from: aFrom.slice(0, 10), to: aTo.slice(0, 10), actual: true };
  if (pFrom && pTo) return { from: pFrom.slice(0, 10), to: pTo.slice(0, 10), actual: false };

  // One date is still a bar: a zero-length marker on the day we know about.
  const only = aTo ?? aFrom ?? pTo ?? pFrom;
  if (!only) return null;
  const day = only.slice(0, 10);
  return { from: day, to: day, actual: !!(aTo ?? aFrom) };
}

function toneOf(
  m: ProjectMilestone,
  to: string,
  today: string,
): { tone: BarTone; stateLabel: string } {
  const s = statusOf(m);
  if (s === "completed") return { tone: "done", stateLabel: "Completed" };
  if (to < today) {
    // The only red in this chart: work that should be finished and is not.
    return { tone: "late", stateLabel: "Overdue" };
  }
  if (s === "blocked") return { tone: "late", stateLabel: "Blocked" };
  if (s === "in_progress") return { tone: "active", stateLabel: "In progress" };
  return { tone: "planned", stateLabel: "Not started" };
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build the chart.
 *
 * `deps` maps a milestone id to the ids it waits on (`project_milestone_deps`).
 * The window is padded by a few days at each end so a bar starting on day one
 * is not flush against the axis.
 */
export function buildGantt(
  milestones: ProjectMilestone[],
  deps: Map<string, string[]> = new Map(),
  now: Date = new Date(),
): GanttChart {
  const today = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));

  const dated: { m: ProjectMilestone; s: { from: string; to: string; actual: boolean } }[] = [];
  const undated: ProjectMilestone[] = [];
  for (const m of milestones) {
    const s = span(m);
    if (s) dated.push({ m, s });
    else undated.push(m);
  }

  if (dated.length === 0) {
    return { bars: [], ticks: [], start: today, end: today, todayPct: null, undated };
  }

  let min = dated[0].s.from;
  let max = dated[0].s.to;
  for (const { s } of dated) {
    if (s.from < min) min = s.from;
    if (s.to > max) max = s.to;
    // A single reversed pair (end before start) must not collapse the window.
    if (s.to < min) min = s.to;
    if (s.from > max) max = s.from;
  }

  const pad = Math.max(2, Math.round(dayDiff(min, max) * 0.03));
  const startD = parse(min);
  startD.setUTCDate(startD.getUTCDate() - pad);
  const endD = parse(max);
  endD.setUTCDate(endD.getUTCDate() + pad);

  const start = iso(startD);
  const end = iso(endD);
  const total = Math.max(1, dayDiff(start, end));
  const pct = (day: string) => clamp((dayDiff(start, day) / total) * 100);

  const bars: GanttBar[] = dated.map(({ m, s }) => {
    // A reversed pair is bad data, not a negative-width bar.
    const from = s.from <= s.to ? s.from : s.to;
    const to = s.from <= s.to ? s.to : s.from;
    const left = pct(from);
    // Inclusive of the end day, and never thinner than a hairline you can click.
    const right = pct(to) + (1 / total) * 100;
    const { tone, stateLabel } = toneOf(m, to, today);

    return {
      id: m.id,
      name: m.name,
      leftPct: left,
      widthPct: Math.max(0.8, clamp(right) - left),
      tone,
      stateLabel,
      dateLabel: from === to ? shortDate(from) : `${shortDate(from)} → ${shortDate(to)}`,
      progressPct: statusOf(m) === "completed" ? 100 : Math.min(100, num(m.progress_pct)),
      dependsOn: deps.get(m.id) ?? [],
      actual: s.actual,
    };
  });

  return {
    bars,
    ticks: monthTicks(start, end, total),
    start,
    end,
    todayPct: today >= start && today <= end ? pct(today) : null,
    undated,
  };
}

/** One tick per month boundary inside the window. */
function monthTicks(start: string, end: string, totalDays: number): GanttTick[] {
  const ticks: GanttTick[] = [];
  const d = parse(start);
  d.setUTCDate(1);
  // Start at the first month boundary at or after the window's start.
  if (iso(d) < start) d.setUTCMonth(d.getUTCMonth() + 1);

  // A long plan would otherwise produce a wall of labels.
  const guard = 400;
  while (iso(d) <= end && ticks.length < guard) {
    const key = iso(d);
    ticks.push({
      key,
      label: `${MONTHS[d.getUTCMonth()]} ${`${d.getUTCFullYear()}`.slice(2)}`,
      leftPct: clamp((dayDiff(start, key) / totalDays) * 100),
    });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return ticks;
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/** The legend, stated once so the chart and its key cannot disagree. */
export const GANTT_LEGEND: { tone: BarTone; label: string }[] = [
  { tone: "done", label: "Completed" },
  { tone: "active", label: "In progress" },
  { tone: "planned", label: "Planned" },
  { tone: "late", label: "Overdue" },
];
