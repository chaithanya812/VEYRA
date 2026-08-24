/**
 * Client-safe pipeline model — types and pure helpers with NO server-only
 * import, so client components (forms, board UI) and the server data module
 * can share them. The server logic lives in lib/data/pipeline.ts.
 *
 * No LLM produces a number here: column totals are pure SUMs of leads.value
 * computed by stageColumnTotals.
 */

export interface StageSeed {
  name: string;
  is_won?: boolean;
  is_lost?: boolean;
}

/** The default tenant pipeline, in board order (OPS-CRM-002). */
export const DEFAULT_STAGES: StageSeed[] = [
  { name: "New Inquiry" },
  { name: "Contacted" },
  { name: "Site Measurement" },
  { name: "Design Pitch" },
  { name: "Quotation" },
  { name: "Negotiation" },
  { name: "Won", is_won: true },
  { name: "Lost", is_lost: true },
];

export interface PipelineStage {
  id: string;
  name: string;
  seq: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  due_at: string;
  done: boolean;
  note: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
}

export type FollowUpBucket = "overdue" | "today" | "upcoming" | "done";

export const FOLLOW_UP_BUCKETS: FollowUpBucket[] = [
  "overdue",
  "today",
  "upcoming",
  "done",
];

export const bucketLabel: Record<FollowUpBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  done: "Done",
};

/**
 * Bucket a follow-up for the scheduler (OPS-HR-001).
 * Order matters: done wins; then past-due is 'overdue' even later today;
 * the rest of the current calendar day is 'today'; anything further out is
 * 'upcoming'.
 */
export function followUpBucket(
  dueAt: string,
  done: boolean,
  now: Date = new Date(),
): FollowUpBucket {
  if (done) return "done";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "upcoming";
  if (due.getTime() < now.getTime()) return "overdue";
  const sameDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  return sameDay ? "today" : "upcoming";
}

/**
 * Canonical lead-status → default-stage-name map (OPS-CRM-002). The lead status
 * enum (new/contacted/qualified/quoted/won/lost) is coarser than the
 * configurable stage list, so this maps each status to its home stage. Stages
 * the status vocabulary doesn't reach (Site Measurement, Negotiation) stay valid
 * but empty until finer stage tracking lands.
 */
export const STATUS_TO_STAGE_NAME: Record<string, string> = {
  new: "New Inquiry",
  contacted: "Contacted",
  qualified: "Design Pitch",
  quoted: "Quotation",
  won: "Won",
  lost: "Lost",
};

/**
 * Resolve which board column (index into `stages`) a lead belongs in — the fix
 * for the status↔stage vocabulary mismatch that used to make new/qualified/
 * quoted leads invisible. Resolution order:
 *   1. won/lost → the stage flagged is_won/is_lost (rename-safe),
 *   2. the STATUS_TO_STAGE_NAME mapping (by stage name),
 *   3. a direct status==stage-name match (custom stages named like a status),
 *   4. fallback to the FIRST column — a lead is NEVER dropped off the board.
 * Returns -1 only when there are no stages at all.
 */
export function resolveLeadColumnIndex(
  status: string,
  stages: { name: string; is_won?: boolean; is_lost?: boolean }[],
): number {
  if (stages.length === 0) return -1;
  const s = (status ?? "").trim().toLowerCase();
  if (s === "won") {
    const i = stages.findIndex((st) => st.is_won);
    if (i >= 0) return i;
  }
  if (s === "lost") {
    const i = stages.findIndex((st) => st.is_lost);
    if (i >= 0) return i;
  }
  const target = (STATUS_TO_STAGE_NAME[s] ?? s).trim().toLowerCase();
  const byMap = stages.findIndex((st) => st.name.trim().toLowerCase() === target);
  if (byMap >= 0) return byMap;
  const byName = stages.findIndex((st) => st.name.trim().toLowerCase() === s);
  if (byName >= 0) return byName;
  return 0; // never drop a lead
}

/**
 * Per-stage count + Σ value for the Kanban column headers — pure SUMs of
 * leads.value (never invented). Uses resolveLeadColumnIndex so every lead lands
 * in exactly one column. One row per stage name, in the given order.
 */
export function stageColumnTotals(
  leads: { status: string; value: number | null }[],
  stages: (string | StageSeed)[],
): { stage: string; count: number; value: number }[] {
  const seeds: StageSeed[] = stages.map((s) =>
    typeof s === "string" ? { name: s } : s,
  );
  const totals = seeds.map(() => ({ count: 0, value: 0 }));
  for (const lead of leads) {
    const idx = resolveLeadColumnIndex(lead.status, seeds);
    if (idx < 0) continue;
    totals[idx].count += 1;
    totals[idx].value += Number(lead.value) || 0;
  }
  return seeds.map((s, i) => ({
    stage: s.name,
    count: totals[i].count,
    value: totals[i].value,
  }));
}
