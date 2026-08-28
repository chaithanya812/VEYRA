import "server-only";
import { admin } from "@/lib/supabase/admin";
import { withOrg } from "./with-org";
import { listScopeItems } from "./scope-items";
import { num, orderableScope, scopeLabel } from "@/lib/scope-model";
import {
  MR_STAGES,
  MR_SOURCES,
  type CatalogueMatch,
  type MaterialRequest,
  type MaterialRequestItem,
  type MRSource,
  type MRStage,
} from "@/lib/material-requests-model";

/**
 * Material Requests data module (Procurement · FEATURE-REGISTER PROC-MR-001/003).
 * Follows the Leads reference pattern exactly: no table is ever touched
 * directly — everything goes through withOrg(), so org_id filtering/stamping is
 * automatic and cross-tenant leakage is impossible by construction.
 *
 * The line grid is catalogue-first: a line carries item_id → items when it
 * matches the catalogue; anything else is a FLAGGED ad-hoc line (is_adhoc =
 * true, label kept) — never a silent free string. Quantities only: this module
 * stores NO price/amount anywhere and calls nothing AI.
 *
 * Client-safe enums/types live in @/lib/material-requests-model (this file is
 * server-only).
 */
export {
  MR_STAGES,
  MR_SOURCES,
  type CatalogueMatch,
  type MaterialRequest,
  type MaterialRequestItem,
  type MRSource,
  type MRStage,
};

/* ── Reads ─────────────────────────────────────────────────────────────────── */

export async function listMaterialRequests(filter?: {
  stage?: string;
  draftsOnly?: boolean;
}): Promise<MaterialRequest[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("material_requests").select("*");
  if (filter?.stage) q = q.eq("stage", filter.stage);
  if (filter?.draftsOnly) q = q.eq("stage", "draft");
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MaterialRequest[];
}

export async function getMaterialRequest(
  id: string,
): Promise<{ mr: MaterialRequest; items: MaterialRequestItem[] } | null> {
  const { db } = await withOrg();
  const { data: mr, error } = await db
    .table("material_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!mr) return null;

  const { data: items } = await db
    .table("material_request_items")
    .select("*")
    .eq("mr_id", id)
    .order("created_at", { ascending: true });

  return {
    mr: mr as unknown as MaterialRequest,
    items: (items ?? []) as unknown as MaterialRequestItem[],
  };
}

/**
 * Catalogue autocomplete for the line grid — reads the Item master through
 * withOrg (`items` is on the tenant allowlist), active items matched by name,
 * slim shape only (no rates — an MR never carries prices).
 */
export async function searchCatalogueItems(
  query: string,
): Promise<CatalogueMatch[]> {
  const term = query.trim();
  if (!term) return [];
  const { db } = await withOrg();
  const like = `%${term}%`;
  const { data, error } = await db
    .table("items")
    .select("id, name, base_uom")
    .eq("is_active", true)
    .ilike("name", like)
    .order("name", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as CatalogueMatch[];
}

/** Display labels for created_by ids ("Created By" column) from app_users. */
export async function mrCreatorNames(
  userIds: (string | null)[],
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return {};
  // Platform profile mirror — read-only, presentational; lib/data may touch
  // the raw client (same precedent as getSharedQuotation in quotations.ts).
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

/* ── Writes ────────────────────────────────────────────────────────────────── */

export interface MRItemInput {
  item_id?: string | null;
  item_name: string;
  is_adhoc?: boolean;
  uom?: string | null;
  qty: number;
  remarks?: string | null;
}

export async function createMaterialRequest(input: {
  title: string;
  project_label?: string | null;
  expected_delivery?: string | null;
  source?: MRSource;
  remarks?: string | null;
  items: MRItemInput[];
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const { data, error } = await db
    .table("material_requests")
    .insert({
      title: input.title.trim(),
      project_label: input.project_label?.trim() || null,
      expected_delivery: input.expected_delivery || null,
      source: input.source ?? "manual",
      remarks: input.remarks?.trim() || null,
      stage: "draft",
      created_by: ctx.userId,
    });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  const lines = (input.items ?? [])
    .filter((it) => it.item_name.trim())
    .map((it) => ({
      mr_id: id,
      // No catalogue match ⇒ flagged ad-hoc, never a silent free string.
      item_id: it.item_id || null,
      item_name: it.item_name.trim(),
      is_adhoc: !it.item_id ? true : (it.is_adhoc ?? false),
      uom: it.uom?.trim() || null,
      qty: Number(it.qty) || 0,
      remarks: it.remarks?.trim() || null,
    }));
  if (lines.length > 0) {
    const { error: lineErr } = await db
      .table("material_request_items")
      .insert(lines);
    if (lineErr) return { error: lineErr.message };
  }

  return { id };
}

export async function updateMRStage(
  id: string,
  stage: MRStage,
): Promise<{ error?: string }> {
  if (!MR_STAGES.includes(stage)) return { error: "Invalid stage." };
  const { db } = await withOrg();
  const { error } = await db
    .table("material_requests")
    .updateById(id, { stage, updated_at: new Date().toISOString() });
  return error ? { error: error.message } : {};
}

export async function addMRItem(
  mrId: string,
  item: MRItemInput,
): Promise<{ error?: string }> {
  const name = item.item_name.trim();
  if (!name) return { error: "Item name is required." };
  const { db } = await withOrg();
  const { error } = await db.table("material_request_items").insert({
    mr_id: mrId,
    item_id: item.item_id || null,
    item_name: name,
    is_adhoc: !item.item_id ? true : (item.is_adhoc ?? false),
    uom: item.uom?.trim() || null,
    qty: Number(item.qty) || 0,
    remarks: item.remarks?.trim() || null,
  });
  return error ? { error: error.message } : {};
}

export async function removeMRItem(itemId: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db
    .table("material_request_items")
    .deleteById(itemId);
  return error ? { error: error.message } : {};
}

/* ── The spine's proof (PLAN-V4 §7.4) ─────────────────────────────────────── */

/**
 * Approved quotation → draft Material Request, with the lines coming from the
 * quotation's own `scope_items` rather than being re-typed.
 *
 * This function IS the test of §7. The plan says: *"if that button is more
 * than ~40 lines, the spine is not right."* The body below is thirty. Every
 * item it creates carries `scope_item_id`, so from here on the material
 * requested is joinable to the line it was sold on — and, once the PO and the
 * cutlist point at the same scope item, to what was bought and cut too.
 *
 * No prices cross over. An MR is a request for quantities; rates arrive from
 * the RFQ.
 */
export async function createMaterialRequestFromQuotation(
  quotationId: string,
): Promise<{ id?: string; error?: string; skipped?: number }> {
  const { db, ctx } = await withOrg();

  const { data: quote, error: quoteErr } = await db
    .table("quotations")
    .select("id, title, status, project_id, customer_name")
    .eq("id", quotationId)
    .maybeSingle();
  // Report a query error as itself. Collapsing it into "not in this workspace"
  // sent me chasing a tenancy bug that was really a mistyped column.
  if (quoteErr) return { error: quoteErr.message };
  if (!quote) return { error: "That quotation is not in this workspace." };
  const q = quote as unknown as {
    id: string;
    title: string | null;
    status: string;
    project_id: string | null;
    customer_name: string | null;
  };
  if (q.status !== "approved") {
    return { error: "Only an approved quotation can raise a material request." };
  }

  const scope = await listScopeItems({ quotationId });
  const orderable = orderableScope(scope);
  if (orderable.length === 0) {
    return { error: "This quotation has no scope lines with a quantity." };
  }

  const { data, error } = await db.table("material_requests").insert({
    title: `Material for ${q.title || "quotation"}`,
    project_id: q.project_id,
    // The label is a display fallback only (migration 0028); the FK above is
    // what every read joins on.
    project_label: null,
    source: "quotation",
    stage: "draft",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  const id = (data?.[0] as { id: string }).id;

  const { error: lineErr } = await db.table("material_request_items").insert(
    orderable.map((s) => ({
      mr_id: id,
      scope_item_id: s.id,
      item_name: scopeLabel(s),
      is_adhoc: true,
      uom: s.uom,
      qty: num(s.qty),
    })),
  );
  if (lineErr) return { error: lineErr.message };

  return { id, skipped: scope.length - orderable.length };
}
