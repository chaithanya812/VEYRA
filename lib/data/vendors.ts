import "server-only";
import { withOrg } from "./with-org";
import { nameKey, phoneKey } from "@/lib/utils";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_META,
  WORKING_MODELS,
  nextVendorStatuses,
  vendorProjects,
  vendorProjectTotals,
  vendorRatingLabel,
  vendorStatusOf,
  workingModelOf,
  type Vendor,
  type VendorRateContract,
  type VendorCategory,
  type VendorProjectRow,
  type VendorProjectTotals,
  type VendorStatus,
  type WorkingModel,
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
  VENDOR_STATUSES,
  WORKING_MODELS,
  vendorRatingLabel,
  type Vendor,
  type VendorRateContract,
  type VendorCategory,
  type VendorStatus,
  type WorkingModel,
};

const COLS =
  "id, name, contact_person, phone, email, gstin, category, working_model, status, country, payment_terms, lead_time_days, rating, address, city, state, pincode, is_active, created_at, updated_at";

/**
 * Attach every vendor's trades in ONE read, never one query per row.
 *
 * `vendors.category` (0008) is the pre-0039 single value and survives as the
 * display fallback for any vendor the backfill did not reach — the same role
 * `project_label` plays for a project FK (0028).
 */
async function withCategories(
  rows: Record<string, unknown>[],
): Promise<Vendor[]> {
  const ids = rows.map((r) => String(r.id));
  const byVendor = new Map<string, string[]>();
  if (ids.length > 0) {
    const { db } = await withOrg();
    const { data } = await db
      .table("vendor_categories")
      .select("vendor_id, category")
      .in("vendor_id", ids)
      .order("category", { ascending: true });
    for (const c of (data ?? []) as unknown as {
      vendor_id: string;
      category: string;
    }[]) {
      const list = byVendor.get(c.vendor_id) ?? [];
      list.push(c.category);
      byVendor.set(c.vendor_id, list);
    }
  }

  return rows.map((r) => {
    const rowCats = byVendor.get(String(r.id));
    const fallback = (r.category as string | null)?.trim();
    return {
      ...(r as unknown as Vendor),
      working_model: workingModelOf(r.working_model as string | null),
      status: vendorStatusOf(r.status as string | null),
      country: (r.country as string | null) ?? null,
      categories: rowCats ?? (fallback ? [fallback] : []),
    };
  });
}

export interface VendorFilter {
  /** Matches a vendor that CARRIES this trade, in `vendor_categories`. */
  category?: string;
  workingModel?: WorkingModel;
  status?: VendorStatus;
  country?: string;
  state?: string;
  city?: string;
  activeOnly?: boolean;
  /** Name / phone / contact person, case-insensitive. */
  query?: string;
}

/**
 * The list behind `110215`, with the frame's whole filter band.
 *
 * The category filter reads `vendor_categories` FIRST and then pins the ids,
 * rather than matching a substring of a joined string. "Which vendors do POP
 * work" has to be a lookup, or it also returns "POP Work Removal".
 */
export async function listVendors(filter?: VendorFilter): Promise<Vendor[]> {
  const { db } = await withOrg();

  let categoryIds: string[] | null = null;
  if (filter?.category) {
    const { data } = await db
      .table("vendor_categories")
      .select("vendor_id")
      .ilike("category", filter.category);
    categoryIds = [
      ...new Set(
        ((data ?? []) as unknown as { vendor_id: string }[]).map((r) =>
          String(r.vendor_id),
        ),
      ),
    ];
    // Nobody carries that trade. Returning early avoids an `.in([])`, which
    // PostgREST answers with everything rather than with nothing.
    if (categoryIds.length === 0) return [];
  }

  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("vendors").select(COLS);
  if (categoryIds) q = q.in("id", categoryIds);
  if (filter?.workingModel) q = q.eq("working_model", filter.workingModel);
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.country) q = q.ilike("country", filter.country);
  if (filter?.state) q = q.ilike("state", filter.state);
  if (filter?.city) q = q.ilike("city", filter.city);
  if (filter?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;

  let rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (filter?.query) {
    // Free text spans three columns; a PostgREST `or` across them is more
    // fragile than filtering the page already read.
    const term = filter.query.trim().toLowerCase();
    rows = rows.filter((r) =>
      [r.name, r.phone, r.contact_person]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(term)),
    );
  }
  return withCategories(rows);
}

/** The distinct values behind the frame's Country / State / City selects. */
export async function vendorFilterOptions(): Promise<{
  categories: string[];
  countries: string[];
  states: string[];
  cities: string[];
}> {
  const { db } = await withOrg();
  const [catRes, vendorRes] = await Promise.all([
    db.table("vendor_categories").select("category"),
    db.table("vendors").select("country, state, city"),
  ]);

  const uniq = (values: (string | null | undefined)[]) =>
    [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b),
    );

  const cats = (catRes.data ?? []) as unknown as { category: string }[];
  const locs = (vendorRes.data ?? []) as unknown as {
    country: string | null;
    state: string | null;
    city: string | null;
  }[];

  return {
    // The seeded list plus whatever a tenant has actually typed, so a filter
    // can always reach every row that exists.
    categories: uniq([...VENDOR_CATEGORIES, ...cats.map((c) => c.category)]),
    countries: uniq(locs.map((l) => l.country)),
    states: uniq(locs.map((l) => l.state)),
    cities: uniq(locs.map((l) => l.city)),
  };
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

  const [withCats, contracts] = await Promise.all([
    withCategories([vendor as unknown as Record<string, unknown>]),
    listRateContracts(id),
  ]);
  return { vendor: withCats[0], contracts };
}

export interface VendorInput {
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  /** Pre-0039 single value. Kept in step with `categories` below. */
  category?: string | null;
  /** 0039: the trades this vendor actually works in. Rows, not a string. */
  categories?: string[] | null;
  working_model?: WorkingModel | null;
  status?: VendorStatus | null;
  country?: string | null;
  payment_terms?: string | null;
  lead_time_days?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export async function createVendor(
  input: VendorInput,
): Promise<{ id: string; note?: string } | { error: string }> {
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
    category: primaryCategory(input),
    working_model: workingModelOf(input.working_model),
    status: vendorStatusOf(input.status),
    country: input.country?.trim() || "India",
    payment_terms: input.payment_terms?.trim() || null,
    lead_time_days: input.lead_time_days ?? null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    pincode: input.pincode?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;
  const catErr = await replaceCategories(id, cleanCategories(input));
  // A rejected trade list must not throw away the vendor it belonged to: save
  // the row, report the PARTIAL success, and let the person fix the trades.
  return catErr
    ? { id, note: `Vendor saved, but its trades were not: ${catErr}` }
    : { id };
}

/* ── Categories as rows (0039) ─────────────────────────────────────────────── */

/** Trim, drop blanks, and collapse case-duplicates — the unique index will
 *  reject them anyway, and a sentence beats a constraint name. */
function cleanCategories(input: VendorInput): string[] {
  const source =
    input.categories ?? (input.category ? [input.category] : []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of source) {
    const c = String(raw ?? "").trim();
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** The single `vendors.category` column is kept in step with the first row, so
 *  the legacy display fallback can never contradict the table (0039). */
function primaryCategory(input: VendorInput): string | null {
  return cleanCategories(input)[0] ?? null;
}

/**
 * Replace a vendor's trades.
 *
 * `withOrg` has no generic `.delete()` — only `deleteById` — so the existing
 * rows are selected first and removed by id. That is the documented shape, and
 * it keeps the org scope on every statement.
 */
async function replaceCategories(
  vendorId: string,
  categories: string[],
): Promise<string | undefined> {
  const { db } = await withOrg();

  const { data: existing } = await db
    .table("vendor_categories")
    .select("id, category")
    .eq("vendor_id", vendorId);
  const rows = (existing ?? []) as unknown as { id: string; category: string }[];

  const wanted = new Set(categories.map((c) => c.toLowerCase()));
  for (const row of rows) {
    if (!wanted.has(row.category.trim().toLowerCase())) {
      await db.table("vendor_categories").deleteById(row.id);
    }
  }

  const have = new Set(rows.map((r) => r.category.trim().toLowerCase()));
  const toAdd = categories.filter((c) => !have.has(c.toLowerCase()));
  if (toAdd.length === 0) return undefined;

  // Every row carries the same keys — a PostgREST bulk insert sends an
  // explicit NULL for a key one row omits.
  const { error } = await db.table("vendor_categories").insert(
    toAdd.map((category) => ({ vendor_id: vendorId, category })),
  );
  return error?.message;
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
    category: primaryCategory(patch),
    working_model: workingModelOf(patch.working_model),
    status: vendorStatusOf(patch.status),
    country: patch.country?.trim() || "India",
    payment_terms: patch.payment_terms?.trim() || null,
    lead_time_days: patch.lead_time_days ?? null,
    address: patch.address?.trim() || null,
    city: patch.city?.trim() || null,
    state: patch.state?.trim() || null,
    pincode: patch.pincode?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  const catErr = await replaceCategories(id, cleanCategories(patch));
  return catErr ? { error: catErr } : {};
}

/**
 * Move a vendor along `Created` → `Verified` → `Onboarded`.
 *
 * Forward only, and the server re-checks it: a vendor is not un-verified by a
 * dropdown, because "we checked their GSTIN" is a thing that happened.
 */
export async function setVendorStatus(
  id: string,
  status: VendorStatus,
): Promise<{ error?: string }> {
  if (!(VENDOR_STATUSES as readonly string[]).includes(status)) {
    return { error: "That is not a vendor status." };
  }
  const { db } = await withOrg();
  const { data: current } = await db
    .table("vendors")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "That vendor is not in this workspace." };

  const from = vendorStatusOf(
    (current as unknown as { status: string | null }).status,
  );
  if (!nextVendorStatuses(from).includes(status)) {
    return {
      error: `A ${VENDOR_STATUS_META[from].label.toLowerCase()} vendor cannot move to ${VENDOR_STATUS_META[status].label.toLowerCase()}.`,
    };
  }

  const { error } = await db
    .table("vendors")
    .updateById(id, { status, updated_at: new Date().toISOString() });
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


/* ── Vendor Projects (PLAN-V4 §10.3, frame `110234`) ──────────────────────── */

export interface VendorProjectsData {
  rows: VendorProjectRow[];
  totals: VendorProjectTotals;
  /** Projects this vendor is not on yet — the `Assign Project` picker. */
  assignable: { id: string; name: string }[];
}

/**
 * The owner's ask, verbatim: *"monitor payment history, outstanding balances,
 * procurement activities, and project associations."*
 *
 * **Nothing is re-entered and nothing is stored.** Contracts already carry
 * `vendor_id` and `project_id` (0008/0028/0030), payments carry both (0037),
 * and a milestone already knows whether its work is signed off (0015). This
 * function reads those three and hands them to a pure function. That is the
 * whole screen — and it is only possible because the spine landed first.
 */
export async function getVendorProjects(
  vendorId: string,
): Promise<VendorProjectsData> {
  const { db } = await withOrg();

  const { data: vendor } = await db
    .table("vendors")
    .select("id")
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) {
    return {
      rows: [],
      totals: vendorProjectTotals([]),
      assignable: [],
    };
  }

  const [contractRes, paymentRes, projectRes] = await Promise.all([
    db
      .table("contracts")
      .select("id, project_id, amount")
      .eq("vendor_id", vendorId),
    // Outflows only: an inflow tagged to a vendor would be a refund, and
    // counting it as disbursement would understate what is still owed.
    db
      .table("payments")
      .select("id, project_id, amount, direction")
      .eq("vendor_id", vendorId)
      .eq("direction", "outflow"),
    db.table("projects").select("id, name, client_name").order("name", {
      ascending: true,
    }),
  ]);

  const contracts = (contractRes.data ?? []) as unknown as {
    id: string;
    project_id: string | null;
    amount: number | string;
  }[];

  const contractIds = contracts.map((c) => c.id);
  const milestonesByContract = new Map<
    string,
    { amount: number | string; work_done: boolean | null }[]
  >();
  if (contractIds.length > 0) {
    const { data: ms } = await db
      .table("milestones")
      .select("contract_id, amount, work_done")
      .in("contract_id", contractIds);
    for (const m of (ms ?? []) as unknown as {
      contract_id: string;
      amount: number | string;
      work_done: boolean | null;
    }[]) {
      const list = milestonesByContract.get(m.contract_id) ?? [];
      list.push({ amount: m.amount, work_done: m.work_done });
      milestonesByContract.set(m.contract_id, list);
    }
  }

  const paymentsByProject = new Map<string | null, { amount: number | string }[]>();
  for (const p of (paymentRes.data ?? []) as unknown as {
    project_id: string | null;
    amount: number | string;
  }[]) {
    const key = p.project_id ?? null;
    const list = paymentsByProject.get(key) ?? [];
    list.push({ amount: p.amount });
    paymentsByProject.set(key, list);
  }

  const projects = (projectRes.data ?? []) as unknown as {
    id: string;
    name: string;
    client_name: string | null;
  }[];
  const projectNames = new Map(
    projects.map((p) => [
      String(p.id),
      { name: String(p.name ?? ""), clientName: p.client_name ?? null },
    ]),
  );

  const rows = vendorProjects({
    contracts,
    milestonesByContract,
    paymentsByProject,
    projectNames,
  });

  const onProject = new Set(rows.map((r) => r.project_id).filter(Boolean));
  return {
    rows,
    totals: vendorProjectTotals(rows),
    assignable: projects
      .filter((p) => !onProject.has(p.id))
      .map((p) => ({ id: String(p.id), name: String(p.name ?? "") })),
  };
}
