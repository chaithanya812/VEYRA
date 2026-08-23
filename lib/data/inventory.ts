import "server-only";
import { withOrg } from "./with-org";
import {
  MOVEMENT_DIRECTIONS,
  DIRECTION_META,
  GRN_STATUSES,
  GRN_STATUS_META,
  projectStock,
  type CatalogueItemRef,
  type Grn,
  type GrnStatus,
  type StockLevel,
  type StockMovement,
  type Warehouse,
} from "@/lib/inventory-model";

/**
 * Inventory data module — warehouses, the append-only stock-movement ledger,
 * and GRNs (FEATURE-REGISTER PROC-WH-001/002 · PROC-GRN-001). Follows the
 * Leads reference pattern exactly: no table is ever touched directly —
 * everything goes through withOrg(), so org_id filtering/stamping is automatic
 * and cross-tenant leakage is impossible by construction.
 *
 * There is deliberately NO stock-level read here beyond a projection:
 * stockLevels() reads movements and sums them via projectStock (lib/
 * inventory-model.ts) — stock level is NEVER a stored counter. unit_rate /
 * gst_pct are user-entered CONFIG; this module only stores/reads them and no
 * amount is ever computed by an LLM (PLAN §8).
 *
 * Client-safe enums/types live in @/lib/inventory-model (this file is
 * server-only).
 */
export {
  MOVEMENT_DIRECTIONS,
  DIRECTION_META,
  GRN_STATUSES,
  GRN_STATUS_META,
  type CatalogueItemRef,
  type Grn,
  type GrnStatus,
  type StockLevel,
  type StockMovement,
  type Warehouse,
};

/* ── Warehouses ─────────────────────────────────────────────────────────────── */

const WH_COLS =
  "id, org_id, name, project_label, address, is_active, created_by, created_at";

export async function listWarehouses(activeOnly?: boolean): Promise<Warehouse[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("warehouses").select(WH_COLS);
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Warehouse[];
}

export interface WarehouseInput {
  name: string;
  project_label?: string | null;
  address?: string | null;
}

export async function createWarehouse(
  input: WarehouseInput,
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Warehouse name is required." };
  const { db, ctx } = await withOrg();
  const { data, error } = await db.table("warehouses").insert({
    name,
    project_label: input.project_label?.trim() || null,
    address: input.address?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

/** Soft-deactivate instead of delete — the ledger references warehouse ids. */
export async function deactivateWarehouse(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("warehouses").updateById(id, {
    is_active: false,
  });
  return error ? { error: error.message } : {};
}

/* ── Stock movements (append-only ledger) ───────────────────────────────────── */

const MV_COLS =
  "id, org_id, item_id, item_name, warehouse_id, direction, qty, uom, unit_rate, gst_pct, hsn_sac, source_doc, note, created_by, created_at";

export async function listMovements(filter?: {
  warehouseId?: string;
  itemId?: string;
}): Promise<StockMovement[]> {
  const { db } = await withOrg();
  let q = db.table("stock_movements").select(MV_COLS);
  if (filter?.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
  if (filter?.itemId) q = q.eq("item_id", filter.itemId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StockMovement[];
}

export interface StockInLineInput {
  item_id?: string | null;
  item_name: string;
  uom?: string | null;
  qty: number;
  /** User-entered CONFIG ₹/uom — never produced by an LLM (PLAN §8). */
  unit_rate: number;
  gst_pct?: number | null;
  hsn_sac?: string | null;
}

/**
 * Post a stock-in receipt: one append-only 'in' movement per line, stamped
 * with the acting user. When `createGrn` is set, also posts the GRN record
 * linked to the warehouse (and PO when supplied). Rates/GST are config that
 * was entered by the user in the form — stored verbatim, never computed by AI.
 */
export async function addStockIn(input: {
  warehouse_id: string;
  source_doc?: string | null;
  note?: string | null;
  po_id?: string | null;
  createGrn?: boolean;
  lines: StockInLineInput[];
}): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();

  if (!input.warehouse_id) return { error: "Warehouse is required." };
  const lines = input.lines.filter((l) => l.item_name.trim());
  if (lines.length === 0) return { error: "At least one line is required." };

  const rows = lines.map((l) => ({
    item_id: l.item_id || null, // null = unlisted item — flagged for promotion
    item_name: l.item_name.trim(),
    warehouse_id: input.warehouse_id,
    direction: "in" as const,
    qty: Number(l.qty) || 0,
    uom: l.uom?.trim() || null,
    unit_rate: Number(l.unit_rate) || 0,
    gst_pct: l.gst_pct == null || Number.isNaN(Number(l.gst_pct)) ? 18 : Number(l.gst_pct),
    hsn_sac: l.hsn_sac?.trim() || null,
    source_doc: input.source_doc?.trim() || null,
    note: input.note?.trim() || null,
    created_by: ctx.userId,
  }));

  const { error } = await db.table("stock_movements").insert(rows);
  if (error) return { error: error.message };

  if (input.createGrn) {
    const { error: grnErr } = await db.table("grns").insert({
      po_id: input.po_id || null,
      warehouse_id: input.warehouse_id,
      status: "recorded",
      recorded_by: ctx.userId,
      recorded_at: new Date().toISOString(),
      note: input.source_doc?.trim()
        ? `${input.note?.trim() ? input.note.trim() + " · " : ""}${input.source_doc.trim()}`
        : input.note?.trim() || null,
    });
    if (grnErr) return { error: grnErr.message };
  }

  return {};
}

/**
 * Current stock = SUM of signed movements per item per warehouse — a
 * projection over the append-only ledger, never a stored counter.
 */
export async function stockLevels(warehouseId?: string): Promise<StockLevel[]> {
  const { db } = await withOrg();
  let q = db
    .table("stock_movements")
    .select("item_id, item_name, warehouse_id, direction, qty, uom");
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw error;
  return projectStock((data ?? []) as unknown as Parameters<typeof projectStock>[number]);
}

/* ── GRNs ───────────────────────────────────────────────────────────────────── */

const GRN_COLS =
  "id, org_id, po_id, warehouse_id, grn_no, status, recorded_by, recorded_at, note";

export async function listGrns(filter?: {
  status?: GrnStatus;
}): Promise<Grn[]> {
  const { db } = await withOrg();
  let q = db.table("grns").select(GRN_COLS);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Grn[];
}

/* ── Catalogue autocomplete for the stock-in grid ──────────────────────────── */

/**
 * Catalogue autocomplete — reads the Item master through withOrg (`items` is
 * on the tenant allowlist), active items matched by name (ilike), slim shape
 * with the GST/HSN/rate defaults a stock-in line pre-fills from. Same shape
 * of query as the procurement module's searchCatalogueItems.
 */
export async function searchCatalogueItems(query: string): Promise<CatalogueItemRef[]> {
  const term = query.trim();
  if (!term) return [];
  const { db } = await withOrg();
  const like = `%${term}%`;
  const { data, error } = await db
    .table("items")
    .select("id, name, base_uom, base_rate, tax_rate, hsn_sac")
    .eq("is_active", true)
    .ilike("name", like)
    .order("name", { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as CatalogueItemRef[];
}
