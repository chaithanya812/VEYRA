"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createItem,
  updateItem,
  setItemActive,
  bulkCreateItems,
  type BulkItemOutcome,
  ITEM_TYPES,
  UOMS,
  GST_RATES,
  type ItemInput,
  type ItemType,
  type Uom,
} from "@/lib/data/items";

export type FormState = { error?: string } | undefined;

/** Result returned by the CSV import action (consumed by the import page). */
export type ImportState = {
  error?: string;
  outcomes?: BulkItemOutcome[];
  summary?: { created: number; skipped: number; errors: number };
} | undefined;

const gstValues = GST_RATES.map((r) => String(r)) as [string, ...string[]];

const itemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
  type: z.enum(ITEM_TYPES),
  category: z.string().optional(),
  brand: z.string().optional(),
  base_uom: z.enum(UOMS),
  purchase_uom: z.string().optional(),
  purchase_to_base_factor: z.string().optional(),
  base_rate: z.string().optional(),
  hsn_sac: z.string().optional(),
  tax_rate: z.enum(gstValues),
  description: z.string().optional(),
});

function toInput(d: z.infer<typeof itemSchema>): ItemInput | { error: string } {
  const factor = d.purchase_to_base_factor
    ? Number(d.purchase_to_base_factor)
    : 1;
  if (!Number.isFinite(factor) || factor <= 0) {
    return { error: "Purchase-to-base factor must be a positive number." };
  }
  const rate = d.base_rate ? Number(d.base_rate) : null;
  if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
    return { error: "Rate must be a non-negative number." };
  }
  // purchase_uom must be a known UOM if provided.
  const purchaseUom =
    d.purchase_uom && (UOMS as readonly string[]).includes(d.purchase_uom)
      ? (d.purchase_uom as Uom)
      : null;

  return {
    name: d.name,
    code: d.code || null,
    type: d.type as ItemType,
    category: d.category || null,
    brand: d.brand || null,
    base_uom: d.base_uom as Uom,
    purchase_uom: purchaseUom,
    purchase_to_base_factor: factor,
    base_rate: rate,
    hsn_sac: d.hsn_sac || null,
    tax_rate: Number(d.tax_rate),
    description: d.description || null,
  };
}

function parseForm(formData: FormData) {
  return itemSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || undefined,
    type: formData.get("type"),
    category: formData.get("category") || undefined,
    brand: formData.get("brand") || undefined,
    base_uom: formData.get("base_uom"),
    purchase_uom: formData.get("purchase_uom") || undefined,
    purchase_to_base_factor: formData.get("purchase_to_base_factor") || undefined,
    base_rate: formData.get("base_rate") || undefined,
    hsn_sac: formData.get("hsn_sac") || undefined,
    tax_rate: formData.get("tax_rate"),
    description: formData.get("description") || undefined,
  });
}

export async function createItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = toInput(parsed.data);
  if ("error" in input) return { error: input.error };

  const result = await createItem(input);
  if ("error" in result) return { error: result.error };

  revalidatePath("/items");
  redirect(`/items/${result.id}`);
}

export async function updateItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item id" };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = toInput(parsed.data);
  if ("error" in input) return { error: input.error };

  const result = await updateItem(id, input);
  if (result.error) return { error: result.error };

  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  redirect(`/items/${id}`);
}

export async function toggleActiveAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("next")) === "true";
  if (!id) return;
  await setItemActive(id, next);
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
}

const importSchema = z.object({
  csv: z.string().min(1, "Paste or upload a CSV first."),
});

/**
 * Bulk-import items from CSV text. Parses + validates, inserts new items through
 * the shared create path, revalidates /items and returns a per-row outcome.
 */
export async function importItemsCsvAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const parsed = importSchema.safeParse({ csv: formData.get("csv") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await bulkCreateItems(parsed.data.csv);
  revalidatePath("/items");

  return { outcomes: result.outcomes, summary: result.summary };
}
