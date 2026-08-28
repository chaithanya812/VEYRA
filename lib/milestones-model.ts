import { completionVariance, dueVariance, pctOf, type Variance } from "./schedule-model";

/**
 * The delivery plan (PLAN-V4 §8.1 / §9.2, frames `104420` / `105010` /
 * `105024`).
 *
 * The Milestones cell on the projects list is, in the owner's words, the single
 * best idea in the competitor's product, and this file is why it works: one
 * cell answers *is this project healthy?* without opening it —
 *
 *     ● 17/72  [====----] 47.51%  |  100% est
 *     ✓ ModularWoodwork Ordering        18 Jun
 *     → Installation of Modular Woodw…   5 Aug
 *
 * count · actual against estimated · the last thing finished · the next thing
 * due. Everything here is derived from the milestone rows; nothing is stored,
 * because a stored percentage is wrong the moment someone ticks a box.
 */

export const MILESTONE_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "blocked",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};

export const MILESTONE_STATUS_TONE: Record<
  MilestoneStatus,
  "neutral" | "amber" | "green" | "red"
> = {
  not_started: "neutral",
  in_progress: "amber",
  completed: "green",
  // Blocked is a genuine alert — someone has to unblock it today.
  blocked: "red",
};

export interface ProjectMilestone {
  id: string;
  project_id: string;
  scope_item_id: string | null;
  name: string;
  status: string;
  progress_pct: number | string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  assignee_id: string | null;
  client_visible: boolean;
  last_update: string | null;
  sort_order: number;
}

export function statusOf(m: Pick<ProjectMilestone, "status">): MilestoneStatus {
  return (MILESTONE_STATUSES as readonly string[]).includes(m.status)
    ? (m.status as MilestoneStatus)
    : "not_started";
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export interface MilestoneRollup {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  blocked: number;
  /** Mean progress across every milestone — the "actual" figure. */
  actualPct: number;
  /**
   * What the plan says should be done by now, from planned end dates. The
   * competitor hardcodes "100% est"; deriving it means a project halfway
   * through its schedule reads 50%, not 100%, and the variance means something.
   */
  estimatedPct: number;
  /** The last milestone completed, by actual end date. */
  lastCompleted: ProjectMilestone | null;
  /** The next one due, by planned end date, ignoring finished work. */
  upcoming: ProjectMilestone | null;
}

export function rollupMilestones(
  milestones: ProjectMilestone[],
  now: Date = new Date(),
): MilestoneRollup {
  const total = milestones.length;
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let blocked = 0;
  let progressSum = 0;

  for (const m of milestones) {
    const s = statusOf(m);
    if (s === "completed") completed++;
    else if (s === "in_progress") inProgress++;
    else if (s === "blocked") blocked++;
    else notStarted++;
    // A completed milestone counts as 100% even if nobody typed the number.
    progressSum += s === "completed" ? 100 : Math.min(100, num(m.progress_pct));
  }

  const today = now.toISOString().slice(0, 10);
  const due = milestones.filter((m) => m.planned_end && m.planned_end <= today).length;

  const finished = milestones
    .filter((m) => statusOf(m) === "completed" && m.actual_end)
    .sort((a, b) => (b.actual_end ?? "").localeCompare(a.actual_end ?? ""));

  const pending = milestones
    .filter((m) => statusOf(m) !== "completed" && m.planned_end)
    .sort((a, b) => (a.planned_end ?? "").localeCompare(b.planned_end ?? ""));

  return {
    total,
    completed,
    inProgress,
    notStarted,
    blocked,
    actualPct: total ? Math.round((progressSum / total) * 100) / 100 : 0,
    estimatedPct: pctOf(due, total),
    lastCompleted: finished[0] ?? null,
    upcoming: pending[0] ?? null,
  };
}

/** Health, stated the way `104705` states it. */
export function scheduleHealth(
  rollup: MilestoneRollup,
): { behind: boolean; deltaPct: number; label: string } {
  const delta = Math.round((rollup.actualPct - rollup.estimatedPct) * 100) / 100;
  if (rollup.total === 0) {
    return { behind: false, deltaPct: 0, label: "No plan yet" };
  }
  if (delta < 0) {
    return {
      behind: true,
      deltaPct: delta,
      label: `Behind schedule, needs attention (▼${Math.abs(delta)}%)`,
    };
  }
  if (delta > 0) return { behind: false, deltaPct: delta, label: `${delta}% ahead` };
  return { behind: false, deltaPct: 0, label: "On plan" };
}

/** Planned vs actual for one milestone — the three-line Timeline cell. */
export function milestoneVariance(m: ProjectMilestone): Variance {
  if (statusOf(m) === "completed") return completionVariance(m.planned_end, m.actual_end);
  return dueVariance(m.planned_end);
}

export interface ScopeGroupRollup extends MilestoneRollup {
  scopeItemId: string | null;
  name: string;
  /** The band's own milestones, in sort order. */
  rows: ProjectMilestone[];
}

/**
 * Milestones banded by scope group (`105024`). The counts must sum to the
 * project total — that reconciliation is what proves the spine is carrying
 * the structure rather than the UI faking it.
 */
export function groupByScope(
  milestones: ProjectMilestone[],
  scopeNames: Map<string, string>,
  now: Date = new Date(),
): ScopeGroupRollup[] {
  const groups = new Map<string | null, ProjectMilestone[]>();
  for (const m of milestones) {
    const key = m.scope_item_id ?? null;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }

  return [...groups.entries()]
    .map(([scopeItemId, rows]) => ({
      scopeItemId,
      name: scopeItemId
        ? (scopeNames.get(scopeItemId) ?? "Unnamed scope")
        : "Default project scope",
      rows,
      ...rollupMilestones(rows, now),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
