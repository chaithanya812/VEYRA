"use server";

import { revalidatePath } from "next/cache";
import {
  applyMilestoneTemplates,
  createMilestone,
  deleteMilestone,
  setMilestoneDependency,
  updateMilestone,
} from "@/lib/data/project-milestones";
import { createScopeItem } from "@/lib/data/scope-items";
import { createTask, deleteTask, setTaskStatus } from "@/lib/data/workspace";
import { TASK_STATUSES, type TaskStatus } from "@/lib/workspace-model";

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

/* ── Scope groups (`Add Scope` in `105010`) ───────────────────────────────── */

/**
 * A scope band is a `scope_items` row — the same spine every other module hangs
 * off (PLAN-V4 §7). Creating one here rather than inventing a "milestone group"
 * is the whole reason the spine exists: the band a milestone sits under is the
 * same row a quoted line, a material request and a PO resolve to.
 */
export async function addScopeAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const r = await createScopeItem({
    name: str(formData.get("name")),
    projectId,
    sortOrder: Number(formData.get("sort_order")) || 0,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

/* ── Dependencies ─────────────────────────────────────────────────────────── */

export async function toggleDependencyAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const projectId = str(formData.get("project_id"));
  const milestoneId = str(formData.get("milestone_id"));
  const dependsOnId = str(formData.get("depends_on_id"));
  if (!projectId || !milestoneId || !dependsOnId) return { error: "Missing milestone." };

  const r = await setMilestoneDependency({
    milestoneId,
    dependsOnId,
    on: formData.get("on") === "true",
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

/* ── Tasks (the third tab of `105010`) ────────────────────────────────────── */

/**
 * Tasks are the EXISTING `tasks` table filtered by project, not a new one.
 * `tasks.project_id` has been there since migration 0023 and the dashboard
 * already counts these rows — a second task table would mean the project tab
 * and "My work today" could disagree about the same job.
 */
export async function addProjectTaskAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const projectId = str(formData.get("project_id"));
  if (!projectId) return { error: "Missing project." };

  const due = str(formData.get("due_at"));
  const r = await createTask({
    title: str(formData.get("title")),
    description: str(formData.get("description")) || null,
    priority: str(formData.get("priority")) || "medium",
    // A date input gives a day; tasks are stamped, so pin it to end of day.
    due_at: due ? `${due}T18:00:00.000Z` : null,
    assignee_id: str(formData.get("assignee_id")) || null,
    project_id: projectId,
  });
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function setProjectTaskStatusAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!projectId || !id) return { error: "Missing task." };
  if (!(TASK_STATUSES as readonly string[]).includes(status)) {
    return { error: "That is not a task status." };
  }

  const r = await setTaskStatus(id, status as TaskStatus);
  return r.error ? { error: r.error } : refresh(projectId);
}

export async function deleteProjectTaskAction(formData: FormData): Promise<void> {
  const projectId = str(formData.get("project_id"));
  const id = str(formData.get("id"));
  if (!projectId || !id) return;
  await deleteTask(id);
  refresh(projectId);
}
