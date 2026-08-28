import "server-only";
import { withOrg } from "./with-org";
import { getActingContext, listMembers, type Member } from "./team";
import { listOptions } from "./workspace";
import { listLeadStatuses } from "./lead-management";
import {
  agentPerformance,
  callSummary,
  effectiveFollowUpStatus,
  followUpSummary,
  summaryByKind,
  type AgentPerformance,
  type CallRow,
  type CallSummary,
  type FollowUpKind,
  type FollowUpRow,
  type FollowUpSummary,
} from "@/lib/lead-management-model";
import type { WorkspaceOption } from "@/lib/workspace-model";

/**
 * Follow-ups — the scheduler behind the Overview / Follow-ups / Call logs /
 * Team tabs, and the reminders that surface on someone's workspace.
 *
 * A CALLBACK IS A REMINDER, NOT A DIALER. Creating one schedules "phone this
 * person at this time" and assigns it to a colleague; the app never places a
 * call. What actually happened on the phone is logged separately in
 * `interactions` (migration 0011), which already carries direction, status,
 * duration and provider. Intention and fact stay in different tables on
 * purpose — that is what lets the Team tab compare "planned" against "done".
 */

export interface FollowUpWithContext extends FollowUpRow {
  lead_name: string;
  lead_phone: string | null;
  assignee_name: string | null;
}

async function decorate(rows: FollowUpRow[]): Promise<FollowUpWithContext[]> {
  if (rows.length === 0) return [];
  const { db } = await withOrg();

  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];
  const leadById = new Map<string, { name: string; phone: string | null }>();
  if (leadIds.length > 0) {
    const { data } = await db.table("leads").select("id, name, phone").in("id", leadIds);
    for (const l of (data ?? []) as unknown as {
      id: string;
      name: string;
      phone: string | null;
    }[]) {
      leadById.set(l.id, { name: l.name, phone: l.phone });
    }
  }

  const members = await listMembers();
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  return rows.map((r) => ({
    ...r,
    lead_name: leadById.get(r.lead_id)?.name ?? "Unknown lead",
    lead_phone: leadById.get(r.lead_id)?.phone ?? null,
    assignee_name: r.member_id ? (nameById.get(r.member_id) ?? null) : null,
  }));
}

export async function listFollowUpsRich(filter?: {
  memberId?: string;
  leadId?: string;
  kind?: FollowUpKind;
}): Promise<FollowUpWithContext[]> {
  const { db } = await withOrg();
  let q = db.table("follow_ups").select("*");
  if (filter?.memberId) q = q.eq("member_id", filter.memberId);
  if (filter?.leadId) q = q.eq("lead_id", filter.leadId);
  if (filter?.kind) q = q.eq("kind", filter.kind);
  const { data, error } = await q.order("due_at", { ascending: true });
  if (error) throw error;
  return decorate((data ?? []) as unknown as FollowUpRow[]);
}

/** Call-channel interactions, for the Call logs tab and the connect rate. */
export async function listCalls(filter?: {
  leadId?: string;
}): Promise<CallRow[]> {
  const { db } = await withOrg();
  let q = db.table("interactions").select("*");
  if (filter?.leadId) q = q.eq("lead_id", filter.leadId);
  const { data, error } = await q.order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CallRow[];
}

export interface FollowUpsOverview {
  followUps: FollowUpWithContext[];
  calls: CallRow[];
  summary: FollowUpSummary;
  meetings: FollowUpSummary;
  callbacks: FollowUpSummary;
  callStats: CallSummary;
  performance: AgentPerformance[];
  members: Member[];
  options: WorkspaceOption[];
  actingMemberId: string;
}

/**
 * Everything the follow-ups screen renders. Every figure is a count or sum over
 * the rows returned in the same payload, so a tile and its table always agree.
 */
export async function getFollowUpsOverview(): Promise<FollowUpsOverview> {
  const [followUps, calls, members, options, acting] = await Promise.all([
    listFollowUpsRich(),
    listCalls(),
    listMembers(),
    listOptions(),
    getActingContext(),
  ]);

  const now = new Date();
  return {
    followUps,
    calls,
    summary: followUpSummary(followUps, now),
    meetings: summaryByKind(followUps, "meeting", now),
    callbacks: summaryByKind(followUps, "callback", now),
    callStats: callSummary(calls),
    performance: members.map((m) => agentPerformance(m, followUps, calls, now)),
    members,
    options,
    actingMemberId: acting.member.id,
  };
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

export interface FollowUpInput {
  lead_id: string;
  kind: FollowUpKind;
  title?: string | null;
  due_at: string;
  reminder_at?: string | null;
  priority?: string;
  member_id?: string | null;
  note?: string | null;
  attachment_url?: string | null;
}

export async function createFollowUp(
  input: FollowUpInput,
): Promise<{ error?: string; id?: string }> {
  const due = new Date(input.due_at);
  if (!Number.isFinite(due.getTime())) return { error: "Pick a valid date and time." };

  const { db, ctx } = await withOrg();
  const acting = await getActingContext();

  // The lead must belong to this org — withOrg scopes the lookup for us.
  const { data: lead } = await db
    .table("leads")
    .select("id, name")
    .eq("id", input.lead_id)
    .maybeSingle();
  if (!lead) return { error: "That lead is not in this workspace." };

  let assignee = input.member_id ?? acting.member.id;
  const members = await listMembers();
  if (!members.some((m) => m.id === assignee)) assignee = acting.member.id;

  const { data, error } = await db.table("follow_ups").insert({
    lead_id: input.lead_id,
    kind: input.kind === "meeting" ? "meeting" : "callback",
    title: input.title?.trim() || (lead as unknown as { name: string }).name,
    due_at: due.toISOString(),
    reminder_at: input.reminder_at || null,
    priority: input.priority || "medium",
    status: "upcoming",
    member_id: assignee,
    assigned_to: ctx.userId,
    note: input.note?.trim() || null,
    attachment_url: input.attachment_url?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  await db.table("lead_activities").insert({
    lead_id: input.lead_id,
    kind: "note",
    note: `${input.kind === "meeting" ? "Meeting" : "Callback"} scheduled for ${due.toLocaleString("en-IN")}`,
    created_by: ctx.userId,
  });
  return { id: (data?.[0] as { id: string }).id };
}

/**
 * Close a follow-up with what came of it. The outcome is a tenant-configured
 * value, and it lands on the lead as the latest remark so the list column the
 * owner asked for actually has something in it.
 */
export interface CompleteFollowUpOptions {
  /**
   * The status the user CONFIRMED in the dialog — usually what
   * `proposeFromOutcome` suggested, sometimes an override, often nothing.
   * Validated against the tenant's own ladder before anything moves.
   */
  nextStatus?: string | null;
  /** `yyyy-mm-dd` for the follow-on the user chose to book. */
  followOnDate?: string | null;
  followOnTime?: string | null;
}

export async function completeFollowUp(
  id: string,
  outcome?: string | null,
  note?: string | null,
  options: CompleteFollowUpOptions = {},
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const { data } = await db
    .table("follow_ups")
    .select("lead_id, kind, title, member_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Follow-up not found." };
  const row = data as unknown as {
    lead_id: string;
    kind: string;
    title: string | null;
    member_id: string | null;
  };

  const { error } = await db.table("follow_ups").updateById(id, {
    status: "completed",
    done: true,
    completed_at: new Date().toISOString(),
    outcome: outcome?.trim() || null,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
  if (error) return { error: error.message };

  const remark = note?.trim() || outcome?.trim();
  if (remark) {
    await db.table("leads").updateById(row.lead_id, {
      latest_remark: remark,
      updated_at: new Date().toISOString(),
    });
    await db.table("lead_activities").insert({
      lead_id: row.lead_id,
      kind: row.kind === "meeting" ? "note" : "call",
      note: remark,
      created_by: ctx.userId,
    });
  }

  // ── The outcome moves the lead — but only because someone said so ────────
  // `proposeFromOutcome` suggests; the dialog preselects; this writes what
  // came back. A status is never changed by the rule alone (PLAN-V4 §5.1c).
  const wanted = options.nextStatus?.trim();
  if (wanted) {
    const statuses = await listLeadStatuses();
    const def = statuses.find((s) => s.value === wanted && s.is_active);
    if (!def) return { error: "That status does not exist in this workspace." };

    const { error: statusError } = await db.table("leads").updateById(row.lead_id, {
      status: def.value,
      updated_at: new Date().toISOString(),
    });
    if (statusError) return { error: statusError.message };

    await db.table("lead_activities").insert({
      lead_id: row.lead_id,
      kind: "status_change",
      note: `Status changed to ${def.label} after a follow-up${
        outcome?.trim() ? ` (${outcome.trim()})` : ""
      }`,
      created_by: ctx.userId,
    });
  }

  // ── And books the next one, if the user kept the offer ───────────────────
  if (options.followOnDate) {
    const due = new Date(`${options.followOnDate}T${options.followOnTime || "10:00"}:00`);
    if (Number.isFinite(due.getTime())) {
      await createFollowUp({
        lead_id: row.lead_id,
        kind: row.kind === "meeting" ? "meeting" : "callback",
        title: row.title,
        due_at: due.toISOString(),
        member_id: row.member_id,
      });
    }
  }

  return {};
}

/**
 * Push a follow-up to a new time. The old row is marked `rescheduled` rather
 * than edited, and a fresh one is created pointing back at it — so "how many
 * times has this client moved us" is answerable, which editing in place would
 * destroy.
 */
export async function rescheduleFollowUp(
  id: string,
  newDueAt: string,
  note?: string | null,
): Promise<{ error?: string }> {
  const due = new Date(newDueAt);
  if (!Number.isFinite(due.getTime())) return { error: "Pick a valid new date and time." };

  const { db, ctx } = await withOrg();
  const { data } = await db.table("follow_ups").select("*").eq("id", id).maybeSingle();
  if (!data) return { error: "Follow-up not found." };
  const old = data as unknown as FollowUpRow;

  const { error } = await db.table("follow_ups").updateById(id, {
    status: "rescheduled",
    done: true,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
  if (error) return { error: error.message };

  const { error: insErr } = await db.table("follow_ups").insert({
    lead_id: old.lead_id,
    kind: old.kind,
    title: old.title,
    due_at: due.toISOString(),
    priority: old.priority,
    status: "upcoming",
    member_id: old.member_id,
    assigned_to: old.assigned_to,
    note: note?.trim() || old.note,
    rescheduled_from: id,
    created_by: ctx.userId,
  });
  return insErr ? { error: insErr.message } : {};
}

export async function cancelFollowUp(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db
    .table("follow_ups")
    .updateById(id, { status: "cancelled", done: true });
  return error ? { error: error.message } : {};
}

/**
 * Log a call that already happened. This is the FACT side of the pair — it
 * appends to `interactions`, the same table the Communication module reads.
 */
export async function logCall(input: {
  lead_id: string;
  direction: string;
  status: string;
  duration_sec?: number;
  disposition?: string | null;
  note?: string | null;
  customer_no?: string | null;
}): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  const acting = await getActingContext();

  const { error } = await db.table("interactions").insert({
    lead_id: input.lead_id,
    channel: "call",
    direction: input.direction === "inbound" ? "inbound" : "outbound",
    status: input.status || "connected",
    duration_sec: Math.max(0, Math.trunc(Number(input.duration_sec) || 0)),
    disposition: input.disposition?.trim() || null,
    note: input.note?.trim() || null,
    customer_no: input.customer_no?.trim() || null,
    provider: "manual",
    agent_id: acting.member.id,
    occurred_at: new Date().toISOString(),
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  if (input.note?.trim()) {
    await db.table("leads").updateById(input.lead_id, {
      latest_remark: input.note.trim(),
      updated_at: new Date().toISOString(),
    });
  }
  return {};
}

/**
 * The acting member's open follow-ups, for the workspace. This is the join the
 * owner asked for — "it could be in the task management section in the
 * dashboard" — done by projection rather than by copying rows into `tasks`.
 */
export async function myOpenFollowUps(): Promise<FollowUpWithContext[]> {
  const acting = await getActingContext();
  const rows = await listFollowUpsRich({ memberId: acting.member.id });
  const now = new Date();
  return rows.filter((r) => {
    const s = effectiveFollowUpStatus(r, now);
    return s === "upcoming" || s === "missed";
  });
}
