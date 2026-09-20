"use server";

import { z } from "zod";
import { submitPortalBid, type BidLineInput } from "@/lib/data/rfq";

export type FormState = { error?: string } | undefined;

const bidLineSchema = z.object({
  rfq_item_id: z.string().min(1),
  unit_rate: z.coerce.number().min(0, "Unit rate must be ≥ 0"),
  tax_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  freight: z.coerce.number().min(0).nullable().optional(),
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

/**
 * PUBLIC vendor-portal submit. There is no session, so this action cannot
 * call can() / requireCan() — that is the deliberate exception, in the same
 * voice as getSharedQuotation: the unguessable share_token is the capability;
 * share_enabled gates it. The token check is the first thing this action
 * does. No next/headers, no cookies(), no org from the caller.
 */
export async function submitPortalBidAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "This link is not active." };

  const itemIds = parseJson(formData.get("item_ids"), z.array(z.string().min(1)));
  if (itemIds === null || itemIds.length === 0) {
    return { error: "This RFQ has no line items to quote against." };
  }

  const rawLines: BidLineInput[] = [];
  for (const itemId of itemIds) {
    const rateRaw = formData.get(`unit_rate:${itemId}`);
    if (rateRaw == null || String(rateRaw).trim() === "") continue;
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

  const result = await submitPortalBid(token, {
    delivery_date: (formData.get("delivery_date") as string) || null,
    remark: (formData.get("remark") as string) || null,
    lines: rawLines,
  });
  if (result.error) return { error: result.error };
  return undefined;
}
