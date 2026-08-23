"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createWarehouse,
  deactivateWarehouse,
  addStockIn,
  searchCatalogueItems,
  type CatalogueItemRef,
  type StockInLineInput,
} from "@/lib/data/inventory";

export type FormState = { error?: string } | undefined;

/* ── Catalogue autocomplete (powers the stock-in line grid) ───────────────── */
export async function searchItemsAction(
  query: string,
): Promise<CatalogueItemRef[]> {
  if (!query || query.trim().length < 1) return [];
  return searchCatalogueItems(query);
}

/* ── Warehouses ─────────────────────────────────────────────────────────────── */
const warehouseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  project_label: z.string().optional(),
  address: z.string().optional(),
});

export async function createWarehouseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = warehouseSchema.safeParse({
    name: formData.get("name"),
    project_label: formData.get("project_label") || undefined,
    address: formData.get("address") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createWarehouse(parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/inventory");
  redirect("/inventory?tab=warehouses");
}

export async function deactivateWarehouseAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await deactivateWarehouse(id);
  if (result.error) return;
  revalidatePath("/inventory");
}

/* ── Stock-in (one 'in' movement per line; optional GRN) ──────────────────── */
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
  const warehouseId = String(formData.get("warehouse_id") ?? "");
  if (!warehouseId) return { error: "Select a warehouse first." };

  const lines = parseLines(formData.get("lines"));
  if (lines === null) {
    return { error: "The line items could not be read — try again." };
  }
  if (lines.length === 0) {
    return { error: "Add at least one line with a quantity." };
  }

  const result = await addStockIn({
    warehouse_id: warehouseId,
    source_doc: String(formData.get("source_doc") ?? "") || null,
    note: String(formData.get("note") ?? "") || null,
    po_id: String(formData.get("po_id") ?? "") || null,
    createGrn: String(formData.get("create_grn") ?? "") === "1",
    lines,
  });
  if (result.error) return { error: result.error };

  revalidatePath("/inventory");
  revalidatePath("/inventory/stock-in");
  redirect("/inventory?tab=levels");
}
