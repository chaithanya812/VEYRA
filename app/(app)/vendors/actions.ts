"use server";
import { can, requireCan } from "@/lib/data/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createVendor,
  updateVendor,
  deactivateVendor,
  setVendorStatus,
  addRateContract,
  type VendorInput,
} from "@/lib/data/vendors";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  WORKING_MODELS,
  type VendorStatus,
  type WorkingModel,
} from "@/lib/vendors-model";

export type FormState = { error?: string } | undefined;

const vendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  gstin: z.string().optional(),
  category: z.string().optional(),
  // 0039: a vendor's trades are rows, so the form sends many.
  categories: z.array(z.string()).optional(),
  working_model: z.enum(WORKING_MODELS).optional(),
  country: z.string().optional(),
  payment_terms: z.string().optional(),
  lead_time_days: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
});

function parseForm(formData: FormData) {
  return vendorSchema.safeParse({
    name: formData.get("name"),
    contact_person: formData.get("contact_person") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    gstin: formData.get("gstin") || undefined,
    // Only a curated category (or none) is accepted from the select.
    category:
      formData.get("category") &&
      (VENDOR_CATEGORIES as readonly string[]).includes(
        String(formData.get("category")),
      )
        ? String(formData.get("category"))
        : undefined,
    // Every checked trade, filtered to the curated list — a form is where a
    // request is composed, never where it is trusted.
    categories: formData
      .getAll("categories")
      .map((v) => String(v ?? "").trim())
      .filter((v) => (VENDOR_CATEGORIES as readonly string[]).includes(v)),
    working_model: (WORKING_MODELS as readonly string[]).includes(
      String(formData.get("working_model") ?? ""),
    )
      ? (String(formData.get("working_model")) as WorkingModel)
      : undefined,
    country: formData.get("country") || undefined,
    payment_terms: formData.get("payment_terms") || undefined,
    lead_time_days: formData.get("lead_time_days") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    pincode: formData.get("pincode") || undefined,
  });
}

function toInput(d: z.infer<typeof vendorSchema>): VendorInput | { error: string } {
  const leadTime = d.lead_time_days ? Number(d.lead_time_days) : null;
  if (
    leadTime != null &&
    (!Number.isFinite(leadTime) || leadTime < 0 || !Number.isInteger(leadTime))
  ) {
    return { error: "Lead time must be a whole number of days." };
  }

  return {
    name: d.name,
    contact_person: d.contact_person || null,
    phone: d.phone || null,
    email: d.email || null,
    gstin: d.gstin || null,
    category: d.category || null,
    // The single select stays a valid source when nothing was ticked, so an
    // older form still saves the one trade it knows about.
    categories:
      d.categories && d.categories.length > 0
        ? d.categories
        : d.category
          ? [d.category]
          : [],
    working_model: d.working_model ?? null,
    country: d.country || null,
    payment_terms: d.payment_terms || null,
    lead_time_days: leadTime,
    address: d.address || null,
    city: d.city || null,
    state: d.state || null,
    pincode: d.pincode || null,
  };
}

export async function createVendorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("vendors.vendor.create");
  if (denied) return denied;
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = toInput(parsed.data);
  if ("error" in input) return { error: input.error };

  const result = await createVendor(input);
  if ("error" in result) return { error: result.error };

  revalidatePath("/vendors");
  redirect(`/vendors/${result.id}`);
}

export async function updateVendorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("vendors.vendor.create");
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing vendor id" };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = toInput(parsed.data);
  if ("error" in input) return { error: input.error };

  const result = await updateVendor(id, input);
  if (result.error) return { error: result.error };

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  redirect(`/vendors/${id}`);
}

/**
 * `Created` → `Verified` → `Onboarded` (`110215`).
 *
 * The step is re-checked server-side in `setVendorStatus`: forward only, and
 * only one hop at a time. A browser is a place to compose a request, never a
 * place to trust one from.
 */
export async function setVendorStatusAction(formData: FormData) {
  if (!(await can("vendors.vendor.create"))) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !(VENDOR_STATUSES as readonly string[]).includes(status)) return;

  const result = await setVendorStatus(id, status as VendorStatus);
  if (result.error) return;
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
}

export async function deactivateVendorAction(formData: FormData) {
  if (!(await can("vendors.vendor.delete"))) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await deactivateVendor(id);
  if (result.error) return;
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
}

const rateContractSchema = z.object({
  vendor_id: z.string().min(1, "Missing vendor"),
  item_name: z.string().min(1, "Item is required"),
  uom: z.string().optional(),
  rate: z.string().min(1, "Rate is required"),
  moq: z.string().optional(),
  lead_time_days: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
});

function toDateOrNull(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function addRateContractAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await requireCan("vendors.vendor.create");
  if (denied) return denied;
  const parsed = rateContractSchema.safeParse({
    vendor_id: formData.get("vendor_id"),
    item_name: formData.get("item_name"),
    uom: formData.get("uom") || undefined,
    rate: formData.get("rate"),
    moq: formData.get("moq") || undefined,
    lead_time_days: formData.get("lead_time_days") || undefined,
    valid_from: formData.get("valid_from") || undefined,
    valid_to: formData.get("valid_to") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Rate/MOQ are CONFIG the user types — validated as plain numbers, never
  // produced by an LLM.
  const rate = Number(parsed.data.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    return { error: "Rate must be a non-negative number." };
  }
  const moq = parsed.data.moq ? Number(parsed.data.moq) : null;
  if (moq != null && (!Number.isFinite(moq) || moq < 0)) {
    return { error: "MOQ must be a non-negative number." };
  }
  const lead = parsed.data.lead_time_days ? Number(parsed.data.lead_time_days) : null;
  if (
    lead != null &&
    (!Number.isFinite(lead) || lead < 0 || !Number.isInteger(lead))
  ) {
    return { error: "Lead time must be a whole number of days." };
  }
  const validFrom = toDateOrNull(parsed.data.valid_from);
  const validTo = toDateOrNull(parsed.data.valid_to);
  if (validFrom && validTo && validFrom > validTo) {
    return { error: "Valid-from must be on or before valid-to." };
  }

  const result = await addRateContract(parsed.data.vendor_id, {
    item_name: parsed.data.item_name.trim(),
    uom: parsed.data.uom?.trim() || null,
    rate,
    moq,
    lead_time_days: lead,
    valid_from: validFrom,
    valid_to: validTo,
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/vendors/${parsed.data.vendor_id}`);
  return {};
}
