"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addLeadRemark,
  createLeadFull,
  promoteToProject,
  retireLeadStatus,
  setLeadAssignees,
  setLeadStatus,
  updateLeadFull,
  upsertLeadStatus,
} from "@/lib/data/lead-management";
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  logCall,
  rescheduleFollowUp,
} from "@/lib/data/followups";

/**
 * Lead Management server actions. Every write validates with zod, then calls a
 * data-module function that opens withOrg() — so nothing here can reach across
 * tenants no matter what the form posts.
 */

export type FormState = { error?: string; ok?: boolean } | undefined;

function fail(message: string): FormState {
  return { error: message };
}

function refresh(id?: string): FormState {
  revalidatePath("/leads");
  revalidatePath("/followups");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/leads/${id}`);
  return { ok: true };
}

/** Combine a date and time field into an ISO instant. */
function instant(date: FormDataEntryValue | null, time: FormDataEntryValue | null): string {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim() || "10:00";
  return d ? `${d}T${t}` : "";
}

function opt(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? "").trim();
  return s === "" ? undefined : s;
}

/* ── Lead create / update ─────────────────────────────────────────────────── */

const leadFields = {
  name: z.string().trim().min(1, "The lead needs a name.").max(160),
  phone: z.string().trim().max(40).optional(),
  alt_phone: z.string().trim().max(40).optional(),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
  contact_role: z.string().trim().max(60).optional(),
  org_type: z.string().trim().max(40).optional(),
  source: z.string().trim().max(40).optional(),
  status: z.string().trim().max(60).optional(),
  value: z.string().trim().optional(),
  project_name: z.string().trim().max(160).optional(),
  project_type: z.string().trim().max(60).optional(),
  budget_band: z.string().trim().max(60).optional(),
  scope: z.string().trim().max(80).optional(),
  layout_sqft: z.string().trim().optional(),
  theme: z.string().trim().max(120).optional(),
  rooms: z.string().trim().max(500).optional(),
  description: z.string().trim().max(4000).optional(),
  tentative_start: z.string().trim().optional(),
  sales_owner_id: z.string().trim().optional(),
  address_line: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  pincode: z.string().trim().max(12).optional(),
  lat: z.string().trim().optional(),
  lng: z.string().trim().optional(),
  rating: z.string().trim().optional(),
};

const createSchema = z.object(leadFields);

function readLead(formData: FormData) {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(leadFields)) {
    const v = formData.get(key);
    if (v !== null) out[key] = String(v);
  }
  return out;
}

function toInput(d: Record<string, string | undefined>) {
  return {
    phone: d.phone ?? null,
    alt_phone: d.alt_phone ?? null,
    email: d.email || null,
    contact_role: d.contact_role ?? null,
    org_type: d.org_type ?? null,
    source: d.source,
    value: d.value ? Number(d.value) : null,
    project_name: d.project_name ?? null,
    project_type: d.project_type ?? null,
    budget_band: d.budget_band ?? null,
    scope: d.scope ?? null,
    layout_sqft: d.layout_sqft ? Number(d.layout_sqft) : null,
    theme: d.theme ?? null,
    rooms: d.rooms
      ? d.rooms.split(",").map((r) => r.trim()).filter(Boolean)
      : undefined,
    description: d.description ?? null,
    tentative_start: d.tentative_start || null,
    sales_owner_id: d.sales_owner_id || null,
    address_line: d.address_line ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    pincode: d.pincode ?? null,
    lat: d.lat ? Number(d.lat) : null,
    lng: d.lng ? Number(d.lng) : null,
    rating: d.rating ? Number(d.rating) : null,
  };
}

export async function createLeadAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSchema.safeParse(readLead(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const d = parsed.data as Record<string, string | undefined>;
  const result = await createLeadFull({
    ...toInput(d),
    name: d.name as string,
    status: d.status || "new",
  });
  if ("error" in result) return fail(result.error);

  revalidatePath("/leads");
  redirect(`/leads/${result.id}`);
}

export async function updateLeadAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing lead.");
  const parsed = createSchema.partial().safeParse(readLead(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const d = parsed.data as Record<string, string | undefined>;
  const r = await updateLeadFull(id, {
    ...toInput(d),
    ...(d.name !== undefined ? { name: d.name } : {}),
    client_portal: formData.get("client_portal") === "on",
  });
  return r.error ? fail(r.error) : refresh(id);
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) return;
  await setLeadStatus(id, status);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

export async function setAssigneesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing lead.");
  const ids = formData.getAll("member_id").map(String).filter(Boolean);
  const r = await setLeadAssignees(id, ids);
  return r.error ? fail(r.error) : refresh(id);
}

export async function addRemarkAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!id) return fail("Missing lead.");
  const r = await addLeadRemark(id, note);
  return r.error ? fail(r.error) : refresh(id);
}

export async function promoteToProjectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing lead.");
  const r = await promoteToProject(id);
  if (r.error) return fail(r.error);
  revalidatePath("/projects");
  refresh(id);
  redirect(`/projects/${r.projectId}`);
}

/* ── Follow-ups ───────────────────────────────────────────────────────────── */

const followUpSchema = z.object({
  lead_id: z.string().min(1, "Pick a lead."),
  kind: z.enum(["callback", "meeting"]),
  title: z.string().trim().max(200).optional(),
  due_date: z.string().trim().min(1, "Pick a date."),
  priority: z.string().trim().optional(),
  member_id: z.string().trim().optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function createFollowUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = followUpSchema.safeParse({
    lead_id: formData.get("lead_id"),
    kind: formData.get("kind") || "callback",
    title: opt(formData.get("title")),
    due_date: formData.get("due_date"),
    priority: opt(formData.get("priority")),
    member_id: opt(formData.get("member_id")),
    note: opt(formData.get("note")),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const d = parsed.data;
  const r = await createFollowUp({
    lead_id: d.lead_id,
    kind: d.kind,
    title: d.title ?? null,
    due_at: instant(formData.get("due_date"), formData.get("due_time")),
    reminder_at: opt(formData.get("reminder_at")) ?? null,
    priority: d.priority || "medium",
    member_id: d.member_id ?? null,
    note: d.note ?? null,
    attachment_url: opt(formData.get("attachment_url")) ?? null,
  });
  return r.error ? fail(r.error) : refresh(d.lead_id);
}

export async function completeFollowUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing follow-up.");
  const r = await completeFollowUp(
    id,
    opt(formData.get("outcome")) ?? null,
    opt(formData.get("note")) ?? null,
    {
      // Both come from the completion dialog, where the rule's proposal was
      // preselected and the user could change or clear it (PLAN-V4 §5.1c).
      nextStatus: opt(formData.get("next_status")) ?? null,
      followOnDate: opt(formData.get("follow_on_date")) ?? null,
    },
  );
  return r.error ? fail(r.error) : refresh(opt(formData.get("lead_id")));
}

export async function rescheduleFollowUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing follow-up.");
  const when = instant(formData.get("due_date"), formData.get("due_time"));
  if (!when) return fail("Pick the new date.");
  const r = await rescheduleFollowUp(id, when, opt(formData.get("note")) ?? null);
  return r.error ? fail(r.error) : refresh(opt(formData.get("lead_id")));
}

export async function cancelFollowUpAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await cancelFollowUp(id);
  revalidatePath("/followups");
  revalidatePath("/leads");
}

/* ── Call log ─────────────────────────────────────────────────────────────── */

export async function logCallAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const leadId = String(formData.get("lead_id") ?? "");
  if (!leadId) return fail("Missing lead.");

  const minutes = Number(formData.get("duration_min") ?? 0);
  const r = await logCall({
    lead_id: leadId,
    direction: String(formData.get("direction") ?? "outbound"),
    status: String(formData.get("status") ?? "connected"),
    duration_sec: Number.isFinite(minutes) ? Math.round(minutes * 60) : 0,
    disposition: opt(formData.get("disposition")) ?? null,
    note: opt(formData.get("note")) ?? null,
    customer_no: opt(formData.get("customer_no")) ?? null,
  });
  return r.error ? fail(r.error) : refresh(leadId);
}

/* ── Status configuration ─────────────────────────────────────────────────── */

export async function upsertLeadStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const r = await upsertLeadStatus({
    id: opt(formData.get("id")),
    label: String(formData.get("label") ?? ""),
    tone: String(formData.get("tone") ?? "neutral"),
    is_won: formData.get("is_won") === "on",
    is_lost: formData.get("is_lost") === "on",
  });
  return r.error ? fail(r.error) : refresh();
}

export async function retireLeadStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing status.");
  const r = await retireLeadStatus(id);
  return r.error ? fail(r.error) : refresh();
}
