"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createPurchaseOrder,
  updateOrderState,
  updatePaymentState,
  recordReceipt,
} from "@/lib/data/purchase-orders";
import {
  ORDER_STATES,
  PAYMENT_STATES,
  type OrderState,
  type PaymentState,
} from "@/lib/po-model";
import type { PoLineInput, ReceiptLineInput } from "@/lib/data/purchase-orders";

export type FormState = { error?: string } | undefined;

/* ── Create (standalone/direct PO against a preferred vendor) ──────────────── */
const createSchema = z.object({
  name: z.string().min(1, "Order name is required"),
  vendor_id: z.string().min(1, "A vendor must be selected"),
  project_label: z.string().optional(),
  type: z.enum(["purchase_order", "work_order"]).optional(),
  order_date: z.string().optional(),
  delivery_date: z.string().optional(),
  payment_plan_id: z.string().optional(),
  po_terms_id: z.string().optional(),
});

const lineSchema = z.object({
  item_id: z.string().nullable().optional(),
  item_name: z.string().min(1, "Item name is required"),
  uom: z.string().nullable().optional(),
  qty: z.coerce.number().min(0, "Qty must be ≥ 0"),
  unit_rate: z.coerce.number().min(0, "Rate must be ≥ 0"),
  tax_pct: z.coerce.number().min(0).max(100).nullable().optional(),
});

function parseLines(raw: FormDataEntryValue | null): PoLineInput[] | null {
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
    uom: l.uom || null,
    qty: l.qty,
    unit_rate: l.unit_rate,
    tax_pct: l.tax_pct ?? null,
  }));
}

export async function createPurchaseOrderAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("procurement.po.create");
  if (denied) return denied;
  const parsed = createSchema.safeParse({
    name: formData.get("name") || undefined,
    vendor_id: formData.get("vendor_id") || undefined,
    project_label: formData.get("project_label") || undefined,
    type: formData.get("type") || undefined,
    order_date: formData.get("order_date") || undefined,
    delivery_date: formData.get("delivery_date") || undefined,
    payment_plan_id: formData.get("payment_plan_id") || undefined,
    po_terms_id: formData.get("po_terms_id") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const lines = parseLines(formData.get("lines"));
  if (lines === null) {
    return { error: "The line items could not be read — try again." };
  }

  const result = await createPurchaseOrder({
    name: parsed.data.name,
    vendor_id: parsed.data.vendor_id,
    project_label: parsed.data.project_label || null,
    type: parsed.data.type,
    order_date: parsed.data.order_date || null,
    delivery_date: parsed.data.delivery_date || null,
    payment_plan_id: parsed.data.payment_plan_id || null,
    po_terms_id: parsed.data.po_terms_id || null,
    lines,
  });
  if ("error" in result) return { error: result.error };

  // "Create" skips the draft parking state in one step; drafts stay parked.
  // A PO already routed to approval stays draft until the queue signs off (D5).
  const intent = String(formData.get("intent") ?? "draft");
  if (intent === "create" && !result.approval_routed) {
    await updateOrderState(result.id, "created");
  }

  revalidatePath("/orders");
  revalidatePath("/approvals");
  redirect(`/orders/${result.id}`);
}

/* ── State machines ───────────────────────────────────────────────────────── */
export async function updateOrderStateAction(formData: FormData) {
  if (!(await can("procurement.po.approve"))) return;
  const id = String(formData.get("id") ?? "");
  const state = String(formData.get("state"));
  if (!id || !(ORDER_STATES as readonly string[]).includes(state)) return;
  const result = await updateOrderState(id, state as OrderState);
  if (result.error) return;
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
}

export async function updatePaymentStateAction(formData: FormData) {
  if (!(await can("procurement.po.approve"))) return;
  const id = String(formData.get("id") ?? "");
  const state = String(formData.get("state"));
  if (!id || !(PAYMENT_STATES as readonly string[]).includes(state)) return;
  const result = await updatePaymentState(id, state as PaymentState);
  if (result.error) return;
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
}

/* ── Partial receipts ─────────────────────────────────────────────────────── */
const receiptSchema = z.object({
  poId: z.string().min(1),
  mode: z.enum(["vendor", "admin_override"]).optional(),
  note: z.string().optional(),
});

function parseReceiptLines(
  raw: FormDataEntryValue | null,
): ReceiptLineInput[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const lineSchema = z.object({
    po_line_id: z.string().min(1),
    qty_received: z.coerce.number().min(0),
  });
  const parsed = z.array(lineSchema).safeParse(parsedJson);
  if (!parsed.success) return null;
  return parsed.data.map((l) => ({
    po_line_id: l.po_line_id,
    qty_received: l.qty_received,
  }));
}

export async function recordReceiptAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("procurement.po.create");
  if (denied) return denied;
  const parsed = receiptSchema.safeParse({
    poId: formData.get("poId") || undefined,
    mode: formData.get("mode") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const lines = parseReceiptLines(formData.get("lines"));
  if (lines === null) {
    return { error: "The received quantities could not be read — try again." };
  }

  const result = await recordReceipt(parsed.data.poId, {
    mode: parsed.data.mode,
    note: parsed.data.note || null,
    lines,
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/orders/${parsed.data.poId}`);
  revalidatePath("/orders");
  return undefined;
}
