"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFollowUp, completeFollowUp } from "@/lib/data/pipeline";

/**
 * Pipeline actions. The stage CRUD that used to live here wrote to
 * `pipeline_stages` — a table the board stopped reading at migration 0024 and
 * that nothing reads now. It is gone, along with /pipeline/stages; lead
 * statuses are edited on /settings/workspace (PLAN-V4 6.1).
 */

const followUpSchema = z.object({
  lead_id: z.string().uuid("Pick a lead"),
  due_at: z.string().min(1, "Due date is required"),
  note: z.string().trim().max(4000).optional(),
});

export async function createFollowUpAction(
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const denied = await requireCan("leads.lead.edit");
  if (denied) return denied;
  const parsed = followUpSchema.safeParse({
    lead_id: formData.get("lead_id") || "",
    due_at: formData.get("due_at") || "",
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // datetime-local arrives without a zone → interpret as the org's local time.
  const due = new Date(parsed.data.due_at);

  const result = await createFollowUp({
    lead_id: parsed.data.lead_id,
    due_at: Number.isNaN(due.getTime()) ? parsed.data.due_at : due.toISOString(),
    note: parsed.data.note ?? null,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/followups");
  return undefined;
}

export async function completeFollowUpAction(formData: FormData): Promise<void> {
  if (!(await can("leads.lead.edit"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await completeFollowUp(id);
  revalidatePath("/followups");
}
