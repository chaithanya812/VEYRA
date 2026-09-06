"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireCan } from "@/lib/data/permissions";
import { createDesignPrompt, deactivateDesignPrompt } from "@/lib/data/design-prompts";

/**
 * The design prompt library's server actions.
 *
 * No AI call is made here or anywhere in this feature — a prompt is assembled
 * in the browser by a pure function and copied to the clipboard. These two
 * actions only manage the tenant's own library rows.
 *
 * Guarded on `projects.project.edit`, the same capability the Design vault's
 * own writes use, because a prompt library entry is design collateral.
 */

const createSchema = z.object({
  name: z.string().min(1, "Give the prompt a name."),
  prompt: z.string().min(1, "The prompt itself cannot be empty."),
});

export async function createDesignPromptAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    prompt: formData.get("prompt"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createDesignPrompt(parsed.data);
  if (result.error) return { error: result.error };

  revalidatePath("/design/prompts");
  return undefined;
}

/**
 * Consumed as `<form action={...}>`, so it must return void — which is why it
 * guards with `can()` and a bare return rather than `requireCan()`'s object.
 */
export async function retireDesignPromptAction(formData: FormData): Promise<void> {
  if (!(await can("projects.project.edit"))) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deactivateDesignPrompt(id);
  revalidatePath("/design/prompts");
}
