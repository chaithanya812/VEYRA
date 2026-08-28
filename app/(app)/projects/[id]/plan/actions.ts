"use server";

import { revalidatePath } from "next/cache";
import {
  applyMilestoneTemplates,
  createMilestone,
  deleteMilestone,
  updateMilestone,
} from "@/lib/data/project-milestones";

/**
 * Project Planning actions (PLAN-V4 §9.2).
 *
 * Every one of them revalidates the project itself as well as the plan: the
 * Summary's header band, the Milestones cell on the list and the Progress
 * Report all read the same rows, and a plan edit that leaves them stale is how
 * two screens start disagreeing about the same project.
 */

export type PlanState = { error?: string; ok?: boolean } | undefined;

function refresh(projectId: string): PlanState {
  revalidatePath(`/projects/${projectId}/plan`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/report`);
  revalidatePath("/projects");
  return { ok: true };
}

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export async function addMilestoneAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const r = await createMilestone({
    project_id: projectId,
    name: str(formData.get("name")),
    scope_item_id: str(formData.get("scope_item_id")) || null,
    planned_start: str(formData.get("planned_start")) || null,
    planned_end: str(formData.get("planned_end")) || null,
    assignee_id: str(formData.get("assignee_id")) || null,
    client_visible: formData.get("client_visible") === "on",
    sort_order: Number(formData.get("sort_order")) || 0,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function updateMilestoneAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const id = str(formData.get("id"));
  const projectId = str(formData.get("project_id"));
  if (!id || !projectId) return { error: "Missing milestone." };

  const progress = formData.get("progress_pct");
  const r = await updateMilestone(id, {
    status: str(formData.get("status")) || undefined,
    progress_pct: progress == null ? undefined : Math.min(100, Math.max(0, Number(progress) || 0)),
    planned_start: formData.has("planned_start") ? str(formData.get("planned_start")) || null : undefined,
    planned_end: formData.has("planned_end") ? str(formData.get("planned_end")) || null : undefined,
    assignee_id: formData.has("assignee_id") ? str(formData.get("assignee_id")) || null : undefined,
    client_visible: formData.has("client_visible")
      ? formData.get("client_visible") === "true"
      : undefined,
    last_update: formData.has("last_update") ? str(formData.get("last_update")) || null : undefined,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function deleteMilestoneAction(formData: FormData): Promise<void> {
  const id = str(formData.get("id"));
  const projectId = str(formData.get("project_id"));
  if (!id || !projectId) return;
  await deleteMilestone(id);
  refresh(projectId);
}

export async function applyTemplatesAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const r = await applyMilestoneTemplates({
    projectId,
    scopeGroup: str(formData.get("scope_group")),
    startDate: str(formData.get("start_date")),
    scopeItemId: str(formData.get("scope_item_id")) || null,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}
