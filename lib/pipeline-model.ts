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

/* ── The board that replaced the Kanban ───────────────────────────────────── */

/**
 * The owner, on the Kanban: *"it looks absolute garbage… you cannot put a
 * kanban board… change it."* He is right, and the reason is structural: with
 * fourteen statuses a column-per-stage board is a horizontal-scroll wall whose
 * cards carry a name and a number. Everything you actually need to triage a
 * pipeline — how long a deal has been stuck, when someone is next calling it,
 * who owns it — had nowhere to go.
 *
 * What replaces it is a funnel over a grouped table (PLAN-V4 §6), and these are
 * the two facts it can show that the board could not.
 */

export interface PipelineRow {
  id: string;
  name: string;
  project_name: string | null;
  budget_band: string | null;
  status: string;
  value: number | null;
  ownerId: string | null;
  ownerName: string | null;
  /** Next open follow-up, or null when nobody has booked one. */
  nextFollowUpAt: string | null;
  overdueFollowUps: number;
  /** When this lead entered its current status. */
  stageSince: string;
  lastActivityAt: string | null;
}

/**
 * Days on the current status. **This is the number the Kanban could never
 * show and the one that finds stuck deals** — a column tells you where a lead
 * is, never how long it has been there.
 */
export function daysInStage(row: Pick<PipelineRow, "stageSince">, now: Date = new Date()): number {
  const since = Date.parse((row.stageSince ?? "").slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(since)) return 0;
  const today = Date.parse(isoDay(now) + "T00:00:00Z");
  return Math.max(0, Math.round((today - since) / 86_400_000));
}

function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Ageing thresholds. Over 60 days is a genuine alert; over 30 is a warning. */
export function stageAgeTone(days: number): "neutral" | "amber" | "red" {
  if (days > 60) return "red";
  if (days > 30) return "amber";
  return "neutral";
}

export interface PipelineGroup {
  status: string;
  label: string;
  count: number;
  value: number;
  rows: PipelineRow[];
}

/**
 * Rows grouped by status, in the tenant's own ladder order. Live statuses with
 * no leads are kept so the ladder stays legible; a status that is retired but
 * still holds leads is kept too, at the end — dropping it would hide real
 * leads, which is exactly the failure the funnel is supposed to prevent.
 */
export function groupByStatus(
  rows: PipelineRow[],
  statuses: { value: string; label: string; seq: number; is_active: boolean }[],
): PipelineGroup[] {
  const order = new Map(statuses.map((s, i) => [s.value, i]));
  const labels = new Map(statuses.map((s) => [s.value, s.label]));

  const groups = new Map<string, PipelineGroup>();
  for (const s of statuses) {
    if (s.is_active) {
      groups.set(s.value, { status: s.value, label: s.label, count: 0, value: 0, rows: [] });
    }
  }
  for (const r of rows) {
    const g =
      groups.get(r.status) ??
      ({
        status: r.status,
        label: labels.get(r.status) ?? r.status,
        count: 0,
        value: 0,
        rows: [],
      } satisfies PipelineGroup);
    g.rows.push(r);
    g.count++;
    g.value += Number(r.value) || 0;
    groups.set(r.status, g);
  }

  return [...groups.values()].sort(
    (a, b) => (order.get(a.status) ?? 999) - (order.get(b.status) ?? 999),
  );
}
