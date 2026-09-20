"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createWarehouse,
  deactivateWarehouse,
  reactivateWarehouse,
  postStockMovement,
  searchCatalogueItems,
  type CatalogueItemRef,
  type StockInLineInput,
} from "@/lib/data/inventory";
import { findOrCreateItem } from "@/lib/data/items";
import { NOTE_DIRECTIONS, WAREHOUSE_KINDS } from "@/lib/inventory-model";
import { GST_RATES, UOMS, type Uom } from "@/lib/items-model";

export type FormState = { error?: string; note?: string } | undefined;

/* ── Catalogue autocomplete (powers the stock-in line grid) ───────────────── */
export async function searchItemsAction(
  query: string,
): Promise<CatalogueItemRef[]> {
  if (!(await can("items.item.view"))) return [];
  if (!query || query.trim().length < 1) return [];
  return searchCatalogueItems(query);
}

export type PromoteUnlistedInput = {
  name: string;
  uom?: string | null;
  rate?: number | null;
  tax_rate?: number | null;
  hsn_sac?: string | null;
  category?: string | null;
  good_type?: string | null;
};

/**
 * Inline catalogue create from a stock-in line. Reuses createItem (via
 * findOrCreateItem) so org stamp, name dedupe and the metered-create gate
 * stay in one place. Does not post the receipt — the line still submits
 * through addStockInAction, promoted or not.
 */
export async function promoteUnlistedItemAction(
  input: PromoteUnlistedInput,
): Promise<{ id: string } | { error: string }> {
  const denied = await requireCan("items.item.create");
  if (denied) return denied;

  const name = (input.name ?? "").trim();
  if (!name) return { error: "Item is required" };

  const uomRaw = (input.uom ?? "").trim().toLowerCase();
  const base_uom: Uom = (UOMS as readonly string[]).includes(uomRaw)
    ? (uomRaw as Uom)
    : "nos";

  const rateNum = input.rate == null ? null : Number(input.rate);
  const base_rate =
    rateNum != null && Number.isFinite(rateNum) && rateNum >= 0 ? rateNum : null;

  const taxNum = input.tax_rate == null ? NaN : Number(input.tax_rate);
  const tax_rate = (GST_RATES as readonly number[]).includes(taxNum) ? taxNum : 18;

  const result = await findOrCreateItem({
    name,
    type: "material",
    base_uom,
    base_rate,
    tax_rate,
    hsn_sac: input.hsn_sac?.trim() || null,
    category: input.category?.trim() || null,
    good_type: input.good_type?.trim() || null,
  });
  if ("id" in result) revalidatePath("/items");
  return result;
}

/* ── Warehouses ─────────────────────────────────────────────────────────────── */

/**
 * `Add Warehouse` (`110109`).
 *
 * `kind` is REQUIRED to be one of the two the owner named — a warehouse that
 * is neither company nor project would sit in neither list and be invisible.
 * The project id is validated in the data layer against this workspace, not
 * here: a form is where a request is composed, never where it is trusted.
 */
const warehouseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  kind: z.enum(WAREHOUSE_KINDS).default("company"),
  project_id: z.string().optional(),
  parent_id: z.string().optional(),
  address: z.string().optional(),
});

export async function createWarehouseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("inventory.warehouse.create");
  if (denied) return denied;
  const parsed = warehouseSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind") || "company",
    project_id: formData.get("project_id") || undefined,
    parent_id: formData.get("parent_id") || undefined,
    address: formData.get("address") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createWarehouse(parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/inventory");
  return { note: "Warehouse added." };
}

export async function deactivateWarehouseAction(formData: FormData) {
  if (!(await can("inventory.warehouse.create"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await deactivateWarehouse(id);
  if (result.error) return;
  revalidatePath("/inventory");
}

export async function reactivateWarehouseAction(formData: FormData) {
  if (!(await can("inventory.warehouse.create"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await reactivateWarehouse(id);
  if (result.error) return;
  revalidatePath("/inventory");
}

/* ── Stock movement (one document; one 'in'/'out' line per item) ──────────── */
const lineSchema = z.object({
  item_id: z.string().nullable().optional(),
  item_name: z.string().min(1, "Item is required"),
  uom: z.string().nullable().optional(),
  qty: z.coerce.number().gt(0, "Qty must be greater than 0"),
  unit_rate: z.coerce.number().min(0, "Unit rate must be ≥ 0"),
  gst_pct: z.coerce
    .number()
    .min(0)
    .max(100)
    .nullable()
    .optional(),
  hsn_sac: z.string().nullable().optional(),
});

function parseLines(raw: FormDataEntryValue | null): StockInLineInput[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = z.array(lineSchema).safeParse(parsedJson);
  if (!parsed.success) return null;
  return parsed.data.map((l) => ({
    item_id: l.item_id || null,
    item_name: l.item_name,
    // No catalogue match ⇒ flagged unlisted (item_id null), label always kept.
    uom: l.uom || null,
    qty: l.qty,
    unit_rate: l.unit_rate,
    gst_pct: l.gst_pct == null ? 18 : l.gst_pct,
    hsn_sac: l.hsn_sac || null,
  }));
}

export async function addStockInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("inventory.movement.create");
  if (denied) return denied;
  const warehouseId = String(formData.get("warehouse_id") ?? "");
  if (!warehouseId) return { error: "Select a warehouse first." };

  const rawDirection = String(formData.get("direction") ?? "in");
  if (!(NOTE_DIRECTIONS as readonly string[]).includes(rawDirection)) {
    return { error: "Stock moves in or out — nothing else." };
  }

  const lines = parseLines(formData.get("lines"));
  if (lines === null) {
    return { error: "The line items could not be read — try again." };
  }
  if (lines.length === 0) {
    return { error: "Add at least one line with a quantity." };
  }

  const result = await postStockMovement({
    warehouse_id: warehouseId,
    direction: rawDirection as "in" | "out",
    vendor_id: String(formData.get("vendor_id") ?? "") || null,
    source_doc: String(formData.get("source_doc") ?? "") || null,
    note: String(formData.get("note") ?? "") || null,
    po_id: String(formData.get("po_id") ?? "") || null,
    payment_id: String(formData.get("payment_id") ?? "") || null,
    lines,
  });
  if (result.error) return { error: result.error };

  revalidatePath("/inventory");
  revalidatePath("/inventory/stock-in");
  redirect("/inventory?tab=history");
}
