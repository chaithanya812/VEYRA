import "server-only";
import { withOrg } from "./with-org";
import type { ScopeItem } from "@/lib/scope-model";

/**
 * The spine (PLAN-V4 §7).
 *
 * One row per thing-in-scope, and every module's line table points at it. This
 * file is deliberately small: the whole value of the spine is that downstream
 * modules stop inventing their own linkage, so what belongs here is reading a
 * project's scope and creating scope from a quotation — nothing module-specific.
 *
 * Every read goes through withOrg(); `scope_items` is registered in tables.ts.
 */

export async function listScopeItems(filter: {
  projectId?: string;
  quotationId?: string;
}): Promise<ScopeItem[]> {
  const { db } = await withOrg();
  let q = db.table("scope_items").select("*").order("sort_order", { ascending: true });
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.quotationId) q = q.eq("quotation_id", filter.quotationId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ScopeItem[];
}

/**
 * Attach a quotation's scope to a project — what "promote to project" and
 * "approve this quote" should both do. Idempotent: a scope item already owned
 * by the project is left alone.
 */
export async function attachScopeToProject(
  quotationId: string,
  projectId: string,
): Promise<{ error?: string; attached: number }> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("scope_items")
    .select("id")
    .eq("quotation_id", quotationId)
    .is("project_id", null);
  if (error) return { error: error.message, attached: 0 };

  const rows = (data ?? []) as unknown as { id: string }[];
  for (const r of rows) {
    await db.table("scope_items").updateById(r.id, { project_id: projectId });
  }
  return { attached: rows.length };
}

export interface ScopeItemInput {
  name: string;
  room?: string | null;
  uom?: string | null;
  qty?: number | null;
  parentId?: string | null;
  projectId?: string | null;
  quotationId?: string | null;
  code?: string | null;
  sortOrder?: number;
}

export async function createScopeItem(
  input: ScopeItemInput,
): Promise<{ id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "A scope item needs a name." };

  const { db } = await withOrg();
  const { data, error } = await db.table("scope_items").insert({
    name,
    room: input.room?.trim() || null,
    uom: input.uom?.trim() || null,
    // Quantities are numbers a person or an engine supplies — never an LLM.
    qty: input.qty ?? null,
    parent_id: input.parentId ?? null,
    project_id: input.projectId ?? null,
    quotation_id: input.quotationId ?? null,
    code: input.code?.trim() || null,
    sort_order: input.sortOrder ?? 0,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}
