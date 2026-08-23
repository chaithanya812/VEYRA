"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createStage,
  reorderStage,
  deleteStage,
  listStages,
  createFollowUp,
  completeFollowUp,
} from "@/lib/data/pipeline";

const stageSchema = z.object({
  name: z.string().trim().min(1, "Stage name is required").max(60),
});

export async function createStageAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const parsed = stageSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createStage({ name: parsed.data.name });
  if ("error" in result) return { error: result.error };

  revalidatePath("/pipeline/stages");
  revalidatePath("/pipeline");
  return undefined;
}

export async function reorderStageAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "");
  if (!id || (dir !== "up" && dir !== "down")) return;

  const stages = await listStages();
  const idx = stages.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= stages.length) return;

  // Swap the two neighbours' seq values; the board reads ordered by seq.
  await reorderStage(stages[idx].id, stages[swapWith].seq);
  await reorderStage(stages[swapWith].id, stages[idx].seq);
  revalidatePath("/pipeline/stages");
  revalidatePath("/pipeline");
}

export async function deleteStageAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteStage(id);
  revalidatePath("/pipeline/stages");
  revalidatePath("/pipeline");
}

const followUpSchema = z.object({
  lead_id: z.string().uuid("Pick a lead"),
  due_at: z.string().min(1, "Due date is required"),
  note: z.string().trim().max(4000).optional(),
});

export async function createFollowUpAction(
  formData: FormData,
): Promise<{ error?: string } | undefined> {
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
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await completeFollowUp(id);
  revalidatePath("/followups");
}
