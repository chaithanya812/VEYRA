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

/* ── Templates (PLAN-V4 §9.2) ─────────────────────────────────────────────── */

export interface MilestoneTemplate {
  id: string;
  scope_group: string;
  name: string;
  offset_days: number;
  duration_days: number;
  seq: number;
  is_active: boolean;
  is_system: boolean;
}

/**
 * The owner: *"keep some normal tasks, like for the execution team you can keep
 * project kickoff, site measurements, understanding line design, final design…
 * so they can just select it as well. They don't need to always create."*
 *
 * Seeded from the milestone names visible across `105010` and `104636` — the
 * competitor's real vocabulary, which is a better starting point than anything
 * invented. `is_system` rows the tenant renames, reorders or retires.
 */
export const DEFAULT_MILESTONE_TEMPLATES: Omit<MilestoneTemplate, "id">[] = [
  ...[
    "Site Measurements",
    "Plan Layout Creation",
    "3D Modelling",
    "2D Detailed Drawings",
    "Final Design Signoff",
  ].map((name, i) => ({
    scope_group: "Design Team",
    name,
    offset_days: i * 7,
    duration_days: 7,
    seq: i,
    is_active: true,
    is_system: true,
  })),
  ...[
    "Project Kickoff",
    "Site Marking",
    "False Ceiling Channel Work",
    "Electrical Conduiting Work",
    "POP Punning Work",
    "Panelling Work",
    "ModularWoodwork Ordering",
    "Installation of Modular Cabinets",
    "Paint Work",
    "Cleaning",
  ].map((name, i) => ({
    scope_group: "Execution Team",
    name,
    offset_days: i * 10,
    duration_days: 10,
    seq: i,
    is_active: true,
    is_system: true,
  })),
  ...["Snag List", "Rectification", "Handover Signoff"].map((name, i) => ({
    scope_group: "Post Handover Team",
    name,
    offset_days: i * 5,
    duration_days: 5,
    seq: i,
    is_active: true,
    is_system: true,
  })),
];

export async function ensureDefaultMilestoneTemplates(): Promise<void> {
  const { db } = await withOrg();
  const { data } = await db.table("milestone_templates").select("scope_group, name");
  const have = new Set(
    ((data ?? []) as unknown as { scope_group: string; name: string }[]).map(
      (r) => `${r.scope_group}::${r.name}`,
    ),
  );
  const missing = DEFAULT_MILESTONE_TEMPLATES.filter(
    (t) => !have.has(`${t.scope_group}::${t.name}`),
  );
  if (missing.length === 0) return;
  await db.table("milestone_templates").insert(
    missing.map((t) => ({
      scope_group: t.scope_group,
      name: t.name,
      offset_days: t.offset_days,
      duration_days: t.duration_days,
      seq: t.seq,
      is_active: true,
      is_system: true,
    })),
  );
}

export async function listMilestoneTemplates(): Promise<MilestoneTemplate[]> {
  await ensureDefaultMilestoneTemplates();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("milestone_templates")
    .select("*")
    .order("scope_group", { ascending: true })
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MilestoneTemplate[];
}

/**
 * Lay a template group onto real dates and write the milestones.
 *
 * Dates are computed deterministically from the start date and the template's
 * day offsets — the same rule SmartPlan will use when it lands, because a
 * model may propose an ORDER but never a date, a quantity or a price.
 */
export async function applyMilestoneTemplates(input: {
  projectId: string;
  scopeGroup: string;
  startDate: string;
  templateIds?: string[];
  scopeItemId?: string | null;
}): Promise<{ created: number; error?: string }> {
  const templates = await listMilestoneTemplates();
  const chosen = templates.filter(
    (t) =>
      t.is_active &&
      t.scope_group === input.scopeGroup &&
      (!input.templateIds?.length || input.templateIds.includes(t.id)),
  );
  if (chosen.length === 0) return { created: 0, error: "Nothing selected." };

  const start = new Date(input.startDate);
  if (!Number.isFinite(start.getTime())) return { created: 0, error: "Pick a start date." };

  const { db, ctx } = await withOrg();
  const { data: project } = await db
    .table("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { created: 0, error: "That project is not in this workspace." };

  const { data: existing } = await db
    .table("project_milestones")
    .select("sort_order")
    .eq("project_id", input.projectId);
  const base = ((existing ?? []) as unknown as { sort_order: number }[]).length;

  const iso = (d: Date) =>
    `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;

  const rows = chosen.map((t, i) => {
    const from = new Date(start);
    from.setDate(from.getDate() + t.offset_days);
    const to = new Date(from);
    to.setDate(to.getDate() + Math.max(0, t.duration_days - 1));
    return {
      project_id: input.projectId,
      scope_item_id: input.scopeItemId ?? null,
      name: t.name,
      status: "not_started",
      progress_pct: 0,
      planned_start: iso(from),
      planned_end: iso(to),
      actual_start: null,
      actual_end: null,
      assignee_id: null,
      client_visible: false,
      last_update: null,
      sort_order: base + i,
      created_by: ctx.userId,
    };
  });

  const { error } = await db.table("project_milestones").insert(rows);
  if (error) return { created: 0, error: error.message };
  return { created: rows.length };
}
