import "server-only";
import { withOrg } from "./with-org";
import {
  DEFAULT_STAGES,
  followUpBucket,
  resolveLeadColumnIndex,
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
 * The Kanban board — one column per stage, leads grouped by status name
 * (case-insensitive). Column counts and Σ values are pure aggregations of the
 * real lead rows.
 */
export async function boardColumns(): Promise<BoardColumn[]> {
  const { db } = await withOrg();
  const [stagesRes, leadsRes] = await Promise.all([
    db.table("pipeline_stages").select("*").order("seq", { ascending: true }),
    db.table("leads").select("id,name,value,status"),
  ]);
  if (stagesRes.error) throw stagesRes.error;
  if (leadsRes.error) throw leadsRes.error;

  const stages = (stagesRes.data ?? []) as unknown as PipelineStage[];
  const leads = (leadsRes.data ?? []) as unknown as BoardLead[];

  const columns: BoardColumn[] = stages.map((stage) => ({
    stage,
    count: 0,
    value: 0,
    leads: [],
  }));
  // Map each lead to a column via the shared resolver so every lead is visible
  // (won/lost by flag, else the status→stage map, else the first column) —
  // fixes new/qualified/quoted leads silently vanishing from the board.
  for (const lead of leads) {
    const idx = resolveLeadColumnIndex(lead.status, stages);
    if (idx < 0) continue;
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
