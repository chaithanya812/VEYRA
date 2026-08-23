import "server-only";
import { withOrg } from "./with-org";
import { nameKey, phoneKey } from "@/lib/utils";
import {
  VENDOR_CATEGORIES,
  vendorRatingLabel,
  type Vendor,
  type VendorRateContract,
  type VendorCategory,
} from "@/lib/vendors-model";

/**
 * Vendors data module — follows the Leads/Items reference pattern exactly: no
 * table is touched directly, everything goes through withOrg() so org_id
 * filtering / stamping is automatic and cross-tenant leakage is impossible by
 * construction.
 *
 * Client-safe enums/types live in @/lib/vendors-model (this file is server-only).
 *
 * Rate-contract `rate` is CONFIG entered by the user (like items.base_rate) —
 * never produced by an LLM. `vendors.rating` stays null until computed from real
 * PO/GRN history; nothing in this module ever writes it.
 */
export {
  VENDOR_CATEGORIES,
  vendorRatingLabel,
  type Vendor,
  type VendorRateContract,
  type VendorCategory,
};

const COLS =
  "id, name, contact_person, phone, email, gstin, category, payment_terms, lead_time_days, rating, address, city, state, pincode, is_active, created_at, updated_at";

export async function listVendors(filter?: {
  category?: string;
  activeOnly?: boolean;
}): Promise<Vendor[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("vendors").select(COLS);
  if (filter?.category) q = q.eq("category", filter.category);
  if (filter?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Vendor[];
}

export async function getVendor(
  id: string,
): Promise<{ vendor: Vendor; contracts: VendorRateContract[] } | null> {
  const { db } = await withOrg();
  const { data: vendor, error } = await db
    .table("vendors")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!vendor) return null;

  return {
    vendor: vendor as unknown as Vendor,
    contracts: await listRateContracts(id),
  };
}

export interface VendorInput {
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  category?: string | null;
  payment_terms?: string | null;
  lead_time_days?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export async function createVendor(
  input: VendorInput,
): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();
  const key = nameKey(input.name);
  const pkey = phoneKey(input.phone);

  // Dedupe on normalised name (mirrors items) …
  const { data: dupName } = await db
    .table("vendors")
    .select("id")
    .eq("name_key", key)
    .maybeSingle();
  if (dupName) return { error: "A vendor with this name already exists." };

  // … and on normalised phone when one is supplied (mirrors leads, PLAN §6.1).
  if (pkey) {
    const { data: dupPhone } = await db
      .table("vendors")
      .select("id")
      .eq("phone_key", pkey)
      .maybeSingle();
    if (dupPhone) {
      return { error: "A vendor with this phone number already exists." };
    }
  }

  const { data, error } = await db.table("vendors").insert({
    name: input.name.trim(),
    name_key: key,
    contact_person: input.contact_person?.trim() || null,
    phone: input.phone?.trim() || null,
    phone_key: pkey,
    email: input.email?.trim() || null,
    gstin: input.gstin?.trim() || null,
    category: input.category?.trim() || null,
    payment_terms: input.payment_terms?.trim() || null,
    lead_time_days: input.lead_time_days ?? null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    pincode: input.pincode?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  return { id: (data?.[0] as { id: string }).id };
}

export async function updateVendor(
  id: string,
  patch: VendorInput,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const key = nameKey(patch.name);
  const pkey = phoneKey(patch.phone);

  // Name dedupe, excluding this row.
  const { data: nameHits } = await db
    .table("vendors")
    .select("id")
    .eq("name_key", key);
  const nameRows = (nameHits ?? []) as unknown as { id: string }[];
  if (nameRows.some((r) => r.id !== id)) {
    return { error: "Another vendor with this name already exists." };
  }
  // Phone dedupe, excluding this row.
  if (pkey) {
    const { data: phoneHits } = await db
      .table("vendors")
      .select("id")
      .eq("phone_key", pkey);
    const phoneRows = (phoneHits ?? []) as unknown as { id: string }[];
    if (phoneRows.some((r) => r.id !== id)) {
      return { error: "Another vendor with this phone number already exists." };
    }
  }

  const { error } = await db.table("vendors").updateById(id, {
    name: patch.name.trim(),
    name_key: key,
    contact_person: patch.contact_person?.trim() || null,
    phone: patch.phone?.trim() || null,
    phone_key: pkey,
    email: patch.email?.trim() || null,
    gstin: patch.gstin?.trim() || null,
    category: patch.category?.trim() || null,
    payment_terms: patch.payment_terms?.trim() || null,
    lead_time_days: patch.lead_time_days ?? null,
    address: patch.address?.trim() || null,
    city: patch.city?.trim() || null,
    state: patch.state?.trim() || null,
    pincode: patch.pincode?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

export async function deactivateVendor(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  // Soft-retire only — vendors are never hard-deleted (PO/GRN history points here).
  const { error } = await db
    .table("vendors")
    .updateById(id, { is_active: false, updated_at: new Date().toISOString() });
  return error ? { error: error.message } : {};
}

export interface RateContractInput {
  item_id?: string | null;
  item_name?: string | null;
  uom?: string | null;
  rate: number;
  moq?: number | null;
  lead_time_days?: number | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

export async function addRateContract(
  vendorId: string,
  input: RateContractInput,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();

  // The contract must point at a vendor of THIS org.
  const { data: vendor } = await db
    .table("vendors")
    .select("id")
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) return { error: "Vendor not found." };

  const { error } = await db.table("vendor_rate_contracts").insert({
    vendor_id: vendorId,
    item_id: input.item_id ?? null,
    item_name: input.item_name?.trim() || null,
    uom: input.uom?.trim() || null,
    rate: input.rate,
    moq: input.moq ?? null,
    lead_time_days: input.lead_time_days ?? null,
    valid_from: input.valid_from ?? null,
    valid_to: input.valid_to ?? null,
    created_by: ctx.userId,
  });
  return error ? { error: error.message } : {};
}

export async function listRateContracts(
  vendorId: string,
): Promise<VendorRateContract[]> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("vendor_rate_contracts")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as VendorRateContract[];
}
