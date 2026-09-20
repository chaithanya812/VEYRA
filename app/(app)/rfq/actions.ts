"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addVendorsToRfq,
  awardRfq,
  createRfq,
  createRfqFromMr,
  enterBid,
  removeRfqVendor,
  setVendorPortalShare,
  type BidLineInput,
  type RfqItemInput,
} from "@/lib/data/rfq";

export type FormState = { error?: string } | undefined;

/* ── Create ────────────────────────────────────────────────────────────────── */
const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  project_label: z.string().optional(),
  place_of_supply: z.string().optional(),
  bid_deadline: z.string().optional(),
});

const vendorIdsSchema = z.array(z.string().min(1));

const lineSchema = z.object({
  item_id: z.string().nullable().optional(),
  item_name: z.string().min(1, "Item is required"),
  uom: z.string().nullable().optional(),
  qty: z.coerce.number().min(0, "Qty must be ≥ 0"),
});

function parseJson<T>(raw: FormDataEntryValue | null, schema: z.ZodType<T>): T | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}

export async function createRfqAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("procurement.rfq.create");
  if (denied) return denied;
  const parsed = createSchema.safeParse({
    title: formData.get("title") || undefined,
    project_label: formData.get("project_label") || undefined,
    place_of_supply: formData.get("place_of_supply") || undefined,
    bid_deadline: formData.get("bid_deadline") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const vendorIds = parseJson(formData.get("vendors"), vendorIdsSchema);
  if (vendorIds === null) {
    return { error: "The vendor selection could not be read — try again." };
  }

  const items = parseJson(formData.get("items"), z.array(lineSchema));
  if (items === null) {
    return { error: "The line items could not be read — try again." };
  }
  const lines: RfqItemInput[] = items.map((l) => ({
    item_id: l.item_id || null,
    item_name: l.item_name,
    uom: l.uom || null,
    qty: l.qty,
  }));
  if (lines.length === 0) {
    return { error: "Add at least one line item to quote against." };
  }

  const result = await createRfq({
    mr_id: (formData.get("mr_id") as string) || null,
    title: parsed.data.title,
    project_label: parsed.data.project_label || null,
    place_of_supply: parsed.data.place_of_supply || null,
    bid_deadline: parsed.data.bid_deadline || null,
    vendorIds,
    items: lines,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/rfq");
  redirect(`/rfq/${result.id}`);
}

/** One-click conversion of a Material Request into a pre-filled RFQ draft. */
export async function createRfqFromMrAction(
  mrId: string,
): Promise<{ id?: string; error?: string }> {
  const denied = await requireCan("procurement.rfq.create");
  if (denied) return denied;
  if (!mrId) return { error: "Material request id is required." };
  const result = await createRfqFromMr(mrId);
  if ("error" in result) return { error: result.error };
  revalidatePath("/rfq");
  redirect(`/rfq/${result.id}`);
}

/* ── Vendors: add mid-RFQ / remove an invitation (PROC-04) ─────────────────── */

/**
 * Invite more vendors to an existing RFQ. `vendor_ids` arrives as a JSON array,
 * the same shape the create form posts. The data module refuses an
 * awarded/closed RFQ and dedupes against vendors already invited.
 */
export async function addVendorsToRfqAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("procurement.rfq.create");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing RFQ." };

  const vendorIds = parseJson(formData.get("vendor_ids"), vendorIdsSchema);
  if (vendorIds === null) {
    return { error: "The vendor selection could not be read — try again." };
  }
  if (vendorIds.length === 0) {
    return { error: "Pick at least one vendor to invite." };
  }

  const result = await addVendorsToRfq(id, vendorIds);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/rfq/${id}`);
  revalidatePath("/rfq");
  return undefined;
}

/**
 * Withdraw an invited vendor. Consumed as `<form action={...}>`, so it returns
 * void (4.2). There is no `rfq.delete` capability — `procurement.rfq.create`
 * governs the vendor set. The data module refuses an awarded/closed RFQ and any
 * vendor who has already bid; the screen only ever shows this control for a
 * vendor with no bids, so a refusal here is a backstop, not the normal path.
 */
export async function removeRfqVendorAction(formData: FormData): Promise<void> {
  if (!(await can("procurement.rfq.create"))) return;
  const id = String(formData.get("id") ?? "");
  const vendorId = String(formData.get("vendor_id") ?? "");
  if (!id || !vendorId) return;

  await removeRfqVendor(id, vendorId);

  revalidatePath(`/rfq/${id}`);
  revalidatePath("/rfq");
}

/* ── Proxy bid entry ───────────────────────────────────────────────────────── */
const bidLineSchema = z.object({
  rfq_item_id: z.string().min(1),
  unit_rate: z.coerce.number().min(0, "Unit rate must be ≥ 0"),
  tax_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  freight: z.coerce.number().min(0).nullable().optional(),
});

/**
 * Per-vendor proxy entry form: rates arrive as `unit_rate:<itemId>` /
 * `tax_pct:<itemId>` / `freight:<itemId>` fields alongside an `item_ids` JSON
 * array. Lines are assembled here and handed to the data module, which computes
 * landed line totals (never this action, never an LLM).
 */
export async function enterBidAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("procurement.rfq.create");
  if (denied) return denied;
  const rfqId = String(formData.get("rfqId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "");
  if (!rfqId || !vendorId) return { error: "Missing RFQ or vendor." };

  const itemIds = parseJson(formData.get("item_ids"), z.array(z.string().min(1)));
  if (itemIds === null || itemIds.length === 0) {
    return { error: "This RFQ has no line items to quote against." };
  }

  const rawLines: BidLineInput[] = [];
  for (const itemId of itemIds) {
    const rateRaw = formData.get(`unit_rate:${itemId}`);
    if (rateRaw == null || String(rateRaw).trim() === "") continue; // unquoted item
    const parsedLine = bidLineSchema.safeParse({
      rfq_item_id: itemId,
      unit_rate: rateRaw,
      tax_pct: formData.get(`tax_pct:${itemId}`) || null,
      freight: formData.get(`freight:${itemId}`) || null,
    });
    if (!parsedLine.success) {
      return {
        error: parsedLine.error.issues[0]?.message ?? "Invalid bid line",
      };
    }
    rawLines.push(parsedLine.data);
  }
  if (rawLines.length === 0) {
    return { error: "Enter at least one unit rate above zero." };
  }

  const result = await enterBid(rfqId, vendorId, {
    delivery_date: (formData.get("delivery_date") as string) || null,
    remark: (formData.get("remark") as string) || null,
    lines: rawLines,
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/rfq/${rfqId}`);
  revalidatePath("/rfq");
  return undefined;
}

/* ── Per-vendor portal link (mint / revoke) ───────────────────────────────── */

/**
 * Create or disable the signed-token portal URL for one invited vendor.
 * There is no `rfq.delete` capability — `procurement.rfq.create` governs the
 * vendor set and this link, matching add/remove vendor. The public submit
 * action is the session-less exception; this one is not.
 */
export async function setVendorPortalShareAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("procurement.rfq.create");
  if (denied) return denied;
  const rfqId = String(formData.get("rfqId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "");
  const enabled = String(formData.get("enabled")) === "true";
  if (!rfqId || !vendorId) return { error: "Missing RFQ or vendor." };

  const result = await setVendorPortalShare(rfqId, vendorId, enabled);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/rfq/${rfqId}`);
  revalidatePath("/rfq");
  return undefined;
}

/* ── Award ─────────────────────────────────────────────────────────────────── */

export type RfqActionState = { error?: string } | undefined;

/**
 * Award to the vendor a person chose, for the reason they gave.
 *
 * It returns its error instead of swallowing it (the old version returned
 * `void` and a refused award looked exactly like a successful one). PLAN-V4
 * §9.7: the cheapest bid is not automatically the winner, so a refusal here —
 * no reason, wrong vendor — has to be visible.
 */
export async function awardRfqAction(
  _prev: RfqActionState,
  formData: FormData,
): Promise<RfqActionState> {
  const denied = await requireCan("procurement.po.approve");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing RFQ." };

  const result = await awardRfq(id, {
    vendorId: String(formData.get("vendor_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/rfq/${id}`);
  revalidatePath("/rfq");
  revalidatePath("/orders");
  // Jump straight to the auto-drafted PO for the winning vendor when one was made.
  if (result.poId) redirect(`/orders/${result.poId}`);
  return undefined;
}
