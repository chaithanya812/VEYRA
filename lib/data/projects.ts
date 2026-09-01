import "server-only";
import { withOrg } from "./with-org";
import { listMembers, type Member } from "./team";
import { listProjectMilestones } from "./project-milestones";
import {
  rollupMilestones,
  type MilestoneRollup,
  type ProjectMilestone,
} from "@/lib/milestones-model";
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

/* ── The project workspace (PLAN-V4 §8.2) ─────────────────────────────────── */

export interface ProjectFinancials {
  projectValue: number;
  fundsReceived: number;
  totalDisbursed: number;
  totalReceivables: number;
  receivableDues: number;
  totalPayables: number;
  payableDues: number;
  cashFlow: number;
  pnl: number;
}

export interface ProjectWorkspaceData {
  project: Project;
  updates: ProjectUpdate[];
  milestones: ProjectMilestone[];
  rollup: MilestoneRollup;
  members: Member[];
  financials: ProjectFinancials;
  /** `client_visible` travels with the row: the Progress Report counts on it. */
  sitePhotos: {
    id: string;
    url: string | null;
    caption: string | null;
    client_visible: boolean;
    taken_on: string | null;
    created_at: string;
  }[];
  documents: { id: string; name: string; created_at: string }[];
  orders: {
    id: string;
    number: string | null;
    vendor: string | null;
    amount: number;
    order_state: string;
    payment_state: string | null;
  }[];
  requests: { id: string; title: string; stage: string; expected_delivery: string | null }[];
}

/**
 * Everything the Summary tab shows, in one org-scoped fan-out.
 *
 * Every figure here is DERIVED — summed from payments, contracts and milestone
 * rows at read time. `104529` shows the competitor's version of this band and
 * the owner called it *"the very most important part of the UI"*; the reason it
 * can be trusted is that nothing in it is a stored total anybody has to
 * remember to update.
 *
 * All of it joins on `project_id`. Before migration 0028 half these reads were
 * impossible — they matched a free-text label, so renaming a project emptied
 * its own summary.
 */
export async function getProjectWorkspace(
  id: string,
): Promise<ProjectWorkspaceData | null> {
  const { db } = await withOrg();
  const { data: projectRow, error } = await db
    .table("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!projectRow) return null;
  const project = projectRow as unknown as Project;

  const [
    updatesRes,
    milestones,
    members,
    paymentsRes,
    contractsRes,
    photosRes,
    assetsRes,
    ordersRes,
    requestsRes,
  ] = await Promise.all([
    db.table("project_updates").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    listProjectMilestones(id),
    listMembers(),
    db.table("payments").select("direction, amount").eq("project_id", id),
    db.table("contracts").select("amount, source").eq("project_id", id),
    db.table("site_photos").select("id, url, caption, client_visible, taken_on, created_at").eq("project_id", id).order("created_at", { ascending: false }),
    db.table("assets").select("id, name, created_at").eq("project_id", id).order("created_at", { ascending: false }),
    db.table("purchase_orders").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    db.table("material_requests").select("id, title, stage, expected_delivery").eq("project_id", id).order("created_at", { ascending: false }),
  ]);

  const payments = (paymentsRes.data ?? []) as unknown as {
    direction: string;
    amount: number | string | null;
  }[];
  const contracts = (contractsRes.data ?? []) as unknown as {
    amount: number | string | null;
    source: string;
  }[];

  const n = (v: number | string | null | undefined) => {
    const x = typeof v === "string" ? Number(v) : (v ?? 0);
    return Number.isFinite(x) ? x : 0;
  };
  const sum = (rows: { amount: number | string | null }[]) =>
    rows.reduce((t, r) => t + n(r.amount), 0);

  const fundsReceived = sum(payments.filter((p) => p.direction === "inflow"));
  const totalDisbursed = sum(payments.filter((p) => p.direction === "outflow"));
  const totalReceivables = sum(contracts.filter((c) => c.source === "client"));
  const totalPayables = sum(contracts.filter((c) => c.source !== "client"));

  return {
    project,
    updates: (updatesRes.data ?? []) as unknown as ProjectUpdate[],
    milestones,
    rollup: rollupMilestones(milestones),
    members,
    financials: {
      projectValue: n(project.project_value),
      fundsReceived,
      totalDisbursed,
      totalReceivables,
      // What the client still owes, and what we still owe — never below zero
      // by construction, because over-collection is a credit, not a debt.
      receivableDues: Math.max(0, totalReceivables - fundsReceived),
      totalPayables,
      payableDues: Math.max(0, totalPayables - totalDisbursed),
      cashFlow: fundsReceived - totalDisbursed,
      pnl: n(project.project_value) - totalPayables,
    },
    sitePhotos: (photosRes.data ?? []) as unknown as ProjectWorkspaceData["sitePhotos"],
    documents: (assetsRes.data ?? []) as unknown as ProjectWorkspaceData["documents"],
    orders: ((ordersRes.data ?? []) as unknown as Record<string, unknown>[]).map((o) => ({
      id: String(o.id),
      number: (o.name ?? null) as string | null,
      // The vendor's name needs its own read; the order carries only the id.
      vendor: (o.vendor_id ?? null) as string | null,
      amount: n(o.amount as number | string | null),
      order_state: String(o.order_state ?? "draft"),
      payment_state: (o.payment_state ?? null) as string | null,
    })),
    requests: (requestsRes.data ?? []) as unknown as ProjectWorkspaceData["requests"],
  };
}
