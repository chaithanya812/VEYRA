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
 * Per-stage count + Σ value for the Kanban column headers — pure SUMs of
 * leads.value (never invented). Leads whose status matches no stage name
 * (case-insensitive) are not counted in any column. One row per stage name,
 * in the given order.
 */
export function stageColumnTotals(
  leads: { status: string; value: number | null }[],
  stageNames: string[],
): { stage: string; count: number; value: number }[] {
  const buckets = new Map<string, { count: number; value: number }>();
  for (const name of stageNames) {
    buckets.set(name.trim().toLowerCase(), { count: 0, value: 0 });
  }
  for (const lead of leads) {
    const bucket = buckets.get((lead.status ?? "").trim().toLowerCase());
    if (!bucket) continue;
    bucket.count += 1;
    bucket.value += Number(lead.value) || 0;
  }
  return stageNames.map((name) => {
    const bucket = buckets.get(name.trim().toLowerCase());
    return { stage: name, count: bucket?.count ?? 0, value: bucket?.value ?? 0 };
  });
}
