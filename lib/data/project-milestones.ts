import "server-only";
import { withOrg } from "./with-org";
import { listMembers, type Member } from "./team";
import {
  rollupMilestones,
  type MilestoneRollup,
  type ProjectMilestone,
} from "@/lib/milestones-model";
import type { ScopeItem } from "@/lib/scope-model";

/**
 * The delivery plan, per project (PLAN-V4 §8.1 / §9.2).
 *
 * Note what is NOT here: any stored percentage or count. Every figure the UI
 * shows is rolled up from the milestone rows by a pure function, so ticking a
 * milestone changes the project's health immediately and no cached number can
 * drift away from the truth.
 */

export async function listProjectMilestones(
  projectId: string,
): Promise<ProjectMilestone[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("project_milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ProjectMilestone[];
}

/** Milestones for many projects at once — the list's Milestones cell. */
export async function milestonesByProject(
  projectIds: string[],
): Promise<Map<string, ProjectMilestone[]>> {
  const out = new Map<string, ProjectMilestone[]>();
  if (projectIds.length === 0) return out;

  const { db } = await withOrg();
  const { data, error } = await db
    .table("project_milestones")
    .select("*")
    .in("project_id", projectIds)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  for (const m of (data ?? []) as unknown as ProjectMilestone[]) {
    const list = out.get(m.project_id) ?? [];
    list.push(m);
    out.set(m.project_id, list);
  }
  return out;
}

export interface ProjectPlan {
  milestones: ProjectMilestone[];
  scopeItems: ScopeItem[];
  members: Member[];
  rollup: MilestoneRollup;
}

export async function getProjectPlan(projectId: string): Promise<ProjectPlan> {
  const { db } = await withOrg();
  const [milestones, members, scopeRes] = await Promise.all([
    listProjectMilestones(projectId),
    listMembers(),
    db
      .table("scope_items")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    milestones,
    scopeItems: (scopeRes.data ?? []) as unknown as ScopeItem[],
    members,
    rollup: rollupMilestones(milestones),
  };
}

export interface MilestoneInput {
  project_id: string;
  name: string;
  scope_item_id?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  assignee_id?: string | null;
  client_visible?: boolean;
  sort_order?: number;
}

export async function createMilestone(
  input: MilestoneInput,
): Promise<{ id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "A milestone needs a name." };

  const { db, ctx } = await withOrg();
  const { data: project } = await db
    .table("projects")
    .select("id")
    .eq("id", input.project_id)
    .maybeSingle();
  if (!project) return { error: "That project is not in this workspace." };

  const { data, error } = await db.table("project_milestones").insert({
    project_id: input.project_id,
    scope_item_id: input.scope_item_id ?? null,
    name,
    planned_start: input.planned_start || null,
    planned_end: input.planned_end || null,
    assignee_id: input.assignee_id ?? null,
    client_visible: input.client_visible ?? false,
    sort_order: input.sort_order ?? 0,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

/**
 * Progress, status, dates and the client-visible flag, in one place.
 *
 * Marking a milestone complete stamps `actual_end` if nobody supplied one —
 * without a real completion date the variance ("287 days late") cannot be
 * derived, and the whole planned-vs-actual column goes quiet.
 */
export async function updateMilestone(
  id: string,
  patch: {
    name?: string;
    status?: string;
    progress_pct?: number;
    planned_start?: string | null;
    planned_end?: string | null;
    actual_start?: string | null;
    actual_end?: string | null;
    assignee_id?: string | null;
    client_visible?: boolean;
    last_update?: string | null;
  },
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data: existing } = await db
    .table("project_milestones")
    .select("id, status, actual_end, actual_start")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "That milestone is not in this workspace." };
  const row = existing as unknown as {
    status: string;
    actual_end: string | null;
    actual_start: string | null;
  };

  const values: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  const today = new Date().toISOString().slice(0, 10);

  if (patch.status === "completed") {
    values.progress_pct = patch.progress_pct ?? 100;
    if (!row.actual_end && !patch.actual_end) values.actual_end = today;
    if (!row.actual_start && !patch.actual_start) values.actual_start = today;
  }
  if (patch.status === "in_progress" && !row.actual_start && !patch.actual_start) {
    values.actual_start = today;
  }

  const { error } = await db.table("project_milestones").updateById(id, values);
  return error ? { error: error.message } : {};
}

export async function deleteMilestone(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("project_milestones").deleteById(id);
  return error ? { error: error.message } : {};
}
