"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelLeave,
  checkIn,
  checkOut,
  createTask,
  decideExpense,
  decideLeave,
  deleteTask,
  endVisit,
  requestLeave,
  retireOption,
  setTaskStatus,
  startVisit,
  submitExpense,
  toggleChecklistItem,
  updateTask,
  upsertOption,
} from "@/lib/data/workspace";
import { updateMemberProfile } from "@/lib/data/team";
import {
  EXPENSE_STATUSES,
  MEMBER_ROLES,
  OPTION_KINDS,
  TASK_STATUSES,
} from "@/lib/workspace-model";

/**
 * Workspace server actions. Every one validates with zod, calls a data-module
 * function (which opens withOrg() and therefore scopes to the caller's org),
 * then revalidates /dashboard. Manager-only operations are re-checked inside
 * the data module — never trusted from the form.
 */

export type FormState = { error?: string; ok?: boolean } | undefined;

function fail(message: string): FormState {
  return { error: message };
}

function done(): FormState {
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Combine a date input and a time input into an ISO instant, or null. */
function toInstant(date: FormDataEntryValue | null, time: FormDataEntryValue | null): string | null {
  const d = String(date ?? "").trim();
  if (!d) return null;
  const t = String(time ?? "").trim() || "18:00";
  const dt = new Date(`${d}T${t}`);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

/* ── Attendance ───────────────────────────────────────────────────────────── */

export async function checkInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const r = await checkIn({
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
    location_label: String(formData.get("location_label") ?? "") || null,
  });
  return r.error ? fail(r.error) : done();
}

/** Plain form action (no state) — the button is only rendered when checked in. */
export async function checkOutAction(): Promise<void> {
  await checkOut();
  revalidatePath("/dashboard");
}

/* ── Tasks ────────────────────────────────────────────────────────────────── */

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  task_type: z.string().trim().min(1),
  priority: z.string().trim().min(1),
  assignee_id: z.string().trim().optional().nullable(),
  project_id: z.string().trim().optional().nullable(),
  lead_id: z.string().trim().optional().nullable(),
});

export async function createTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    task_type: formData.get("task_type") || "task",
    priority: formData.get("priority") || "medium",
    assignee_id: formData.get("assignee_id"),
    project_id: formData.get("project_id"),
    lead_id: formData.get("lead_id"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const checklist = String(formData.get("checklist") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const r = await createTask({
    ...parsed.data,
    due_at: toInstant(formData.get("due_date"), formData.get("due_time")),
    checklist,
  });
  return r.error ? fail(r.error) : done();
}

export async function updateTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("projects.project.edit");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing task.");
  const parsed = taskSchema.partial().safeParse({
    title: formData.get("title") ?? undefined,
    description: formData.get("description") ?? undefined,
    task_type: formData.get("task_type") ?? undefined,
    priority: formData.get("priority") ?? undefined,
    assignee_id: formData.get("assignee_id") ?? undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const r = await updateTask(id, {
    ...parsed.data,
    ...(formData.get("due_date") !== null
      ? { due_at: toInstant(formData.get("due_date"), formData.get("due_time")) }
      : {}),
  });
  return r.error ? fail(r.error) : done();
}

export async function setTaskStatusAction(formData: FormData): Promise<void> {
  if (!(await can("projects.project.edit"))) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !(TASK_STATUSES as readonly string[]).includes(status)) return;
  await setTaskStatus(id, status as (typeof TASK_STATUSES)[number]);
  revalidatePath("/dashboard");
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  if (!(await can("projects.task.delete"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteTask(id);
  revalidatePath("/dashboard");
}

export async function toggleChecklistAction(formData: FormData): Promise<void> {
  if (!(await can("projects.project.edit"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await toggleChecklistItem(id, String(formData.get("done")) === "true");
  revalidatePath("/dashboard");
}

/* ── Leave ────────────────────────────────────────────────────────────────── */

const leaveSchema = z.object({
  leave_type: z.string().trim().min(1),
  from_date: z.string().trim().min(1, "Pick a start date."),
  to_date: z.string().trim().min(1, "Pick an end date."),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export async function requestLeaveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = leaveSchema.safeParse({
    leave_type: formData.get("leave_type") || "casual",
    from_date: formData.get("from_date"),
    to_date: formData.get("to_date"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const r = await requestLeave(parsed.data);
  return r.error ? fail(r.error) : done();
}

export async function decideLeaveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("hr.leave.approve");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) {
    return fail("Invalid decision.");
  }
  const r = await decideLeave(id, decision, String(formData.get("note") ?? ""));
  return r.error ? fail(r.error) : done();
}

export async function cancelLeaveAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await cancelLeave(id);
  revalidatePath("/dashboard");
}

/* ── Expenses ─────────────────────────────────────────────────────────────── */

const expenseSchema = z.object({
  spent_on: z.string().trim().min(1, "Pick the date you spent it."),
  amount: z.coerce.number().positive("Enter the amount you spent."),
  category: z.string().trim().min(1),
  project_label: z.string().trim().max(200).optional().nullable(),
  remark: z.string().trim().max(1000).optional().nullable(),
});

export async function submitExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = expenseSchema.safeParse({
    spent_on: formData.get("spent_on"),
    amount: formData.get("amount"),
    category: formData.get("category") || "other",
    project_label: formData.get("project_label"),
    remark: formData.get("remark"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const projectId = String(formData.get("project_id") ?? "").trim();
  const r = await submitExpense({ ...parsed.data, project_id: projectId || null });
  return r.error ? fail(r.error) : done();
}

export async function decideExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("billing.payment.approve");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !(EXPENSE_STATUSES as readonly string[]).includes(decision) || decision === "submitted") {
    return fail("Invalid decision.");
  }
  const r = await decideExpense(
    id,
    decision as Exclude<(typeof EXPENSE_STATUSES)[number], "submitted">,
    String(formData.get("note") ?? ""),
  );
  return r.error ? fail(r.error) : done();
}

/* ── Field visits ─────────────────────────────────────────────────────────── */

export async function startVisitAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const purpose = String(formData.get("purpose") ?? "site_visit");
  const r = await startVisit({
    purpose,
    title: String(formData.get("title") ?? "") || null,
    location_label: String(formData.get("location_label") ?? "") || null,
    project_id: String(formData.get("project_id") ?? "") || null,
    lead_id: String(formData.get("lead_id") ?? "") || null,
  });
  return r.error ? fail(r.error) : done();
}

export async function endVisitAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await endVisit(id, String(formData.get("notes") ?? ""));
  revalidatePath("/dashboard");
}

/* ── Tenant configuration ─────────────────────────────────────────────────── */

export async function upsertOptionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("settings.workspace.edit");
  if (denied) return denied;
  const kind = String(formData.get("kind") ?? "");
  if (!(OPTION_KINDS as readonly string[]).includes(kind)) return fail("Unknown list.");
  const label = String(formData.get("label") ?? "");
  const r = await upsertOption({
    id: String(formData.get("id") ?? "") || undefined,
    kind: kind as (typeof OPTION_KINDS)[number],
    value: String(formData.get("value") ?? "") || label,
    label,
    tone: String(formData.get("tone") ?? "neutral"),
  });
  return r.error ? fail(r.error) : done();
}

export async function retireOptionAction(formData: FormData): Promise<void> {
  if (!(await can("settings.workspace.edit"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await retireOption(id);
  revalidatePath("/dashboard");
}

export async function updateMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("settings.user.edit");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing member.");
  const role = String(formData.get("role") ?? "");
  const r = await updateMemberProfile(id, {
    display_name: String(formData.get("display_name") ?? ""),
    designation: String(formData.get("designation") ?? ""),
    ...((MEMBER_ROLES as readonly string[]).includes(role) ? { role } : {}),
  });
  return r.error ? fail(r.error) : done();
}
