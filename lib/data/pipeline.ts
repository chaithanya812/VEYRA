import "server-only";
import { withOrg } from "./with-org";
import { listLeadStatuses } from "./lead-management";
import {
  DEFAULT_STAGES,
  followUpBucket,
  type FollowUp,
  type FollowUpBucket,
  type PipelineStage,
} from "@/lib/pipeline-model";

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

export async function listStages(): Promise<PipelineStage[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("pipeline_stages")
    .select("*")
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PipelineStage[];
}

/** Seed the tenant's pipeline once, on first board visit. Idempotent. */
export async function ensureDefaultStages(): Promise<void> {
  const { db } = await withOrg();
  const { data, error } = await db.table("pipeline_stages").select("id").limit(1);
  if (error) throw error;
  if (data && data.length > 0) return;
  const { error: insErr } = await db.table("pipeline_stages").insert(
    DEFAULT_STAGES.map((s, i) => ({
      name: s.name,
      seq: i,
      is_won: s.is_won ?? false,
      is_lost: s.is_lost ?? false,
    })),
  );
  // Lost a concurrent seed race → the other insert won, which is fine.
  if (insErr && insErr.code !== "23505") throw insErr;
}

export async function createStage(input: {
  name: string;
  seq?: number;
}): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();
  const name = input.name.trim();
  if (!name) return { error: "Stage name is required." };

  let seq = input.seq;
  if (seq == null) {
    // Append at the end of the board.
    const { data: last } = await db
      .table("pipeline_stages")
      .select("seq")
      .order("seq", { ascending: false })
      .limit(1);
    const lastRows = (last ?? []) as unknown as { seq: number }[];
    seq = lastRows.length > 0 ? Number(lastRows[0].seq) + 1 : 0;
  }

  const { data, error } = await db
    .table("pipeline_stages")
    .insert({ name, seq, is_won: false, is_lost: false });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A stage with this name already exists."
          : error.message,
    };
  }
  return { id: (data?.[0] as { id: string }).id };
}

export async function reorderStage(
  id: string,
  seq: number,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("pipeline_stages").updateById(id, { seq });
  return error ? { error: error.message } : {};
}

export async function deleteStage(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("pipeline_stages").deleteById(id);
  return error ? { error: error.message } : {};
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
