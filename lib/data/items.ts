import "server-only";
import { withOrg } from "./with-org";
import { nameKey, codeKey } from "@/lib/utils";
import {
  ITEM_TYPES,
  UOMS,
  GST_RATES,
  type Item,
  type ItemRef,
  type ItemType,
  type Uom,
} from "@/lib/items-model";

/**
 * Item Master data module — follows the Leads reference pattern exactly: no table
 * is touched directly, everything goes through withOrg() so org_id filtering /
 * stamping is automatic and cross-tenant leakage is impossible by construction.
 *
 * Client-safe enums/types live in @/lib/items-model (this file is server-only).
 *
 * Prices (base_rate) are CONFIG entered by the user — never produced by an LLM
 * (PLAN §8). This module only stores/reads them; no amount is ever computed here.
 */
export {
  ITEM_TYPES,
  UOMS,
  GST_RATES,
  type Item,
  type ItemRef,
  type ItemType,
  type Uom,
};

const COLS =
  "id, name, code, type, category, brand, base_uom, purchase_uom, purchase_to_base_factor, base_rate, hsn_sac, tax_rate, is_active, description, created_at, updated_at";

export async function listItems(filter?: {
  type?: ItemType;
  q?: string;
  activeOnly?: boolean;
}): Promise<Item[]> {
  const { db } = await withOrg();
  let q = db.table("items").select(COLS);
  if (filter?.type) q = q.eq("type", filter.type);
  if (filter?.activeOnly) q = q.eq("is_active", true);
  if (filter?.q?.trim()) {
    const term = `%${filter.q.trim()}%`;
    q = q.or(`name.ilike.${term},code.ilike.${term},category.ilike.${term},brand.ilike.${term}`);
  }
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Item[];
}

export async function itemCounts(): Promise<{
  total: number;
  active: number;
}> {
  const { db } = await withOrg();
  const { data, error } = await db.table("items").select("is_active");
  if (error) throw error;
  const rows = (data ?? []) as unknown as { is_active: boolean }[];
  return {
    total: rows.length,
    active: rows.filter((r) => r.is_active).length,
  };
}

export async function getItem(id: string): Promise<Item | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("items")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Item) ?? null;
}

/**
 * Catalogue autocomplete — the slim reference a downstream line pulls in
 * (FEATURE-REGISTER PROC-MR-003: a line is a reference, never a free code).
 * Active items only; matched on name or code.
 */
export async function searchItems(query: string, limit = 20): Promise<ItemRef[]> {
  const term = query.trim();
  if (!term) return [];
  const { db } = await withOrg();
  const like = `%${term}%`;
  const { data, error } = await db
    .table("items")
    .select("id, name, code, type, base_uom, base_rate, tax_rate, hsn_sac")
    .eq("is_active", true)
    .or(`name.ilike.${like},code.ilike.${like}`)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ItemRef[];
}

export interface ItemInput {
  name: string;
  code?: string | null;
  type: ItemType;
  category?: string | null;
  brand?: string | null;
  base_uom: Uom;
  purchase_uom?: Uom | null;
  purchase_to_base_factor?: number | null;
  base_rate?: number | null;
  hsn_sac?: string | null;
  tax_rate?: number | null;
  description?: string | null;
}

export async function createItem(
  input: ItemInput,
): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();
  const key = nameKey(input.name);
  const code = codeKey(input.code);

  // Dedupe on the item name — matches Dzylo ("Item name already exists").
  const { data: dupName } = await db
    .table("items")
    .select("id")
    .eq("name_key", key)
    .maybeSingle();
  if (dupName) return { error: "An item with this name already exists." };

  // Dedupe on SKU when one is supplied.
  if (code) {
    const { data: dupCode } = await db
      .table("items")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (dupCode) return { error: `An item with code "${code}" already exists.` };
  }

  const { data, error } = await db.table("items").insert({
    name: input.name.trim(),
    name_key: key,
    code,
    type: input.type,
    category: input.category?.trim() || null,
    brand: input.brand?.trim() || null,
    base_uom: input.base_uom,
    purchase_uom: input.purchase_uom || null,
    purchase_to_base_factor: input.purchase_to_base_factor ?? 1,
    base_rate: input.base_rate ?? null,
    hsn_sac: input.hsn_sac?.trim() || null,
    tax_rate: input.tax_rate ?? 18,
    description: input.description?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

export async function updateItem(
  id: string,
  input: ItemInput,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const key = nameKey(input.name);
  const code = codeKey(input.code);

  // Name dedupe, excluding this row.
  const { data: nameHits } = await db
    .table("items")
    .select("id")
    .eq("name_key", key);
  const nameRows = (nameHits ?? []) as unknown as { id: string }[];
  if (nameRows.some((r) => r.id !== id)) {
    return { error: "Another item with this name already exists." };
  }
  // Code dedupe, excluding this row.
  if (code) {
    const { data: codeHits } = await db
      .table("items")
      .select("id")
      .eq("code", code);
    const codeRows = (codeHits ?? []) as unknown as { id: string }[];
    if (codeRows.some((r) => r.id !== id)) {
      return { error: `Another item with code "${code}" already exists.` };
    }
  }

  const { error } = await db.table("items").updateById(id, {
    name: input.name.trim(),
    name_key: key,
    code,
    type: input.type,
    category: input.category?.trim() || null,
    brand: input.brand?.trim() || null,
    base_uom: input.base_uom,
    purchase_uom: input.purchase_uom || null,
    purchase_to_base_factor: input.purchase_to_base_factor ?? 1,
    base_rate: input.base_rate ?? null,
    hsn_sac: input.hsn_sac?.trim() || null,
    tax_rate: input.tax_rate ?? 18,
    description: input.description?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

export async function setItemActive(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db
    .table("items")
    .updateById(id, { is_active: isActive, updated_at: new Date().toISOString() });
  return error ? { error: error.message } : {};
}
