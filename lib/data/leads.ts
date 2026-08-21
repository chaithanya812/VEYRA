import "server-only";
import { withOrg } from "./with-org";
import { phoneKey } from "@/lib/utils";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  type Lead,
  type LeadActivity,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads-model";

/**
 * Leads data module — the REFERENCE PATTERN for every module.
 * Notice: no table is ever touched directly. Everything goes through withOrg(),
 * so org_id filtering/stamping is automatic and cross-tenant leakage is
 * impossible by construction. Copy this file's shape for the next module.
 *
 * Client-safe enums/types live in @/lib/leads-model (this file is server-only).
 */
export {
  LEAD_SOURCES,
  LEAD_STATUSES,
  type Lead,
  type LeadActivity,
  type LeadSource,
  type LeadStatus,
};

export async function listLeads(filter?: {
  status?: LeadStatus;
}): Promise<Lead[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("leads").select("*");
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Lead[];
}

export async function leadCounts(): Promise<{
  total: number;
  pipelineValue: number;
}> {
  const { db } = await withOrg();
  const { data, error } = await db.table("leads").select("value");
  if (error) throw error;
  const rows = (data ?? []) as unknown as { value: number | null }[];
  return {
    total: rows.length,
    pipelineValue: rows.reduce((s, r) => s + (Number(r.value) || 0), 0),
  };
}

export async function getLead(
  id: string,
): Promise<{ lead: Lead; activities: LeadActivity[] } | null> {
  const { db } = await withOrg();
  const { data: lead, error } = await db
    .table("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!lead) return null;

  const { data: activities } = await db
    .table("lead_activities")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  return {
    lead: lead as unknown as Lead,
    activities: (activities ?? []) as unknown as LeadActivity[],
  };
}

export async function createLead(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  source: LeadSource;
  value?: number | null;
  notes?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();
  const key = phoneKey(input.phone);

  // Dedupe on phone (PLAN §6.1). One lead per normalised phone per org.
  if (key) {
    const { data: existing } = await db
      .table("leads")
      .select("id")
      .eq("phone_key", key)
      .maybeSingle();
    if (existing) {
      return { error: "A lead with this phone number already exists." };
    }
  }

  const { data, error } = await db.table("leads").insert({
    name: input.name,
    phone: input.phone ?? null,
    phone_key: key,
    email: input.email ?? null,
    source: input.source,
    value: input.value ?? null,
    notes: input.notes ?? null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;
  await db.table("lead_activities").insert({
    lead_id: id,
    kind: "created",
    note: `Lead created via ${input.source}`,
    created_by: ctx.userId,
  });
  return { id };
}

export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { error } = await db
    .table("leads")
    .updateById(id, { status, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };

  await db.table("lead_activities").insert({
    lead_id: id,
    kind: "status_change",
    note: `Status changed to ${status}`,
    created_by: ctx.userId,
  });
  return {};
}

export async function addLeadNote(
  id: string,
  note: string,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { error } = await db.table("lead_activities").insert({
    lead_id: id,
    kind: "note",
    note,
    created_by: ctx.userId,
  });
  return error ? { error: error.message } : {};
}
