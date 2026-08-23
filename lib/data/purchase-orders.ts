import "server-only";
import { withOrg } from "./with-org";
import {
  ORDER_STATES,
  PAYMENT_STATES,
  PO_TYPES,
  lineTotal,
  poAmount,
  deriveOrderState,
  type OrderState,
  type PaymentState,
  type PoType,
  type PurchaseOrder,
  type PoLine,
  type PoReceipt,
  type PoReceiptLine,
} from "@/lib/po-model";

/**
 * Purchase Orders data module (Procurement · FEATURE-REGISTER PROC-PO-001/002,
 * PROC-DELIV-001). Follows the Leads/MaterialRequests reference pattern
 * exactly: no table is ever touched directly — everything goes through
 * withOrg(), so org_id filtering/stamping is automatic and cross-tenant
 * leakage is impossible by construction.
 *
 * A PO carries TWO independent state machines: order_state (fulfilment) and
 * payment_state (money). Fulfilment DERIVES from partial receipts: goods
 * arrive in po_receipts/po_receipt_lines batches; recordReceipt recomputes
 * received-vs-ordered totals and sets order_state via deriveOrderState().
 *
 * Money rule (PLAN §8): unit_rate/tax_pct are user-entered CONFIG; `amount`
 * is the pure SUM of line totals (poAmount) — no LLM ever produces a number.
 *
 * Client-safe enums/types live in @/lib/po-model (this file is server-only).
 */
export {
  ORDER_STATES,
  PAYMENT_STATES,
  PO_TYPES,
  type OrderState,
  type PaymentState,
  type PurchaseOrder,
  type PoLine,
  type PoReceipt,
  type PoReceiptLine,
};

export interface PoReceiptWithLines extends PoReceipt {
  lines: PoReceiptLine[];
}

/* ── Reads ─────────────────────────────────────────────────────────────────── */

export async function listPurchaseOrders(filter?: {
  order_state?: string;
  payment_state?: string;
  vendorId?: string;
}): Promise<PurchaseOrder[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("purchase_orders").select("*");
  if (filter?.order_state) q = q.eq("order_state", filter.order_state);
  if (filter?.payment_state) q = q.eq("payment_state", filter.payment_state);
  if (filter?.vendorId) q = q.eq("vendor_id", filter.vendorId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PurchaseOrder[];
}

export async function getPurchaseOrder(
  id: string,
): Promise<{
  po: PurchaseOrder;
  lines: PoLine[];
  receipts: PoReceiptWithLines[];
} | null> {
  const { db } = await withOrg();
  const { data: po, error } = await db
    .table("purchase_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!po) return null;

  const { data: lines } = await db
    .table("po_lines")
    .select("*")
    .eq("po_id", id)
    .order("created_at", { ascending: true });

  const { data: receipts } = await db
    .table("po_receipts")
    .select("*")
    .eq("po_id", id)
    .order("received_at", { ascending: false });

  const receiptRows = (receipts ?? []) as unknown as PoReceipt[];
  let receiptLines: PoReceiptLine[] = [];
  if (receiptRows.length > 0) {
    const { data: rlines } = await db
      .table("po_receipt_lines")
      .select("*")
      .in("receipt_id", receiptRows.map((r) => r.id));
    receiptLines = (rlines ?? []) as unknown as PoReceiptLine[];
  }

  return {
    po: po as unknown as PurchaseOrder,
    lines: (lines ?? []) as unknown as PoLine[],
    receipts: receiptRows.map((r) => ({
      ...r,
      lines: receiptLines.filter((rl) => rl.receipt_id === r.id),
    })),
  };
}

/** Display labels for vendor ids on list/detail screens (org-scoped read). */
export async function vendorNames(
  vendorIds: (string | null)[],
): Promise<Record<string, string>> {
  const ids = [...new Set(vendorIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return {};
  const { db } = await withOrg();
  const { data, error } = await db.table("vendors").select("id, name").in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { id: string; name: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.id] = r.name;
  return map;
}

/* ── Writes ────────────────────────────────────────────────────────────────── */

export interface PoLineInput {
  item_id?: string | null;
  item_name: string;
  uom?: string | null;
  qty: number;
  /** CONFIG typed by the user — never produced by a model. */
  unit_rate: number;
  tax_pct?: number | null;
}

export async function createPurchaseOrder(input: {
  name: string;
  vendor_id: string;
  project_label?: string | null;
  type?: PoType;
  order_date?: string | null;
  delivery_date?: string | null;
  rfq_id?: string | null;
  lines: PoLineInput[];
}): Promise<{ id: string } | { error: string }> {
  if (!input.name.trim()) return { error: "Order name is required." };
  if (!input.vendor_id) return { error: "A vendor must be selected." };

  const { db, ctx } = await withOrg();

  // The vendor must point at a row of THIS org.
  const { data: vendor } = await db
    .table("vendors")
    .select("id")
    .eq("id", input.vendor_id)
    .maybeSingle();
  if (!vendor) return { error: "Vendor not found." };

  // amount is the PURE SUM of line totals (poAmount) — arithmetic on config.
  const amount = poAmount(input.lines ?? []);
  const type: PoType =
    input.type && (PO_TYPES as readonly string[]).includes(input.type)
      ? input.type
      : "purchase_order";

  const { data, error } = await db.table("purchase_orders").insert({
    name: input.name.trim(),
    vendor_id: input.vendor_id,
    project_label: input.project_label?.trim() || null,
    rfq_id: input.rfq_id || null,
    type,
    amount,
    order_state: "draft",
    payment_state: "not_initiated",
    order_date: input.order_date || null,
    delivery_date: input.delivery_date || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  const lines = (input.lines ?? [])
    .filter((l) => l.item_name.trim())
    .map((l) => ({
      po_id: id,
      item_id: l.item_id || null,
      item_name: l.item_name.trim(),
      uom: l.uom?.trim() || null,
      qty: Number(l.qty) || 0,
      unit_rate: Number(l.unit_rate) || 0,
      tax_pct: l.tax_pct == null ? 18 : Number(l.tax_pct),
      line_total: lineTotal(l.qty, l.unit_rate),
    }));
  if (lines.length > 0) {
    const { error: lineErr } = await db.table("po_lines").insert(lines);
    if (lineErr) return { error: lineErr.message };
  }

  return { id };
}

export async function updateOrderState(
  id: string,
  state: OrderState,
): Promise<{ error?: string }> {
  if (!(ORDER_STATES as readonly string[]).includes(state)) {
    return { error: "Invalid order state." };
  }
  const { db } = await withOrg();
  const { error } = await db
    .table("purchase_orders")
    .updateById(id, { order_state: state, updated_at: new Date().toISOString() });
  return error ? { error: error.message } : {};
}

export async function updatePaymentState(
  id: string,
  state: PaymentState,
): Promise<{ error?: string }> {
  if (!(PAYMENT_STATES as readonly string[]).includes(state)) {
    return { error: "Invalid payment state." };
  }
  const { db } = await withOrg();
  const { error } = await db
    .table("purchase_orders")
    .updateById(id, { payment_state: state, updated_at: new Date().toISOString() });
  return error ? { error: error.message } : {};
}

export interface ReceiptLineInput {
  po_line_id: string;
  qty_received: number;
}

/**
 * Log one goods-arrival batch against a PO (partial receipts), then recompute
 * Σreceived per line across ALL batches and set order_state via
 * deriveOrderState(Σordered, Σreceived) — the fulfilment state stays derived,
 * never hand-set by this path.
 */
export async function recordReceipt(
  poId: string,
  input: {
    mode?: "vendor" | "admin_override";
    note?: string | null;
    lines: ReceiptLineInput[];
  },
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();

  // The PO must belong to this org…
  const { data: po } = await db
    .table("purchase_orders")
    .select("id, order_state")
    .eq("id", poId)
    .maybeSingle();
  if (!po) return { error: "Purchase order not found." };
  const poRow = po as unknown as { id: string; order_state: string };
  if (poRow.order_state === "cancelled") {
    return {
      error: "This order is cancelled — goods cannot be received against it.",
    };
  }

  // …and every receipt line must point at one of its lines.
  const incoming = (input.lines ?? []).filter(
    (l) => l.po_line_id && Number(l.qty_received) > 0,
  );
  if (incoming.length === 0) {
    return { error: "Enter a received quantity for at least one line." };
  }

  const { data: ownedLines } = await db
    .table("po_lines")
    .select("id, qty")
    .eq("po_id", poId);
  const ownedRows = (ownedLines ?? []) as unknown as {
    id: string;
    qty: number;
  }[];
  const ownedIds = new Set(ownedRows.map((l) => l.id));
  if (!incoming.every((l) => ownedIds.has(l.po_line_id))) {
    return { error: "Receipt references a line that does not belong to this order." };
  }

  // The batch header, then its lines.
  const { data: recData, error: recErr } = await db.table("po_receipts").insert({
    po_id: poId,
    received_by: ctx.userId,
    mode: input.mode === "vendor" ? "vendor" : "admin_override",
    note: input.note?.trim() || null,
  });
  if (recErr) return { error: recErr.message };
  const receiptId = (recData?.[0] as { id: string }).id;

  const { error: rlErr } = await db.table("po_receipt_lines").insert(
    incoming.map((l) => ({
      receipt_id: receiptId,
      po_line_id: l.po_line_id,
      qty_received: Number(l.qty_received) || 0,
    })),
  );
  if (rlErr) return { error: rlErr.message };

  // Recompute Σreceived per line across ALL receipts of this PO, then derive.
  const { data: allReceipts } = await db
    .table("po_receipts")
    .select("id")
    .eq("po_id", poId);
  const allIds = ((allReceipts ?? []) as unknown as { id: string }[]).map((r) => r.id);

  let receivedSum = 0;
  if (allIds.length > 0) {
    const { data: allRl } = await db
      .table("po_receipt_lines")
      .select("po_line_id, qty_received")
      .in("receipt_id", allIds);
    for (const rl of (allRl ?? []) as unknown as {
      po_line_id: string;
      qty_received: number;
    }[]) {
      receivedSum += Number(rl.qty_received) || 0;
    }
  }
  const orderedSum = ownedRows.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const next = deriveOrderState(orderedSum, receivedSum);
  const { error: updErr } = await db
    .table("purchase_orders")
    .updateById(poId, { order_state: next, updated_at: new Date().toISOString() });
  return updErr ? { error: updErr.message } : {};
}
