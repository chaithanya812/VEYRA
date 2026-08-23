import "server-only";
import { withOrg } from "./with-org";
import { admin } from "@/lib/supabase/admin";
import {
  needsApproval,
  type ApprovalModule,
  type ApprovalRequest,
  type ApprovalRule,
  type ApprovalStatus,
} from "@/lib/approvals-model";

/**
 * Approvals data module — the generic threshold engine's persistence layer
 * (FEATURE-REGISTER PROC-APP-001). Same shape as leads.ts: every tenant
 * read/write goes through withOrg(), so `org_id` filtering/stamping is
 * automatic and cross-tenant leakage is impossible by construction.
 *
 * Client-safe enums/types/pure helpers live in @/lib/approvals-model (this
 * file is server-only). Decisions stamp decided_by/decided_at; reject requires
 * a non-empty comment (enforced here AND in the action layer).
 */

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function listRequests(filter?: {
  status?: ApprovalStatus;
  module?: ApprovalModule;
}): Promise<ApprovalRequest[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("approval_requests").select("*");
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.module) q = q.eq("module", filter.module);
  const { data, error } = await q.order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ApprovalRequest[];
}

export async function getRequest(
  id: string,
): Promise<ApprovalRequest | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("approval_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ApprovalRequest) ?? null;
}

export async function listRules(): Promise<ApprovalRule[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("approval_rules")
    .select("*")
    .order("module", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ApprovalRule[];
}

/**
 * The active rule for a module, if any — the lookup other modules call before
 * creating a draft ("does this PO need sign-off?"). Pure decision in
 * needsApproval(); this only fetches config.
 */
export async function activeRuleFor(
  module: ApprovalModule,
): Promise<{ threshold_amount: number; is_active: boolean } | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("approval_rules")
    .select("*")
    .eq("module", module)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rule = data as unknown as ApprovalRule;
  return rule.is_active
    ? { threshold_amount: Number(rule.threshold_amount), is_active: true }
    : { threshold_amount: Number(rule.threshold_amount), is_active: false };
}

/** Convenience over the pure helper, for callers that already hold the rule. */
export function shouldRouteToApproval(
  amount: number,
  rule: { threshold_amount: number; is_active: boolean } | null,
): boolean {
  return needsApproval(amount, rule);
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

export async function createRequest(input: {
  module: ApprovalModule;
  entity_id?: string | null;
  entity_label?: string | null;
  amount: number;
}): Promise<{ id?: string; error?: string }> {
  const { db, ctx } = await withOrg();

  // The gate decision (needsApproval) is the CALLER's — a module consults its
  // rule via activeRuleFor() and only raises a request when the pure helper
  // says so. This keeps the ledger honest: every row here was deliberately
  // routed to approval, and requested_by is stamped server-side.
  const { data, error } = await db.table("approval_requests").insert({
    module: input.module,
    entity_id: input.entity_id ?? null,
    entity_label: input.entity_label ?? null,
    amount: input.amount,
    status: "pending",
    requested_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

export async function approveRequest(
  id: string,
  comment?: string | null,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();

  const request = await getRequest(id);
  if (!request) return { error: "Approval request not found." };
  if (request.status !== "pending") {
    return { error: `Already ${request.status} — decisions are final.` };
  }

  const now = new Date().toISOString();
  const { error } = await db.table("approval_requests").updateById(id, {
    status: "approved",
    decided_by: ctx.userId,
    decision_comment: comment?.trim() || null,
    decided_at: now,
  });
  return error ? { error: error.message } : {};
}

export async function rejectRequest(
  id: string,
  comment: string,
): Promise<{ error?: string }> {
  const trimmed = (comment ?? "").trim();
  if (!trimmed) return { error: "A comment is required when rejecting." };

  const { db, ctx } = await withOrg();

  const request = await getRequest(id);
  if (!request) return { error: "Approval request not found." };
  if (request.status !== "pending") {
    return { error: `Already ${request.status} — decisions are final.` };
  }

  const now = new Date().toISOString();
  const { error } = await db.table("approval_requests").updateById(id, {
    status: "rejected",
    decided_by: ctx.userId,
    decision_comment: trimmed,
    decided_at: now,
  });
  return error ? { error: error.message } : {};
}

/** Insert or update by (org, module). Mirrors the numbering-series upsert.
 *  `is_active` is optional so existing callers passing just module/threshold/
 *  role keep working; on first insert an omitted flag falls back to the DB
 *  default (true). */
export async function upsertRule(input: {
  module: ApprovalModule;
  threshold_amount: number;
  approver_role?: string | null;
  is_active?: boolean;
}): Promise<{ error?: string }> {
  const { db } = await withOrg();

  const { data: existing } = await db
    .table("approval_rules")
    .select("id")
    .eq("module", input.module)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    threshold_amount: input.threshold_amount,
    approver_role: input.approver_role?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  if (existing) {
    const { error } = await db
      .table("approval_rules")
      .updateById((existing as unknown as { id: string }).id, patch);
    return error ? { error: error.message } : {};
  }

  const { error } = await db.table("approval_rules").insert({
    module: input.module,
    ...patch,
  });
  return error ? { error: error.message } : {};
}

/* ── Presentational helper ────────────────────────────────────────────────── */

/** Display labels for requested_by/decided_by ids from app_users (read-only,
 *  presentational — same precedent as mrCreatorNames in material-requests.ts). */
export async function approvalUserNames(
  userIds: (string | null)[],
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return {};
  const { data, error } = await admin
    .from("app_users")
    .select("id, full_name, email")
    .in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    id: string;
    full_name: string | null;
    email: string | null;
  }[];
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.id] = r.full_name?.trim() || r.email?.split("@")[0] || r.id.slice(0, 8);
  }
  return map;
}
