"use server";
import { requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logInteraction } from "@/lib/data/interactions";
import {
  CHANNELS,
  DIRECTIONS,
  DISPOSITIONS,
  STATUSES,
} from "@/lib/interactions-model";

export type InteractionFormResult = { error?: string } | undefined;

const logSchema = z.object({
  channel: z.enum(CHANNELS),
  direction: z.enum(DIRECTIONS),
  status: z.enum(STATUSES),
  customer_no: z.string().trim().max(64).optional(),
  lead_id: z
    .string()
    .uuid("Lead ID must be a valid id")
    .optional()
    .or(z.literal("")),
  duration_sec: z.coerce
    .number()
    .int("Duration must be whole seconds")
    .min(0)
    .max(86400, "Duration is too long")
    .optional(),
  disposition: z.enum(DISPOSITIONS).optional().or(z.literal("")),
  note: z.string().trim().max(4000).optional(),
});

export async function logInteractionAction(
  formData: FormData,
): Promise<InteractionFormResult> {
  const denied = await requireCan("leads.lead.edit");
  if (denied) return denied;
  const parsed = logSchema.safeParse({
    channel: formData.get("channel"),
    direction: formData.get("direction"),
    status: formData.get("status"),
    customer_no: formData.get("customer_no") || undefined,
    lead_id: formData.get("lead_id") || undefined,
    duration_sec: formData.get("duration_sec") || undefined,
    disposition: formData.get("disposition") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await logInteraction({
    channel: parsed.data.channel,
    direction: parsed.data.direction,
    status: parsed.data.status,
    customerNo: parsed.data.customer_no ?? null,
    leadId: parsed.data.lead_id || null,
    durationSec: parsed.data.duration_sec ?? 0,
    disposition: parsed.data.disposition || null,
    note: parsed.data.note ?? null,
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/communication");
  return undefined;
}
