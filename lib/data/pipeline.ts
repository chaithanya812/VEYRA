import "server-only";
import { withOrg } from "./with-org";
import { listLeadStatuses } from "./lead-management";
import { listMembers } from "./team";
import { listOptions } from "./workspace";
import {
  followUpBucket,
  type FollowUp,
  type FollowUpBucket,
  type PipelineRow,
  type PipelineStage,
} from "@/lib/pipeline-model";
import type { LeadStatusDef } from "@/lib/lead-management-model";
import type { WorkspaceOption } from "@/lib/workspace-model";

/**
 * CRM Pipeline data module — OPS-CRM-002/003 + OPS-HR-001.
 * Copies lib/data/leads.ts's shape exactly: no table is ever touched directly.
 * Everything goes through withOrg(), so org_id filtering/stamping is automatic
 * and cross-tenant leakage is impossible by construction. Leads are READ here
 * (db.table("leads")) — lib/data/leads.ts itself is never modified.
 *
 * Client-safe types/helpers live in @/lib/pipeline-model (this file is
 * server-only).
 */

interface BoardLead {
  id: string;
  name: string;
  value: number | null;
  status: string;
}

export interface BoardColumn {
  stage: PipelineStage;
  count: number;
  value: number;
  leads: BoardLead[];
}

/**
 * The Kanban board — one column per LEAD STATUS.
 *
 * Statuses used to live in two places: `pipeline_stages` (display names) and,
 * since migration 0024, `lead_statuses` (the slugs `leads.status` actually
 * stores). Two ladders meant a lead could sit on "negotiation" while the board
 * only knew a column called "Negotiation", so it silently fell into the first
 * column. `lead_statuses` is now the single source of truth and the board reads
 * it directly — the slug a lead stores IS the column it appears in.
 *
 * Counts and Σ values are pure aggregations of the real rows.
 */
export async function boardColumns(): Promise<BoardColumn[]> {
  const { db } = await withOrg();
  const [statuses, leadsRes] = await Promise.all([
    listLeadStatuses(),
    db.table("leads").select("id,name,value,status"),
  ]);
  if (leadsRes.error) throw leadsRes.error;

  const leads = (leadsRes.data ?? []) as unknown as BoardLead[];
  const active = statuses.filter((s) => s.is_active);

  // Present each status as the PipelineStage shape the board component expects,
  // so the column rendering is unchanged.
  const columns: BoardColumn[] = active.map((s) => ({
    stage: {
      id: s.id,
      name: s.label,
      seq: s.seq,
      is_won: s.is_won,
      is_lost: s.is_lost,
      created_at: new Date(0).toISOString(),
    },
    count: 0,
    value: 0,
    leads: [],
  }));
  if (columns.length === 0) return columns;

  const indexOf = new Map(active.map((s, i) => [s.value, i]));
  for (const lead of leads) {
    // An unknown status (a retired one, or data from before 0024) lands in the
    // first column rather than disappearing from the board entirely.
    const idx = indexOf.get(lead.status) ?? 0;
    const col = columns[idx];
    col.leads.push(lead);
    col.count += 1;
    col.value += Number(lead.value) || 0;
  }
  return columns;
}

export async function listFollowUps(filter?: {
  bucket?: FollowUpBucket;
}): Promise<(FollowUp & { lead_name?: string })[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("follow_ups")
    .select("*")
    .order("due_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as FollowUp[];

  // Join lead names with a second org-scoped query.
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id))).filter(Boolean);
  const names = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await db
      .table("leads")
      .select("id,name")
      .in("id", leadIds);
    for (const l of (leads ?? []) as unknown as { id: string; name: string }[]) {
      names.set(l.id, l.name);
    }
  }

  const enriched = rows.map((r) => ({ ...r, lead_name: names.get(r.lead_id) }));
  if (!filter?.bucket) return enriched;
  return enriched.filter((r) => followUpBucket(r.due_at, r.done) === filter.bucket);
}

export async function createFollowUp(input: {
  lead_id: string;
  due_at: string;
  note?: string | null;
  assigned_to?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();
  const due = new Date(input.due_at);
  if (Number.isNaN(due.getTime())) return { error: "Enter a valid due date." };
  const { data, error } = await db.table("follow_ups").insert({
    lead_id: input.lead_id,
    due_at: due.toISOString(),
    note: input.note ?? null,
    assigned_to: input.assigned_to ?? null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

export async function completeFollowUp(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("follow_ups").updateById(id, { done: true });
  return error ? { error: error.message } : {};
}

/* ── The board that replaced the Kanban (PLAN-V4 §6) ──────────────────────── */

export interface PipelineBoardData {
  rows: PipelineRow[];
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
  total: number;
  value: number;
}

/**
 * Everything the funnel-over-a-table needs, in four org-scoped reads.
 *
 * `stageSince` is derived from the lead's own activity feed — the most recent
 * `status_change`, falling back to when the lead was created, because that is
 * when it entered its first stage. That derivation is the whole point of the
 * new board: "days in stage" is the number that finds stuck deals, and no
 * column on a Kanban can show it.
 */
export async function getPipelineBoard(): Promise<PipelineBoardData> {
  const { db } = await withOrg();

  const [statuses, options, members, leadsRes] = await Promise.all([
    listLeadStatuses(),
    listOptions(),
    listMembers(),
    db
      .table("leads")
      .select(
        "id, name, project_name, budget_band, status, value, sales_owner_id, assigned_to, created_at",
      )
      .order("created_at", { ascending: false }),
  ]);
  if (leadsRes.error) throw leadsRes.error;

  const leads = (leadsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    project_name: string | null;
    budget_band: string | null;
    status: string;
    value: number | null;
    sales_owner_id: string | null;
    assigned_to: string | null;
    created_at: string;
  }[];
  const ids = leads.map((l) => l.id);

  const [activityRes, followUpRes] = await Promise.all([
    ids.length
      ? db
          .table("lead_activities")
          .select("lead_id, kind, created_at")
          .in("lead_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    ids.length
      ? db
          .table("follow_ups")
          .select("lead_id, due_at, status, done")
          .in("lead_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  const lastStatusChange = new Map<string, string>();
  const lastActivity = new Map<string, string>();
  for (const a of (activityRes.data ?? []) as unknown as {
    lead_id: string;
    kind: string;
    created_at: string;
  }[]) {
    // Rows arrive newest-first, so the first sighting of each lead wins.
    if (!lastActivity.has(a.lead_id)) lastActivity.set(a.lead_id, a.created_at);
    if (a.kind === "status_change" && !lastStatusChange.has(a.lead_id)) {
      lastStatusChange.set(a.lead_id, a.created_at);
    }
  }

  const now = new Date();
  const nextDue = new Map<string, string>();
  const overdue = new Map<string, number>();
  for (const f of (followUpRes.data ?? []) as unknown as {
    lead_id: string;
    due_at: string;
    status: string;
    done: boolean;
  }[]) {
    const open = !f.done && f.status !== "completed" && f.status !== "cancelled";
    if (!open) continue;
    const due = new Date(f.due_at);
    if (due < now) overdue.set(f.lead_id, (overdue.get(f.lead_id) ?? 0) + 1);
    const current = nextDue.get(f.lead_id);
    if (!current || f.due_at < current) nextDue.set(f.lead_id, f.due_at);
  }

  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const rows: PipelineRow[] = leads.map((l) => {
    const ownerId = l.sales_owner_id ?? l.assigned_to ?? null;
    return {
      id: l.id,
      name: l.name,
      project_name: l.project_name,
      budget_band: l.budget_band,
      status: l.status,
      value: l.value,
      ownerId: ownerId && nameById.has(ownerId) ? ownerId : null,
      ownerName: ownerId ? (nameById.get(ownerId) ?? null) : null,
      nextFollowUpAt: nextDue.get(l.id) ?? null,
      overdueFollowUps: overdue.get(l.id) ?? 0,
      stageSince: lastStatusChange.get(l.id) ?? l.created_at,
      lastActivityAt: lastActivity.get(l.id) ?? null,
    };
  });

  return {
    rows,
    statuses,
    options,
    total: rows.length,
    value: rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0),
  };
}
