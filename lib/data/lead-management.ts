import "server-only";
import { withOrg } from "./with-org";
import { getActingContext, listMembers, type Member } from "./team";
import { listOptions, ensureDefaultOptions } from "./workspace";
import { phoneKey } from "@/lib/utils";
import {
  DEFAULT_LEAD_STATUSES,
  DEFAULT_OUTCOME_RULES,
  financialYearOf,
  nextFollowUp,
  overdueCount,
  pipelineValue,
  type FollowUpRow,
  type LeadRow,
  type LeadStatusDef,
  type OutcomeRule,
} from "@/lib/lead-management-model";
import type { InsightLead } from "@/lib/lead-insights-model";
import type { WorkspaceOption } from "@/lib/workspace-model";
import type { LeadActivity } from "@/lib/leads-model";

/**
 * Lead Management data module — the 360° lead, its configurable statuses, its
 * assignees and its promotion into a project.
 *
 * Deliberately additive to lib/data/leads.ts rather than a replacement: the
 * existing list/create/status/note functions still ship and still work. What
 * lives here is the richer surface the owner asked for.
 *
 * Note the FK discipline: `leads.project_id` is a real reference to projects,
 * so "promote to project" produces a join and not a string match. That is the
 * pattern the rest of the codebase should move to.
 */

/* ── Statuses ─────────────────────────────────────────────────────────────── */

/** Seed the tenant's status ladder once. Never resurrects a retired row. */
export async function ensureDefaultLeadStatuses(): Promise<void> {
  const { db } = await withOrg();
  const { data } = await db.table("lead_statuses").select("value");
  const have = new Set(
    ((data ?? []) as unknown as { value: string }[]).map((r) => r.value),
  );
  const missing = DEFAULT_LEAD_STATUSES.filter((s) => !have.has(s.value));
  if (missing.length === 0) return;
  await db.table("lead_statuses").insert(
    missing.map((s) => ({
      value: s.value,
      label: s.label,
      seq: s.seq,
      tone: s.tone,
      is_won: s.is_won,
      is_lost: s.is_lost,
      is_system: true,
    })),
  );
}

export async function listLeadStatuses(): Promise<LeadStatusDef[]> {
  await ensureDefaultLeadStatuses();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("lead_statuses")
    .select("*")
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LeadStatusDef[];
}

/* ── Outcome rules ────────────────────────────────────────────────────────── */

/**
 * Seed the tenant's outcome rules once, the same two-tier way statuses and
 * workspace options are seeded: `is_system` rows the tenant edits or switches
 * off. Never resurrects a rule the tenant removed.
 */
export async function ensureDefaultOutcomeRules(): Promise<void> {
  const { db } = await withOrg();
  const { data } = await db.table("followup_outcome_rules").select("outcome_slug");
  const have = new Set(
    ((data ?? []) as unknown as { outcome_slug: string }[]).map((r) => r.outcome_slug),
  );
  const missing = DEFAULT_OUTCOME_RULES.filter((r) => !have.has(r.outcome_slug));
  if (missing.length === 0) return;
  await db.table("followup_outcome_rules").insert(
    missing.map((r) => ({
      outcome_slug: r.outcome_slug,
      next_status: r.next_status,
      auto_schedule_days: r.auto_schedule_days,
      is_active: r.is_active,
      is_system: true,
    })),
  );
}

export async function listOutcomeRules(): Promise<OutcomeRule[]> {
  await ensureDefaultOutcomeRules();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("followup_outcome_rules")
    .select("*")
    .order("outcome_slug", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OutcomeRule[];
}

/** One rule per outcome per org — the unique index makes this an upsert. */
export async function upsertOutcomeRule(input: {
  outcome_slug: string;
  next_status?: string | null;
  auto_schedule_days?: number | null;
  is_active?: boolean;
}): Promise<{ error?: string }> {
  const slug = input.outcome_slug.trim();
  if (!slug) return { error: "Pick an outcome." };

  // A rule may only point at a status that exists and is live — otherwise the
  // dialog would offer a move the lead cannot make.
  if (input.next_status) {
    const statuses = await listLeadStatuses();
    if (!statuses.some((st) => st.value === input.next_status && st.is_active)) {
      return { error: "That status does not exist in this workspace." };
    }
  }
  const days = input.auto_schedule_days;
  if (days != null && (!Number.isFinite(days) || days < 0 || days > 365)) {
    return { error: "Schedule the follow-on between 0 and 365 days out." };
  }

  const { db } = await withOrg();
  const { data } = await db
    .table("followup_outcome_rules")
    .select("id")
    .eq("outcome_slug", slug)
    .maybeSingle();

  const values = {
    outcome_slug: slug,
    next_status: input.next_status || null,
    auto_schedule_days: days ?? null,
    is_active: input.is_active ?? true,
  };

  const { error } = data
    ? await db
        .table("followup_outcome_rules")
        .updateById((data as unknown as { id: string }).id, values)
    : await db.table("followup_outcome_rules").insert(values);
  return error ? { error: error.message } : {};
}

/* ── Follow-up assignees ──────────────────────────────────────────────────── */

/**
 * Replace the assignee set wholesale — the form posts the full list, exactly
 * as `setLeadAssignees` does. `follow_ups.member_id` stays the primary owner
 * and is kept inside the set, so "who is on this?" is one read.
 */
export async function setFollowUpAssignees(
  followUpId: string,
  memberIds: string[],
): Promise<{ error?: string }> {
  const members = await listMembers();
  const valid = memberIds.filter((id) => members.some((m) => m.id === id));

  const { db } = await withOrg();
  const { data: fu } = await db
    .table("follow_ups")
    .select("id, member_id")
    .eq("id", followUpId)
    .maybeSingle();
  if (!fu) return { error: "That follow-up is not in this workspace." };
  const owner = (fu as unknown as { member_id: string | null }).member_id;

  const wanted = new Set(valid);
  if (owner) wanted.add(owner);

  const { data: current } = await db
    .table("follow_up_assignees")
    .select("id, member_id")
    .eq("follow_up_id", followUpId);
  const rows = (current ?? []) as unknown as { id: string; member_id: string }[];

  for (const r of rows) {
    if (!wanted.has(r.member_id)) await db.table("follow_up_assignees").deleteById(r.id);
  }
  const have = new Set(rows.map((r) => r.member_id));
  const add = [...wanted].filter((id) => !have.has(id));
  if (add.length === 0) return {};

  const { error } = await db
    .table("follow_up_assignees")
    .insert(add.map((member_id) => ({ follow_up_id: followUpId, member_id })));
  return error ? { error: error.message } : {};
}

/** Assignee ids keyed by follow-up, for a set of follow-ups. */
export async function followUpAssignees(
  followUpIds: string[],
): Promise<Record<string, string[]>> {
  if (followUpIds.length === 0) return {};
  const { db } = await withOrg();
  const { data } = await db
    .table("follow_up_assignees")
    .select("follow_up_id, member_id")
    .in("follow_up_id", followUpIds);
  const out: Record<string, string[]> = {};
  for (const r of (data ?? []) as unknown as {
    follow_up_id: string;
    member_id: string;
  }[]) {
    (out[r.follow_up_id] ??= []).push(r.member_id);
  }
  return out;
}

export async function upsertLeadStatus(input: {
  id?: string;
  label: string;
  tone?: string;
  is_won?: boolean;
  is_lost?: boolean;
}): Promise<{ error?: string }> {
  const label = input.label.trim();
  if (!label) return { error: "A status needs a label." };
  const { db } = await withOrg();

  if (input.id) {
    const { error } = await db.table("lead_statuses").updateById(input.id, {
      label,
      tone: input.tone ?? "neutral",
      ...(input.is_won !== undefined ? { is_won: input.is_won } : {}),
      ...(input.is_lost !== undefined ? { is_lost: input.is_lost } : {}),
    });
    return error ? { error: error.message } : {};
  }

  const value = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!value) return { error: "Could not derive a code from that label." };

  const existing = await listLeadStatuses();
  if (existing.some((s) => s.value === value)) {
    return { error: `"${label}" already exists.` };
  }

  const { error } = await db.table("lead_statuses").insert({
    value,
    label,
    seq: existing.length,
    tone: input.tone ?? "neutral",
    is_won: input.is_won ?? false,
    is_lost: input.is_lost ?? false,
    is_system: false,
  });
  return error ? { error: error.message } : {};
}

/**
 * Retire a status. Blocked while leads still sit on it — silently hiding a
 * status that rows point at is how a pipeline ends up with invisible leads.
 */
export async function retireLeadStatus(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data } = await db
    .table("lead_statuses")
    .select("value, is_system")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Status not found." };
  const row = data as unknown as { value: string; is_system: boolean };

  const { count } = await db
    .table("leads")
    .select("id", { count: "exact", head: true })
    .eq("status", row.value);
  if ((count ?? 0) > 0) {
    return {
      error: `${count} lead${count === 1 ? "" : "s"} still sit on this status — move them first.`,
    };
  }

  const { error } = row.is_system
    ? await db.table("lead_statuses").updateById(id, { is_active: false })
    : await db.table("lead_statuses").deleteById(id);
  return error ? { error: error.message } : {};
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export interface LeadListRow extends LeadRow {
  /** Every member assigned to this lead (multi-assignee). */
  assignees: Member[];
  followUpCount: number;
  overdueFollowUps: number;
  nextFollowUpAt: string | null;
  callCount: number;
}

export interface LeadListData {
  leads: LeadListRow[];
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
  members: Member[];
  total: number;
  value: number;
}

/**
 * Everything the Lead Management list needs, in one pass: leads, their
 * assignees, their follow-up state and their call counts. Assembled with a
 * handful of org-scoped queries and joined in memory rather than N+1 per row.
 */
export async function getLeadListData(): Promise<LeadListData> {
  await ensureDefaultOptions();
  const { db } = await withOrg();

  const [statuses, options, members] = await Promise.all([
    listLeadStatuses(),
    listOptions(),
    listMembers(),
  ]);

  const { data: leadRows, error } = await db
    .table("leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const leads = (leadRows ?? []) as unknown as LeadRow[];
  const ids = leads.map((l) => l.id);

  const [assigneeRes, followUpRes, callRes] = await Promise.all([
    ids.length
      ? db.table("lead_assignees").select("lead_id, member_id").in("lead_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.table("follow_ups").select("*").in("lead_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.table("interactions").select("lead_id, channel").in("lead_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const assigneesByLead = new Map<string, Member[]>();
  for (const a of (assigneeRes.data ?? []) as unknown as {
    lead_id: string;
    member_id: string;
  }[]) {
    const m = memberById.get(a.member_id);
    if (!m) continue;
    const list = assigneesByLead.get(a.lead_id) ?? [];
    list.push(m);
    assigneesByLead.set(a.lead_id, list);
  }

  const followUpsByLead = new Map<string, FollowUpRow[]>();
  for (const f of (followUpRes.data ?? []) as unknown as FollowUpRow[]) {
    const list = followUpsByLead.get(f.lead_id) ?? [];
    list.push(f);
    followUpsByLead.set(f.lead_id, list);
  }

  const callsByLead = new Map<string, number>();
  for (const c of (callRes.data ?? []) as unknown as {
    lead_id: string | null;
    channel: string;
  }[]) {
    if (!c.lead_id || c.channel !== "call") continue;
    callsByLead.set(c.lead_id, (callsByLead.get(c.lead_id) ?? 0) + 1);
  }

  const now = new Date();
  const rows: LeadListRow[] = leads.map((l) => {
    const fus = followUpsByLead.get(l.id) ?? [];
    const next = nextFollowUp(fus, now);
    return {
      ...l,
      rooms: l.rooms ?? [],
      assignees: assigneesByLead.get(l.id) ?? [],
      followUpCount: fus.length,
      overdueFollowUps: overdueCount(fus, now),
      nextFollowUpAt: next?.due_at ?? null,
      callCount: callsByLead.get(l.id) ?? 0,
    };
  });

  return {
    leads: rows,
    statuses,
    options,
    members,
    total: rows.length,
    value: pipelineValue(rows),
  };
}

/* ── Lead Insights ────────────────────────────────────────────────────────── */

export interface LeadInsightsData {
  leads: InsightLead[];
  statuses: LeadStatusDef[];
  members: Member[];
  options: WorkspaceOption[];
}

/**
 * Everything the insights screen aggregates, read once through withOrg().
 *
 * Deliberately a narrow select rather than reusing getLeadListData(): the
 * insights need six columns from every lead, not every column plus its
 * follow-ups, assignees and calls. The maths then happens in
 * lib/lead-insights-model.ts, which is pure and tested — so the range toggles
 * recompute in the browser without a round-trip.
 */
export async function getLeadInsightsData(): Promise<LeadInsightsData> {
  await ensureDefaultOptions();
  const { db } = await withOrg();

  const [statuses, options, members, leadRes] = await Promise.all([
    listLeadStatuses(),
    listOptions(),
    listMembers(),
    db
      .table("leads")
      .select("id, created_at, status, value, source, sales_owner_id, assigned_to")
      .order("created_at", { ascending: false }),
  ]);
  if (leadRes.error) throw leadRes.error;

  return {
    leads: (leadRes.data ?? []) as unknown as InsightLead[],
    statuses,
    members,
    options,
  };
}

export interface LeadDetail {
  lead: LeadRow;
  assignees: Member[];
  activities: LeadActivity[];
  followUps: FollowUpRow[];
  calls: {
    id: string;
    lead_id: string | null;
    channel: string;
    direction: string;
    status: string;
    duration_sec: number;
    agent_id: string | null;
    customer_no: string | null;
    disposition: string | null;
    note: string | null;
    provider: string | null;
    occurred_at: string;
  }[];
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
  members: Member[];
  /** What each outcome proposes when a follow-up is completed (§5.1c). */
  outcomeRules: OutcomeRule[];
  /** Member ids on each follow-up, keyed by follow-up id. */
  followUpAssignees: Record<string, string[]>;
}

/** One lead with everything its five tabs render. */
export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  await ensureDefaultOptions();
  const { db } = await withOrg();

  const { data: leadRow, error } = await db
    .table("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!leadRow) return null;
  const lead = leadRow as unknown as LeadRow;

  const [
    statuses,
    options,
    members,
    outcomeRules,
    activityRes,
    followUpRes,
    callRes,
    assigneeRes,
  ] =
    await Promise.all([
      listLeadStatuses(),
      listOptions(),
      listMembers(),
      listOutcomeRules(),
      db.table("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      db.table("follow_ups").select("*").eq("lead_id", id).order("due_at", { ascending: false }),
      db.table("interactions").select("*").eq("lead_id", id).order("occurred_at", { ascending: false }),
      db.table("lead_assignees").select("member_id").eq("lead_id", id),
    ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const assignees = ((assigneeRes.data ?? []) as unknown as { member_id: string }[])
    .map((a) => memberById.get(a.member_id))
    .filter((m): m is Member => !!m);

  const followUps = (followUpRes.data ?? []) as unknown as FollowUpRow[];

  return {
    lead: { ...lead, rooms: lead.rooms ?? [] },
    assignees,
    activities: (activityRes.data ?? []) as unknown as LeadActivity[],
    followUps,
    calls: (callRes.data ?? []) as unknown as LeadDetail["calls"],
    statuses,
    options,
    members,
    outcomeRules,
    followUpAssignees: await followUpAssignees(followUps.map((f) => f.id)),
  };
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

export interface LeadWriteInput {
  name?: string;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  contact_role?: string | null;
  org_type?: string | null;
  source?: string;
  status?: string;
  value?: number | null;
  project_name?: string | null;
  project_type?: string | null;
  budget_band?: string | null;
  scope?: string | null;
  layout_sqft?: number | null;
  theme?: string | null;
  rooms?: string[];
  description?: string | null;
  tentative_start?: string | null;
  sales_owner_id?: string | null;
  latest_remark?: string | null;
  rating?: number | null;
  client_portal?: boolean;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
}

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Create a lead with its full brief. Phone dedupe is preserved exactly as the
 * reference module does it (PLAN §6.1) — one lead per normalised phone per org,
 * which is the bug the competitor's list visibly has.
 */
export async function createLeadFull(
  input: LeadWriteInput & { name: string },
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "The lead needs a name." };

  const { db, ctx } = await withOrg();
  const key = phoneKey(input.phone);
  if (key) {
    const { data: existing } = await db
      .table("leads")
      .select("id, name")
      .eq("phone_key", key)
      .maybeSingle();
    if (existing) {
      const dup = existing as unknown as { name: string };
      return { error: `${dup.name} already has this phone number.` };
    }
  }

  const acting = await getActingContext();
  const { data, error } = await db.table("leads").insert({
    name,
    phone: clean(input.phone),
    phone_key: key,
    alt_phone: clean(input.alt_phone),
    email: clean(input.email),
    contact_role: clean(input.contact_role),
    org_type: clean(input.org_type) ?? "residential",
    source: input.source || "manual",
    status: input.status || "new",
    value: numOrNull(input.value),
    project_name: clean(input.project_name),
    project_type: clean(input.project_type),
    budget_band: clean(input.budget_band),
    scope: clean(input.scope),
    layout_sqft: numOrNull(input.layout_sqft),
    theme: clean(input.theme),
    rooms: input.rooms ?? [],
    description: clean(input.description),
    tentative_start: clean(input.tentative_start),
    financial_year: financialYearOf(new Date()),
    sales_owner_id: input.sales_owner_id || acting.member.id,
    address_line: clean(input.address_line),
    city: clean(input.city),
    state: clean(input.state),
    pincode: clean(input.pincode),
    notes: clean(input.notes),
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  // The creator owns it until someone reassigns.
  await db.table("lead_assignees").insert({ lead_id: id, member_id: acting.member.id });
  await db.table("lead_activities").insert({
    lead_id: id,
    kind: "created",
    note: `Lead created via ${input.source || "manual"}`,
    created_by: ctx.userId,
  });
  return { id };
}

/** Patch any subset of the 360° fields. Only the keys sent are touched. */
export async function updateLeadFull(
  id: string,
  input: LeadWriteInput,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const textFields = [
    "alt_phone", "email", "contact_role", "org_type", "project_name",
    "project_type", "budget_band", "scope", "theme", "description",
    "tentative_start", "latest_remark", "address_line", "city", "state",
    "pincode", "notes",
  ] as const;
  for (const f of textFields) {
    if (input[f] !== undefined) patch[f] = clean(input[f]);
  }
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) return { error: "The lead needs a name." };
    patch.name = n;
  }
  if (input.source !== undefined) patch.source = input.source;
  if (input.value !== undefined) patch.value = numOrNull(input.value);
  if (input.layout_sqft !== undefined) patch.layout_sqft = numOrNull(input.layout_sqft);
  if (input.lat !== undefined) patch.lat = numOrNull(input.lat);
  if (input.lng !== undefined) patch.lng = numOrNull(input.lng);
  if (input.rating !== undefined) patch.rating = numOrNull(input.rating);
  if (input.rooms !== undefined) patch.rooms = input.rooms;
  if (input.client_portal !== undefined) patch.client_portal = input.client_portal;
  if (input.sales_owner_id !== undefined) patch.sales_owner_id = input.sales_owner_id || null;

  // Re-normalise the dedupe key whenever the phone itself changes.
  if (input.phone !== undefined) {
    const key = phoneKey(input.phone);
    if (key) {
      const { data: clash } = await db
        .table("leads")
        .select("id")
        .eq("phone_key", key)
        .neq("id", id)
        .maybeSingle();
      if (clash) return { error: "Another lead already has this phone number." };
    }
    patch.phone = clean(input.phone);
    patch.phone_key = key;
  }

  const { error } = await db.table("leads").updateById(id, patch);
  if (error) return { error: error.message };

  if (input.status !== undefined) {
    return setLeadStatus(id, input.status);
  }
  await db.table("lead_activities").insert({
    lead_id: id,
    kind: "note",
    note: "Lead details updated",
    created_by: ctx.userId,
  });
  return {};
}

/** Move a lead to a status, writing the change onto its timeline. */
export async function setLeadStatus(
  id: string,
  status: string,
): Promise<{ error?: string }> {
  const statuses = await listLeadStatuses();
  const def = statuses.find((s) => s.value === status);
  if (!def) return { error: "That status does not exist in this workspace." };

  const { db, ctx } = await withOrg();
  const { error } = await db.table("leads").updateById(id, {
    status,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  await db.table("lead_activities").insert({
    lead_id: id,
    kind: "status_change",
    note: `Status changed to ${def.label}`,
    created_by: ctx.userId,
  });
  return {};
}

/** Replace the assignee set wholesale — the form posts the full list. */
export async function setLeadAssignees(
  leadId: string,
  memberIds: string[],
): Promise<{ error?: string }> {
  const members = await listMembers();
  const valid = memberIds.filter((id) => members.some((m) => m.id === id));

  const { db, ctx } = await withOrg();
  const { data: current } = await db
    .table("lead_assignees")
    .select("id, member_id")
    .eq("lead_id", leadId);
  const rows = (current ?? []) as unknown as { id: string; member_id: string }[];

  const keep = new Set(valid);
  for (const r of rows) {
    if (!keep.has(r.member_id)) await db.table("lead_assignees").deleteById(r.id);
  }
  const have = new Set(rows.map((r) => r.member_id));
  const add = valid.filter((id) => !have.has(id));
  if (add.length > 0) {
    const { error } = await db
      .table("lead_assignees")
      .insert(add.map((member_id) => ({ lead_id: leadId, member_id })));
    if (error) return { error: error.message };
  }

  await db.table("lead_activities").insert({
    lead_id: leadId,
    kind: "note",
    note: `Assigned to ${
      valid
        .map((id) => members.find((m) => m.id === id)?.name)
        .filter(Boolean)
        .join(", ") || "nobody"
    }`,
    created_by: ctx.userId,
  });
  return {};
}

export async function addLeadRemark(
  id: string,
  remark: string,
): Promise<{ error?: string }> {
  const note = remark.trim();
  if (!note) return { error: "Write something first." };
  const { db, ctx } = await withOrg();

  // The remark is both a timeline entry and the "latest remark" the list shows.
  const { error } = await db.table("lead_activities").insert({
    lead_id: id,
    kind: "note",
    note,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  await db.table("leads").updateById(id, {
    latest_remark: note,
    updated_at: new Date().toISOString(),
  });
  return {};
}

/**
 * Promote a won lead into a real project. The brief the lead has been carrying
 * (name, value, city, expected start) becomes the project, and `leads.project_id`
 * records the link as a foreign key — so the lead → project hop is a join.
 * Idempotent: a lead already promoted returns its existing project.
 */
export async function promoteToProject(
  leadId: string,
): Promise<{ error?: string; projectId?: string }> {
  const { db, ctx } = await withOrg();
  const { data: leadRow } = await db
    .table("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!leadRow) return { error: "Lead not found." };
  const lead = leadRow as unknown as LeadRow;
  if (lead.project_id) return { projectId: lead.project_id };

  const { data, error } = await db.table("projects").insert({
    name: lead.project_name?.trim() || `${lead.name} — project`,
    client_name: lead.name,
    lead_id: leadId,
    stage: "planning",
    health: "on_track",
    project_value: lead.value ?? 0,
    address: lead.address_line ?? null,
    city: lead.city ?? null,
    state: lead.state ?? null,
    pincode: lead.pincode ?? null,
    start_date: lead.tentative_start ?? null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const projectId = (data?.[0] as { id: string }).id;
  await db.table("leads").updateById(leadId, {
    project_id: projectId,
    updated_at: new Date().toISOString(),
  });
  await db.table("lead_activities").insert({
    lead_id: leadId,
    kind: "note",
    note: "Promoted to a project",
    created_by: ctx.userId,
  });
  return { projectId };
}
