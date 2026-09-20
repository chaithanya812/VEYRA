import "server-only";
import { guardMeteredCreate, recordUsage } from "./subscription";
import { withOrg } from "./with-org";
import { nameKey, codeKey } from "@/lib/utils";
import {
  ITEM_TYPES,
  UOMS,
  GST_RATES,
  SUGGESTED_CATEGORIES,
  SUGGESTED_GOOD_TYPES,
  lastPrice,
  type Item,
  type ItemRef,
  type ItemType,
  type Uom,
  type BulkItemOutcome,
  type BulkCreateResult,
} from "@/lib/items-model";
import { parseItemsCsv, type CsvItemValues } from "@/lib/items-csv";

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
  SUGGESTED_CATEGORIES,
  SUGGESTED_GOOD_TYPES,
  lastPrice,
  type Item,
  type ItemRef,
  type ItemType,
  type Uom,
  type BulkItemOutcome,
  type BulkCreateResult,
};

const COLS =
  "id, name, code, type, category, good_type, brand, base_uom, purchase_uom, purchase_to_base_factor, base_rate, hsn_sac, tax_rate, is_active, description, created_at, updated_at";

export async function listItems(filter?: {
  type?: ItemType;
  q?: string;
  activeOnly?: boolean;
  category?: string;
  good_type?: string;
}): Promise<Item[]> {
  const { db } = await withOrg();
  let q = db.table("items").select(COLS);
  if (filter?.type) q = q.eq("type", filter.type);
  if (filter?.activeOnly) q = q.eq("is_active", true);
  if (filter?.category?.trim()) q = q.eq("category", filter.category.trim());
  if (filter?.good_type?.trim()) q = q.eq("good_type", filter.good_type.trim());
  if (filter?.q?.trim()) {
    const term = `%${filter.q.trim()}%`;
    q = q.or(
      `name.ilike.${term},code.ilike.${term},category.ilike.${term},brand.ilike.${term},good_type.ilike.${term}`,
    );
  }
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Item[];
}

/** Distinct category / good_type values in this org, unioned with the suggested vocab. */
export async function listItemTaxonomy(): Promise<{
  categories: string[];
  goodTypes: string[];
}> {
  const { db } = await withOrg();
  const { data, error } = await db.table("items").select("category, good_type");
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    category: string | null;
    good_type: string | null;
  }[];
  const categories = new Set<string>(SUGGESTED_CATEGORIES);
  const goodTypes = new Set<string>(SUGGESTED_GOOD_TYPES);
  for (const r of rows) {
    if (r.category?.trim()) categories.add(r.category.trim());
    if (r.good_type?.trim()) goodTypes.add(r.good_type.trim());
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    categories: [...categories].sort(byName),
    goodTypes: [...goodTypes].sort(byName),
  };
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
  good_type?: string | null;
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
  // Gate BEFORE the write: a create that lands over the limit makes the
  // ledger disagree with the data it is supposed to be counting.
  const gate = await guardMeteredCreate("items");
  if (gate.error) return { error: gate.error };
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
    good_type: input.good_type?.trim() || null,
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
  const newId = (data?.[0] as { id: string }).id;
  await recordUsage("items", 1, newId);
  return { id: newId };
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
    good_type: input.good_type?.trim() || null,
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

/**
 * Promote an unlisted name into the catalogue, or attach an existing row of
 * the same name. Create still goes through createItem (org stamp, name/code
 * dedupe, metered-create gate). A race on the unique name index is resolved
 * by re-reading rather than returning a false error.
 */
export async function findOrCreateItem(
  input: ItemInput,
): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();
  const key = nameKey(input.name);
  const { data, error } = await db
    .table("items")
    .select("id")
    .eq("name_key", key)
    .maybeSingle();
  if (error) return { error: error.message };
  if (data) return { id: (data as unknown as { id: string }).id };

  const created = await createItem(input);
  if ("id" in created) return created;

  const { data: again, error: againErr } = await db
    .table("items")
    .select("id")
    .eq("name_key", key)
    .maybeSingle();
  if (againErr) return { error: againErr.message };
  if (again) return { id: (again as unknown as { id: string }).id };
  return created;
}

/**
 * Newest stock_movements.unit_rate for this item. Derived at read time —
 * there is no last_price column.
 */
export async function itemLastPrice(itemId: string): Promise<number | null> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("stock_movements")
    .select("unit_rate, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { unit_rate: number; created_at: string }[];
  return lastPrice(rows);
}

/**
 * Bulk-import items from CSV text. Parses + validates client-side-style, then
 * inserts only the new ones through the SAME createItem path (which also enforces
 * name/code dedupe and stamps org_id via withOrg). Every failure is reported
 * per-row — nothing is silently dropped.
 */
export async function bulkCreateItems(csv: string): Promise<BulkCreateResult> {
  const { rows } = parseItemsCsv(csv);

  // Snapshot the org's existing catalogue to flag duplicates up-front.
  const { db } = await withOrg();
  const { data, error } = await db.table("items").select("name_key, code");
  if (error) throw error;
  const existing = (data ?? []) as unknown as { name_key: string; code: string | null }[];
  const existingNameKeys = new Set(existing.map((r) => r.name_key));
  const existingCodes = new Set(
    existing.map((r) => r.code).filter((c): c is string => !!c),
  );

  // Track what we've already accepted within this batch.
  const usedNameKeys = new Set<string>();
  const usedCodes = new Set<string>();

  const outcomes: BulkItemOutcome[] = [];

  for (const row of rows) {
    if (row.status === "error") {
      outcomes.push({
        index: row.index,
        name: row.values.name,
        status: "error",
        message: row.errors.join("; "),
      });
      continue;
    }

    const key = row.nameKey;
    const code = codeKey(row.values.code);

    if (usedNameKeys.has(key) || existingNameKeys.has(key)) {
      outcomes.push({
        index: row.index,
        name: row.values.name,
        status: "skipped_duplicate",
        message: "An item with this name already exists.",
      });
      continue;
    }
    if (code && (usedCodes.has(code) || existingCodes.has(code))) {
      outcomes.push({
        index: row.index,
        name: row.values.name,
        status: "skipped_duplicate",
        message: `An item with code "${code}" already exists.`,
      });
      continue;
    }

    const input: CsvItemValues = row.values;
    const res = await createItem({
      name: input.name,
      code: input.code,
      type: input.type,
      category: input.category,
      good_type: input.good_type,
      brand: input.brand,
      base_uom: input.base_uom,
      base_rate: input.base_rate,
      hsn_sac: input.hsn_sac,
      tax_rate: input.tax_rate,
      description: input.description,
    });

    if ("error" in res) {
      outcomes.push({
        index: row.index,
        name: row.values.name,
        status: "error",
        message: res.error,
      });
      continue;
    }

    usedNameKeys.add(key);
    if (code) usedCodes.add(code);
    outcomes.push({ index: row.index, name: row.values.name, status: "created" });
  }

  return {
    outcomes,
    summary: {
      created: outcomes.filter((o) => o.status === "created").length,
      skipped: outcomes.filter((o) => o.status === "skipped_duplicate").length,
      errors: outcomes.filter((o) => o.status === "error").length,
    },
  };
}
