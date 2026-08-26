"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addLine } from "@/lib/data/quotations";
import { structureScopeToBoq } from "@/lib/ai/boq";
import { isAiConfigured, type AiAttachment } from "@/lib/ai/provider";
import {
  deletePrompt,
  getQuotationSettings,
  logAiRequest,
  savePrompt,
} from "@/lib/data/quotation-studio";
import { guardMeteredCreate, recordUsage } from "@/lib/data/subscription";
import type { DiscountType } from "@/lib/quotations-model";

/**
 * AI prompt-to-BOQ (OPS-EST-002).
 *
 * The model structures a brief — optionally with a floor plan, a photo or a
 * spec sheet attached — into rooms and scope items. Every line is created at
 * ₹0 with the tenant's default GST rate, so the deterministic engine and the
 * user supply every number. THE AI NEVER PRICES; the validator in
 * lib/ai-boq-model strips price-shaped fields even if a model tries.
 *
 * Metered on the REQ-04 usage ledger and logged to `ai_requests`, so what was
 * asked, which model answered and how many lines it produced is auditable.
 */

export type AiBoqState =
  | { error?: string; count?: number; rooms?: number }
  | undefined;

const schema = z.object({
  quotationId: z.string().min(1),
  brief: z.string().trim().min(1, "Describe the project scope first.").max(6000),
  context: z.string().trim().max(2000).optional(),
});

/** Attachment ceilings — Gemini inlines base64, so this stays modest. */
const MAX_FILES = 4;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

/**
 * Read the uploaded files into base64. Anything oversized or of an unsupported
 * type is skipped rather than failing the whole request — a bad screenshot
 * should not cost the user their brief.
 */
async function readAttachments(
  formData: FormData,
): Promise<{ attachments: AiAttachment[]; skipped: string[] }> {
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  const attachments: AiAttachment[] = [];
  const skipped: string[] = [];

  for (const file of files.slice(0, MAX_FILES)) {
    if (file.size === 0) continue;
    if (!ALLOWED.includes(file.type)) {
      skipped.push(`${file.name} (unsupported type)`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      skipped.push(`${file.name} (over 4 MB)`);
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    attachments.push({
      mimeType: file.type,
      dataBase64: buf.toString("base64"),
      name: file.name,
    });
  }
  return { attachments, skipped };
}

export async function generateBoqAction(
  _prev: AiBoqState,
  formData: FormData,
): Promise<AiBoqState> {
  const parsed = schema.safeParse({
    quotationId: formData.get("quotationId"),
    brief: formData.get("brief"),
    context: formData.get("context") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { quotationId, brief, context } = parsed.data;

  if (!isAiConfigured()) {
    return { error: "AI is not configured on this server yet." };
  }

  const gate = await guardMeteredCreate("boqs");
  if (gate.error) return { error: gate.error };

  const { attachments, skipped } = await readAttachments(formData);
  const settings = await getQuotationSettings();

  const result = await structureScopeToBoq({ brief, context, attachments });
  if ("error" in result) {
    await logAiRequest({
      prompt: brief,
      attachments: attachments.length,
      status: "error",
      errorMessage: result.error,
      refId: quotationId,
    });
    return { error: result.error };
  }

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
        unit_price: 0, // the AI never prices — the engine and the user do
        discount_type: "amount" as DiscountType,
        discount_value: 0,
        tax_rate: Number(settings.default_gst_pct) || 18,
      });
      if (!("error" in r)) created++;
    }
  }

  await logAiRequest({
    prompt: brief,
    attachments: attachments.length,
    status: "ok",
    linesCreated: created,
    refId: quotationId,
  });
  if (created > 0) await recordUsage("boqs", 1, quotationId);

  revalidatePath(`/quotations/${quotationId}`);
  return {
    count: created,
    rooms: result.boq.rooms.length,
    ...(skipped.length > 0
      ? { error: `Generated, but skipped: ${skipped.join(", ")}.` }
      : {}),
  };
}

/* ── Prompt library ───────────────────────────────────────────────────────── */

export type PromptState = { error?: string; ok?: boolean } | undefined;

export async function savePromptAction(
  _prev: PromptState,
  formData: FormData,
): Promise<PromptState> {
  const r = await savePrompt({
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
  });
  if (r.error) return { error: r.error };
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${String(formData.get("quotationId") ?? "")}`);
  return { ok: true };
}

export async function deletePromptAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deletePrompt(id);
  revalidatePath("/quotations");
}
