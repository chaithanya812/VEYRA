"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addLine } from "@/lib/data/quotations";
import { structureScopeToBoq } from "@/lib/ai/anthropic";
import { guardMeteredCreate, recordUsage } from "@/lib/data/subscription";
import type { DiscountType } from "@/lib/quotations-model";

export type AiBoqState = { error?: string; count?: number } | undefined;

const schema = z.object({
  quotationId: z.string().min(1),
  brief: z.string().min(1, "Describe the project scope first.").max(4000),
});

/**
 * AI prompt-to-BOQ (REQ-01): Claude structures the brief into rooms → scope
 * items with qty/uom; we create the quotation lines with unit_price = 0 so the
 * deterministic engine + the user supply every rate (the AI NEVER prices).
 * Metered against the REQ-04 usage ledger.
 */
export async function generateBoqAction(
  _prev: AiBoqState,
  formData: FormData,
): Promise<AiBoqState> {
  const parsed = schema.safeParse({
    quotationId: formData.get("quotationId"),
    brief: formData.get("brief"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { quotationId, brief } = parsed.data;

  const gate = await guardMeteredCreate("boqs");
  if (gate.error) return { error: gate.error };

  const result = await structureScopeToBoq(brief);
  if ("error" in result) return { error: result.error };

  let created = 0;
  for (const room of result.boq.rooms) {
    for (const line of room.lines) {
      const r = await addLine(quotationId, {
        section_id: null,
        title: line.title,
        area: room.name,
        category: line.category,
        description: line.description,
        qty: line.qty,
        uom: line.uom,
        unit_price: 0, // AI never prices — rate is set by the engine/user
        discount_type: "amount" as DiscountType,
        discount_value: 0,
        tax_rate: 18,
      });
      if (!("error" in r)) created++;
    }
  }

  if (created > 0) await recordUsage("boqs", 1, quotationId);
  revalidatePath(`/quotations/${quotationId}`);
  return { count: created };
}
