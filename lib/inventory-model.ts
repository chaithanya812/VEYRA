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

/**
 * `Company Warehouses` | `Project Warehouses` — the split the owner named
 * (`110109`). It is a DECISION, not the absence of a project: a warehouse with
 * no project could be either, and only `kind` says which (migration 0033).
 */
export const WAREHOUSE_KINDS = ["company", "project"] as const;
export type WarehouseKind = (typeof WAREHOUSE_KINDS)[number];

export const WAREHOUSE_KIND_LABELS: Record<WarehouseKind, string> = {
  company: "Company Warehouses",
  project: "Project Warehouses",
};

export function warehouseKindOf(raw: string | null | undefined): WarehouseKind {
  return raw === "project" ? "project" : "company";
}

export interface Warehouse {
  id: string;
  org_id: string;
  name: string;
  kind: WarehouseKind;
  /** Set for `kind = "project"`; null for a company warehouse (0033 checks). */
  project_id: string | null;
  /** A bin lives inside another warehouse — `1st Warehouse ❯` in `110109`. */
  parent_id: string | null;
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
  /** The document this line belongs to (0033). Null for pre-0033 history. */
  grn_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Grn {
  id: string;
  org_id: string;
  po_id: string | null;
  warehouse_id: string;
  vendor_id: string | null;
  grn_no: string | null;
  /** `in` = goods receipt note · `out` = issue note (0033). */
  direction: string;
  /** The vendor's own bill / challan number. */
  reference: string | null;
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

/* ══════════════════════════════════════════════════════════════════════════
   INVENTORY, COMPANY-WIDE (PLAN-V4 §10.2, frames `110109` / `110101`)
   ══════════════════════════════════════════════════════════════════════════
   Four tabs over the SAME append-only ledger, plus a fifth that is the
   `Material Search` control in `110109`'s header:

     Warehouse/Site · Deliveries StockIn · Expense StockIn · Transaction
     History  (· Material search)

   Everything below is arithmetic over `stock_movements`. Nothing here reads a
   stored total, because there is no stored total to read — `grns` has neither
   a `qty` nor an `amount` column, on purpose (0033's header).
   ────────────────────────────────────────────────────────────────────────── */

export const INVENTORY_TABS = [
  "warehouses",
  "deliveries",
  "expense",
  "history",
  "materials",
] as const;
export type InventoryTab = (typeof INVENTORY_TABS)[number];

export const INVENTORY_TAB_LABELS: Record<InventoryTab, string> = {
  warehouses: "Warehouse/Site",
  deliveries: "Deliveries StockIn",
  expense: "Expense StockIn",
  history: "Transaction History",
  materials: "Material search",
};

/** Unknown values fall back to the first tab rather than throwing. */
export function inventoryTabOf(raw: string | null | undefined): InventoryTab {
  return (INVENTORY_TABS as readonly string[]).includes(String(raw))
    ? (raw as InventoryTab)
    : "warehouses";
}

/** One movement, reduced to what every figure on these screens is built from. */
export interface LedgerLine {
  warehouse_id: string;
  direction: MovementDirection | string;
  qty: number;
  unit_rate: number;
  created_at: string;
}

/**
 * `110109`'s `Goods Value`, and it is worth being exact about what it is NOT.
 *
 * This is the LEDGER'S OWN ARITHMETIC: every inward line adds `qty × rate` and
 * every outward line subtracts `qty × rate`, each at the rate recorded on that
 * line. It is not FIFO and it is not a weighted average — those are valuation
 * METHODS, and choosing one is a finance decision the owner has not made. What
 * this number can always do is name the rows it came from, which is the only
 * property a figure on a stock screen has to have.
 */
export function goodsValue(lines: readonly LedgerLine[]): number {
  let total = 0;
  for (const l of lines) {
    total += stockValue(signedQty(l.direction, l.qty), Number(l.unit_rate) || 0);
  }
  return Math.round(total * 100) / 100;
}

/** Total quantity moved, unsigned — what a document's `Qty` column shows. */
export function movedQty(lines: readonly LedgerLine[]): number {
  let total = 0;
  for (const l of lines) total += Math.abs(Number(l.qty) || 0);
  return Math.round(total * 100) / 100;
}

/** Total value moved, unsigned — a document's `Amount` column. */
export function movedAmount(lines: readonly LedgerLine[]): number {
  let total = 0;
  for (const l of lines) {
    total += Math.abs(stockValue(Number(l.qty) || 0, Number(l.unit_rate) || 0));
  }
  return Math.round(total * 100) / 100;
}

/**
 * `Last Stock In` / `Last Stock Out` (`110109`). Null when it has never
 * happened — which the screen prints as a dash, not as a zero date. The frame
 * itself has rows with a stock-in and no stock-out, and that is a real state.
 */
export function lastMovement(
  lines: readonly LedgerLine[],
  direction: "in" | "out",
): string | null {
  let latest: string | null = null;
  for (const l of lines) {
    if (l.direction !== direction) continue;
    if (latest === null || l.created_at > latest) latest = l.created_at;
  }
  return latest;
}

/* ── The warehouse tree (bins — the row expander in `110109`) ─────────────── */

export interface WarehouseNode extends Warehouse {
  bins: WarehouseNode[];
  /** This warehouse's own lines only. */
  ownValue: number;
  /** Own value plus every bin's, which is what the parent row prints. */
  rolledValue: number;
  lastIn: string | null;
  lastOut: string | null;
}

/**
 * Build the parent → bins tree and roll the figures up it.
 *
 * A parent row in `110109` shows the total of what is under it: a shelf's
 * stock is in the warehouse whether or not you expand the row. Rolling up is
 * therefore not a convenience, it is the difference between a warehouse's
 * `Goods Value` being true and being the fraction that happens to sit outside
 * its bins.
 *
 * A bin whose parent is missing (filtered out, archived) is promoted to the
 * top rather than dropped — a lost row is worse than an odd-looking one.
 */
export function buildWarehouseTree(
  warehouses: readonly Warehouse[],
  linesByWarehouse: ReadonlyMap<string, LedgerLine[]>,
): WarehouseNode[] {
  const nodes = new Map<string, WarehouseNode>();
  for (const w of warehouses) {
    const lines = linesByWarehouse.get(w.id) ?? [];
    nodes.set(w.id, {
      ...w,
      bins: [],
      ownValue: goodsValue(lines),
      rolledValue: goodsValue(lines),
      lastIn: lastMovement(lines, "in"),
      lastOut: lastMovement(lines, "out"),
    });
  }

  const roots: WarehouseNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.bins.push(node);
    else roots.push(node);
  }

  // Depth-first, so a bin's own bins are folded in before its parent reads it.
  const fold = (node: WarehouseNode): WarehouseNode => {
    let value = node.ownValue;
    let lastIn = node.lastIn;
    let lastOut = node.lastOut;
    node.bins = node.bins.map(fold);
    for (const b of node.bins) {
      value += b.rolledValue;
      if (b.lastIn && (!lastIn || b.lastIn > lastIn)) lastIn = b.lastIn;
      if (b.lastOut && (!lastOut || b.lastOut > lastOut)) lastOut = b.lastOut;
    }
    node.rolledValue = Math.round(value * 100) / 100;
    node.lastIn = lastIn;
    node.lastOut = lastOut;
    node.bins.sort((a, b) => a.name.localeCompare(b.name));
    return node;
  };

  return roots.map(fold).sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Stock documents (the `Id` column in `110101`) ────────────────────────── */

export const NOTE_DIRECTIONS = ["in", "out"] as const;
export type NoteDirection = (typeof NOTE_DIRECTIONS)[number];

/**
 * An inward note is a GRN. An outward one is an issue note, and calling it a
 * GRN would be a naming lie in a register somebody audits.
 */
export const NOTE_DIRECTION_LABELS: Record<NoteDirection, string> = {
  in: "Stock In",
  out: "Stock Out",
};

export const NOTE_KIND_LABELS: Record<NoteDirection, string> = {
  in: "Goods receipt note",
  out: "Issue note",
};

export function noteDirectionOf(raw: string | null | undefined): NoteDirection {
  return raw === "out" ? "out" : "in";
}

/** One row of Transaction History (`110101`). Every figure here is a sum. */
export interface StockNote {
  id: string;
  number: string | null;
  direction: NoteDirection;
  status: GrnStatus;
  warehouse_id: string;
  warehouseName: string | null;
  vendor_id: string | null;
  vendorName: string | null;
  po_id: string | null;
  reference: string | null;
  note: string | null;
  recorded_at: string | null;
  recordedByName: string | null;
  lineCount: number;
  qty: number;
  amount: number;
}

/**
 * Movements that belong to no document at all.
 *
 * 0014 created `grns` and `stock_movements` without a link between them, so
 * rows written before 0033 have no document and no number. They are NOT hidden
 * and no number is invented for them: Transaction History shows them as
 * unlinked entries, the same way an RFQ awarded before the award reason
 * existed says "No reason recorded". Inventing history to fill a new column is
 * how a register stops being evidence.
 */
export function unlinkedCount(
  lines: readonly { grn_id?: string | null }[],
): number {
  return lines.filter((l) => !l.grn_id).length;
}
