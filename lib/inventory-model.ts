/**
 * Client-safe Inventory model — enums and types with NO server-only import, so
 * both client components (forms) and the server data module can share them.
 * The server logic lives in lib/data/inventory.ts.
 *
 * FEATURE-REGISTER PROC-WH-001/002 (warehouses, stock) · PROC-GRN-001 (GRN).
 *
 * Stock is an APPEND-ONLY LEDGER: every receipt/issue/transfer is a row in
 * stock_movements. Current stock is a PROJECTION over that ledger
 * (`projectStock` below) — never a stored counter (mirrors the REQ-04 ledger
 * idea), so every level stays auditable to its source entries.
 *
 * Numbers discipline: unit rates + GST% are USER-ENTERED CONFIG; stock value is
 * a pure computation (`stockValue`). No LLM ever produces a number (PLAN §8).
 */

/** Movement directions. `transfer` books the move without netting a level
 *  change across the pair (kept simple by design). */
export const MOVEMENT_DIRECTIONS = ["in", "out", "transfer"] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

/**
 * Direction chip tone map. Green(in) / amber(out) / grey(transfer) — NONE of
 * them red: red is RESERVED (§Design) for genuine alerts only, and its only
 * jobs on inventory screens are the unlisted-item flag and negative stock.
 */
export type DirectionTone = "positive" | "warning" | "neutral";

export const DIRECTION_META: Record<
  MovementDirection,
  { label: string; tone: DirectionTone }
> = {
  in: { label: "Stock in", tone: "positive" },
  out: { label: "Stock out", tone: "warning" },
  transfer: { label: "Transfer", tone: "neutral" },
};

/** GRN lifecycle: parked → posted → reversed/discarded. */
export const GRN_STATUSES = ["pending", "recorded", "discarded"] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number];

/** GRN chip tones are grey/amber/green ONLY — never red (red reserved §2). */
export type GrnTone = "muted" | "active" | "positive";

export const GRN_STATUS_META: Record<GrnStatus, { label: string; tone: GrnTone }> =
  {
    pending: { label: "Pending", tone: "active" },
    recorded: { label: "Recorded", tone: "positive" },
    discarded: { label: "Discarded", tone: "muted" },
  };

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface Warehouse {
  id: string;
  org_id: string;
  name: string;
  project_label: string | null;
  address: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

/** One append-only ledger entry. Rows are never edited or deleted. */
export interface StockMovement {
  id: string;
  org_id: string;
  item_id: string | null; // catalogue ref; null = unlisted item…
  item_name: string; // …label always kept (flagged red until promoted)
  warehouse_id: string;
  direction: MovementDirection;
  qty: number;
  uom: string | null;
  unit_rate: number; // user-entered CONFIG ₹/uom — never LLM
  gst_pct: number;
  hsn_sac: string | null;
  source_doc: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Grn {
  id: string;
  org_id: string;
  po_id: string | null;
  warehouse_id: string;
  grn_no: string | null;
  status: GrnStatus;
  recorded_by: string | null;
  recorded_at: string | null;
  note: string | null;
}

/**
 * The projection of the ledger: summed signed qty per item per warehouse.
 * `uom` rides along from the movements purely for display (last one seen wins).
 */
export interface StockLevel {
  item_id: string | null;
  item_name: string;
  warehouse_id: string;
  qty: number;
  uom?: string | null;
}

/** The slim catalogue shape the stock-in autocomplete pulls from the Item master. */
export interface CatalogueItemRef {
  id: string;
  name: string;
  base_uom: string | null;
  base_rate: number | null;
  tax_rate: number | null;
  hsn_sac: string | null;
}

/* ── Pure helpers ───────────────────────────────────────────────────────────── */

/**
 * Signed quantity contribution of one movement to a stock level:
 * +qty for 'in', −qty for 'out', 0 for 'transfer' (a transfer pair nets to
 * zero across its legs). Unknown directions contribute 0 rather than crashing.
 */
export function signedQty(direction: string, qty: number): number {
  const n = Number(qty);
  if (!Number.isFinite(n)) return 0;
  if (direction === "in") return n;
  if (direction === "out") return -n;
  return 0;
}

/** Stock value at a rate: qty × unit_rate (both user-entered config). */
export function stockValue(qty: number, unit_rate: number): number {
  const q = Number(qty);
  const r = Number(unit_rate);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return 0;
  return q * r;
}

/**
 * Project the ledger into current stock levels: group movements by
 * (item_id, warehouse_id) and sum `signedQty`. Unlisted items (item_id null)
 * group by their normalised label so two different unlisted names never merge.
 * Negative totals are allowed to surface — they are a TRUE ALERT (red) in the UI.
 */
export function projectStock(
  movements: {
    item_id?: string | null;
    item_name: string;
    warehouse_id: string;
    direction: MovementDirection | string;
    qty: number;
    uom?: string | null;
  }[],
): StockLevel[] {
  const groups = new Map<string, StockLevel>();
  for (const m of movements) {
    const key = `${m.item_id ?? `name:${m.item_name.trim().toLowerCase()}`}|${m.warehouse_id}`;
    const delta = signedQty(m.direction, m.qty);
    const existing = groups.get(key);
    if (existing) {
      existing.qty = Math.round((existing.qty + delta) * 100) / 100;
      if (m.uom) existing.uom = m.uom;
    } else {
      groups.set(key, {
        item_id: m.item_id ?? null,
        item_name: m.item_name,
        warehouse_id: m.warehouse_id,
        qty: Math.round(delta * 100) / 100,
        uom: m.uom ?? null,
      });
    }
  }
  // Stable display order: item name, then warehouse.
  return [...groups.values()].sort(
    (a, b) =>
      a.item_name.localeCompare(b.item_name) ||
      a.warehouse_id.localeCompare(b.warehouse_id),
  );
}
