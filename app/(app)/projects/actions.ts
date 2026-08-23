"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createProject,
  updateProjectStage,
  addProjectNote,
  PROJECT_STAGES,
} from "@/lib/data/projects";
import type { ProjectStage } from "@/lib/projects-model";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  client_name: z.string().optional(),
  stage: z.enum(PROJECT_STAGES),
  project_value: z.string().optional(),
  start_date: z.string().optional(),
  handover_date: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  address: z.string().optional(),
});

export async function createProjectAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    client_name: formData.get("client_name") || undefined,
    stage: formData.get("stage"),
    project_value: formData.get("project_value") || undefined,
    start_date: formData.get("start_date") || undefined,
    handover_date: formData.get("handover_date") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    pincode: formData.get("pincode") || undefined,
    address: formData.get("address") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createProject({
    name: parsed.data.name,
    client_name: parsed.data.client_name ?? null,
    stage: parsed.data.stage as ProjectStage,
    project_value: parsed.data.project_value
      ? Number(parsed.data.project_value)
      : null,
    start_date: parsed.data.start_date || null,
    handover_date: parsed.data.handover_date || null,
    city: parsed.data.city ?? null,
    state: parsed.data.state ?? null,
    pincode: parsed.data.pincode ?? null,
    address: parsed.data.address ?? null,
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/projects");
  redirect(`/projects/${result.id}`);
}

export async function updateProjectStageAction(
  id: string,
  stage: string,
): Promise<{ error?: string }> {
  if (!PROJECT_STAGES.includes(stage as ProjectStage)) {
    return { error: "Invalid stage" };
  }
  const result = await updateProjectStage(id, stage as ProjectStage);
  if (result.error) return { error: result.error };
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return {};
}

export async function addProjectNoteAction(
  id: string,
  note: string,
): Promise<{ error?: string }> {
  const trimmed = note.trim();
  if (!trimmed) return { error: "Note cannot be empty" };
  const result = await addProjectNote(id, trimmed);
  if (result.error) return { error: result.error };
  revalidatePath(`/projects/${id}`);
  return {};
}
