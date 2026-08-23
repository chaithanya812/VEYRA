import "server-only";
import { withOrg } from "./with-org";
import {
  PROJECT_STAGES,
  PROJECT_HEALTH,
  HEALTH_META,
  STAGE_LABELS,
  computePnl,
  type Project,
  type ProjectHealth,
  type ProjectStage,
  type ProjectUpdate,
} from "@/lib/projects-model";

/**
 * Projects data module — follows the Leads reference pattern exactly: no table
 * is touched directly, everything goes through withOrg() so org_id filtering /
 * stamping is automatic and cross-tenant leakage is impossible by construction.
 *
 * Client-safe enums/types live in @/lib/projects-model (this file is server-only).
 *
 * Financial amounts (project_value, funds_received, total_payable) are CONFIG
 * the user enters — this module only stores/reads/SUMs them; no amount is ever
 * computed or invented here (HARD RULE 4).
 */
export {
  PROJECT_STAGES,
  PROJECT_HEALTH,
  HEALTH_META,
  STAGE_LABELS,
  computePnl,
  type Project,
  type ProjectHealth,
  type ProjectStage,
  type ProjectUpdate,
};

export async function listProjects(filter?: {
  stage?: ProjectStage;
}): Promise<Project[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("projects").select("*");
  if (filter?.stage) q = q.eq("stage", filter.stage);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Project[];
}

export async function projectPortfolio(): Promise<{
  total: number;
  portfolioValue: number;
  delayed: number;
}> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("projects")
    .select("project_value, health");
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    project_value: number | string | null;
    health: string;
  }[];
  return {
    total: rows.length,
    portfolioValue: rows.reduce((s, r) => s + (Number(r.project_value) || 0), 0),
    delayed: rows.filter((r) => r.health !== "on_track").length,
  };
}

export async function getProject(
  id: string,
): Promise<{ project: Project; updates: ProjectUpdate[] } | null> {
  const { db } = await withOrg();
  const { data: project, error } = await db
    .table("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!project) return null;

  const { data: updates } = await db
    .table("project_updates")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  return {
    project: project as unknown as Project,
    updates: (updates ?? []) as unknown as ProjectUpdate[],
  };
}

export async function createProject(input: {
  name: string;
  client_name?: string | null;
  lead_id?: string | null;
  stage?: ProjectStage;
  project_value?: number | null;
  start_date?: string | null;
  handover_date?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  address?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const { data, error } = await db.table("projects").insert({
    name: input.name,
    client_name: input.client_name ?? null,
    lead_id: input.lead_id ?? null,
    stage: input.stage ?? "planning",
    project_value: input.project_value ?? 0,
    start_date: input.start_date ?? null,
    handover_date: input.handover_date ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    pincode: input.pincode ?? null,
    address: input.address ?? null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;
  await db.table("project_updates").insert({
    project_id: id,
    kind: "created",
    note: "Project created",
    created_by: ctx.userId,
  });
  return { id };
}

export async function updateProjectStage(
  id: string,
  stage: ProjectStage,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { error } = await db.table("projects").updateById(id, {
    stage,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  await db.table("project_updates").insert({
    project_id: id,
    kind: "stage_change",
    note: `Stage changed to ${STAGE_LABELS[stage]}`,
    created_by: ctx.userId,
  });
  return {};
}

export async function addProjectNote(
  id: string,
  note: string,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { error } = await db.table("project_updates").insert({
    project_id: id,
    kind: "note",
    note,
    created_by: ctx.userId,
  });
  return error ? { error: error.message } : {};
}
