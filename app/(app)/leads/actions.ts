"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createLead,
  updateLeadStatus,
  addLeadNote,
  LEAD_SOURCES,
  LEAD_STATUSES,
  type LeadSource,
  type LeadStatus,
} from "@/lib/data/leads";

export type FormState = { error?: string } | undefined;

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  source: z.enum(LEAD_SOURCES),
  value: z.string().optional(),
});

export async function createLeadAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    source: formData.get("source"),
    value: formData.get("value") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createLead({
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email || null,
    source: parsed.data.source as LeadSource,
    value: parsed.data.value ? Number(parsed.data.value) : null,
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/leads");
  redirect(`/leads/${result.id}`);
}

export async function setStatusAction(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return;
  await updateLeadStatus(id, status as LeadStatus);
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
}

export async function addNoteAction(formData: FormData) {
  const id = String(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;
  await addLeadNote(id, note);
  revalidatePath(`/leads/${id}`);
}
