/**
 * Client-safe item-master model — enums and types with NO server-only import, so
 * both client components (forms) and the server data module can share them.
 * The server logic lives in lib/data/items.ts.
 *
 * The Item is the catalogue reference the whole downstream spine points at:
 * quotation lines, material requests, POs, stock and BOM all reference an Item
 * rather than free-typing a code (FEATURE-REGISTER: PROC-MR-003).
 */

/**
 * Three independent axes on an Item (owner Q5):
 *
 *   type      — closed system enum. Downstream modules branch on this
 *               (labour vs catalogue goods vs a machine). Dzylo's item form
 *               labelled this "Goods Type"; it is NOT the free-text axis below.
 *               Labour/machine/module are item *types*, not parallel modules
 *               (FEATURE-REGISTER: OPS-LAB-001).
 *   category  — free-text product grouping (Plywood, Hardware, Laminate).
 *   good_type — free-text merchandising class (Raw Material, Consumable, …).
 *
 * Category and good_type are suggested-vocabulary text, not lookup tables.
 */
export const ITEM_TYPES = [
  "material",
  "service",
  "labour",
  "machine",
  "module",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Curated units of measure for Indian interior / construction work.
 *  Stored as the code (lowercase); shown via UOM_LABEL. Extensible later to a
 *  tenant-defined UOM table without touching stored data. */
export const UOMS = [
  "nos",
  "sqft",
  "sqm",
  "rft",
  "rmt",
  "sheet",
  "kg",
  "ltr",
  "set",
  "pair",
  "box",
  "roll",
  "bag",
  "hour",
  "day",
] as const;
export type Uom = (typeof UOMS)[number];

/** GST slabs (India). tax_rate is stored as a number; these seed the dropdown. */
export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/** Suggested category vocabulary — free text; tenants may type anything else. */
export const SUGGESTED_CATEGORIES = [
  "Plywood",
  "Laminate",
  "Hardware",
  "Adhesive",
  "Edge Banding",
  "Paint",
  "Glass",
  "Fabric",
  "Electrical",
  "Fixture",
  "Consumable",
  "Labour",
] as const;

/** Suggested merchandising class — independent of `type` and of `category`. */
export const SUGGESTED_GOOD_TYPES = [
  "Raw Material",
  "Semi-finished",
  "Finished Good",
  "Consumable",
  "Trading",
  "Capital Goods",
  "Service",
] as const;

export interface Item {
  id: string;
  name: string;
  code: string | null;
  type: ItemType;
  category: string | null;
  good_type: string | null;
  brand: string | null;
  base_uom: Uom;
  purchase_uom: Uom | null;
  purchase_to_base_factor: number;
  base_rate: number | null;
  hsn_sac: string | null;
  tax_rate: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** The slim shape a downstream line (quotation, MR, PO) pulls from the catalogue. */
export interface ItemRef {
  id: string;
  name: string;
  code: string | null;
  type: ItemType;
  base_uom: Uom;
  base_rate: number | null;
  tax_rate: number;
  hsn_sac: string | null;
}

/* ── Bulk CSV import (client-safe result shapes shared by the action + UI) ──── */

/** Outcome of importing one CSV row via bulkCreateItems (lib/data/items.ts). */
export type BulkItemOutcome =
  | { index: number; name: string; status: "created" }
  | { index: number; name: string; status: "skipped_duplicate"; message: string }
  | { index: number; name: string; status: "error"; message: string };

export interface BulkCreateResult {
  outcomes: BulkItemOutcome[];
  summary: { created: number; skipped: number; errors: number };
}

/**
 * Last price is DERIVED, never stored: the newest `stock_movements.unit_rate`
 * for the item. Empty history → null (the screen prints a dash, not ₹0).
 */
export function lastPrice(
  movements: readonly { unit_rate: number; created_at: string }[],
): number | null {
  if (movements.length === 0) return null;
  let newest = movements[0];
  for (const m of movements) {
    if (m.created_at > newest.created_at) newest = m;
  }
  const r = Number(newest.unit_rate);
  return Number.isFinite(r) ? r : null;
}
