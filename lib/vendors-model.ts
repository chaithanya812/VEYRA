/**
 * Client-safe vendors model — enums and types with NO server-only import, so
 * both client components (forms) and the server data module can share them.
 * The server logic lives in lib/data/vendors.ts.
 *
 * A vendor is conceptually "a Party with the vendor role" (the platform has a
 * `parties` table). v1 builds a dedicated `vendors` table; later consolidation
 * into parties+roles maps 1:1 onto these fields.
 */

/** Common construction / interior supplier categories. Seeds the category
 *  select and the list filter; stored as free text so tenants aren't boxed in. */
export const VENDOR_CATEGORIES = [
  "Hardware",
  "Plywood",
  "Laminates",
  "Electrical",
  "Plumbing",
  "Paint",
  "Tiles & Sanitary",
  "Glass & Aluminium",
  "Furniture Fittings",
  "Tools & Equipment",
  "Services & Labour",
  "Logistics & Transport",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export interface Vendor {
  id: string;
  name: string;
  /** 0039: what they can supply, and where they are in onboarding. */
  working_model: string;
  status: string;
  country: string | null;
  /** 0039: trades as rows. `category` below is the pre-0039 single value. */
  categories: string[];
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  category: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  /** Computed from PO/GRN history later — always null until then, never faked. */
  rating: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorRateContract {
  id: string;
  vendor_id: string;
  item_id: string | null;
  item_name: string | null;
  uom: string | null;
  /** CONFIG the user typed — never an LLM output. */
  rate: number;
  moq: number | null;
  lead_time_days: number | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
}

/** Rating display: null means "no history yet", never a zero. */
export function vendorRatingLabel(r: number | null): string {
  return r == null ? "Not rated" : `${r.toFixed(1)} ★`;
}

/* ══════════════════════════════════════════════════════════════════════════
   VENDORS, COMPANY-WIDE (PLAN-V4 §10.3, frames `110215` / `110227` / `110234`)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `Working Model` (`110215`) — what a vendor can actually supply.
 *
 * Not a category and not a tag: it decides which requests they can be invited
 * to bid on at all. A labour-only vendor quoting for plywood is a mistake the
 * field exists to prevent.
 */
export const WORKING_MODELS = ["labour_material", "material", "labour"] as const;
export type WorkingModel = (typeof WORKING_MODELS)[number];

export const WORKING_MODEL_LABELS: Record<WorkingModel, string> = {
  labour_material: "Labour + Material only",
  material: "Material only",
  labour: "Labour only",
};

export function workingModelOf(raw: string | null | undefined): WorkingModel {
  return (WORKING_MODELS as readonly string[]).includes(String(raw))
    ? (raw as WorkingModel)
    : "labour_material";
}

/**
 * `Created` → `Verified` → `Onboarded` (`110215`).
 *
 * A vendor somebody typed in is not a vendor anybody has checked, and neither
 * is one who has agreed terms. `is_active` (0008) cannot hold the two states
 * in the middle, and those are the ones a buyer asks about.
 *
 * Tones are grey → amber → green. There is no red: a vendor who has not been
 * verified yet is not an alarm, they are a vendor somebody has not got to.
 * Red's status job in this module is nothing at all (DESIGN-DIRECTION §2).
 */
export const VENDOR_STATUSES = ["created", "verified", "onboarded"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export type VendorTone = "neutral" | "active" | "positive";

export const VENDOR_STATUS_META: Record<
  VendorStatus,
  { label: string; tone: VendorTone; hint: string }
> = {
  created: {
    label: "Created",
    tone: "neutral",
    hint: "Entered in the system; nobody has checked them yet",
  },
  verified: {
    label: "Verified",
    tone: "active",
    hint: "Details and GSTIN checked",
  },
  onboarded: {
    label: "Onboarded",
    tone: "positive",
    hint: "Terms agreed; ready to be issued orders",
  },
};

export function vendorStatusOf(raw: string | null | undefined): VendorStatus {
  return (VENDOR_STATUSES as readonly string[]).includes(String(raw))
    ? (raw as VendorStatus)
    : "created";
}

/** Forward only — a vendor is not un-verified by a dropdown. */
export function nextVendorStatuses(current: VendorStatus): VendorStatus[] {
  const order: VendorStatus[] = ["created", "verified", "onboarded"];
  return order.slice(order.indexOf(current) + 1);
}

/* ── Vendor Projects (`110234`) ───────────────────────────────────────────── */

/**
 * One row of `110234`, and the arithmetic is worth stating precisely because
 * the frame uses a phrase this codebase already uses for something else.
 *
 * ⚠ `Total Payables` HERE MEANS SOMETHING DIFFERENT FROM `summarisePlan`'s.
 *
 * Reading the frame's own numbers:
 *   Sudha Interior   agreed 27,000 · disbursed 13,500 · payables 13,500 · dues 0
 *   Daizy Interiors  agreed 51,200 · disbursed 0      · payables 51,200 · dues 7,100
 *   project-1wh5kos  agreed 0      · disbursed 1,000  · payables −1,000 · dues −1,000
 *
 * Only one pair of formulas fits all three:
 *   Total Payables = agreed − disbursed   (the whole remaining commitment)
 *   Payable Dues   = billed − disbursed   (what is payable NOW)
 *
 * `lib/finance-model.ts::summarisePlan` calls `billed` itself "totalPayables"
 * and `billed − disbursed` "payableDues". So the DUES agree between the two
 * screens and the PAYABLES do not. Rather than quietly pick one, both figures
 * are returned here under unambiguous names and the screen prints what each
 * one is. §12.1 builds the company-wide matrix off the same two columns and
 * has to settle the vocabulary — this is the note that says so.
 *
 * Negative values are NOT clamped. Disbursing more than was agreed is a real
 * thing that happens on a site, and a screen that floors it at zero hides the
 * one row somebody needed to see.
 */
export interface VendorProjectRow {
  project_id: string | null;
  projectName: string | null;
  clientName: string | null;
  /** Σ of this vendor's contract values on this project. */
  agreed: number;
  /** Σ of payments made to this vendor on this project. */
  disbursed: number;
  /** Σ of milestone amounts whose work has been signed off. */
  billed: number;
  /** The frame's `Total Payables`: the whole remaining commitment. */
  outstanding: number;
  /** The frame's `Payable Dues`: signed off and not yet paid. */
  dues: number;
  contractCount: number;
}

export interface VendorProjectTotals {
  /** The frame's `Estimated Expenses` — every contract, whatever its state. */
  estimatedExpenses: number;
  /** The frame's `Total Payables`. */
  outstanding: number;
  /** The frame's `Total Disbursed`. */
  disbursed: number;
  /** The frame's `Payable Dues`. */
  dues: number;
  billed: number;
  projectCount: number;
}

const n = (v: number | string | null | undefined): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * Build `110234`'s table from rows that already exist.
 *
 * Nothing is re-entered and nothing is stored: contracts carry `vendor_id` and
 * `project_id` (0028/0030), payments carry both (0037), and a milestone knows
 * whether its work is done (0015). That is the whole screen.
 *
 * A contract whose project FK never resolved still gets a row, keyed on null,
 * rather than being dropped — money owed to a vendor does not stop being owed
 * because a label did not match a project name.
 */
export function vendorProjects(input: {
  contracts: readonly {
    id: string;
    project_id: string | null;
    amount: number | string;
  }[];
  /** Milestones by contract id. Only the signed-off ones count as billed. */
  milestonesByContract: ReadonlyMap<
    string,
    readonly { amount: number | string; work_done?: boolean | null }[]
  >;
  /** Payments to this vendor, by project id (null key = unresolved project). */
  paymentsByProject: ReadonlyMap<string | null, readonly { amount: number | string }[]>;
  projectNames: ReadonlyMap<string, { name: string; clientName: string | null }>;
}): VendorProjectRow[] {
  const byProject = new Map<
    string | null,
    { agreed: number; billed: number; contractCount: number }
  >();

  for (const c of input.contracts) {
    const key = c.project_id ?? null;
    const acc = byProject.get(key) ?? { agreed: 0, billed: 0, contractCount: 0 };
    acc.agreed += n(c.amount);
    acc.contractCount += 1;
    for (const m of input.milestonesByContract.get(c.id) ?? []) {
      if (m.work_done === true) acc.billed += n(m.amount);
    }
    byProject.set(key, acc);
  }

  // A payment can exist on a project with no contract — an advance paid before
  // the paperwork. It must still show, or the disbursed total on this screen
  // stops matching the ledger it came from.
  for (const key of input.paymentsByProject.keys()) {
    if (!byProject.has(key)) {
      byProject.set(key, { agreed: 0, billed: 0, contractCount: 0 });
    }
  }

  const rows: VendorProjectRow[] = [];
  for (const [key, acc] of byProject) {
    const disbursed = r2(
      (input.paymentsByProject.get(key) ?? []).reduce((s, p) => s + n(p.amount), 0),
    );
    const agreed = r2(acc.agreed);
    const billed = r2(acc.billed);
    const meta = key ? input.projectNames.get(key) : undefined;
    rows.push({
      project_id: key,
      projectName: meta?.name ?? null,
      clientName: meta?.clientName ?? null,
      agreed,
      disbursed,
      billed,
      outstanding: r2(agreed - disbursed),
      dues: r2(billed - disbursed),
      contractCount: acc.contractCount,
    });
  }

  // Biggest commitment first, then by name — a stable order that does not
  // reshuffle as payments land.
  return rows.sort(
    (a, b) =>
      b.agreed - a.agreed ||
      (a.projectName ?? "").localeCompare(b.projectName ?? ""),
  );
}

/** The four header figures in `110234`, summed from the rows below them. */
export function vendorProjectTotals(
  rows: readonly VendorProjectRow[],
): VendorProjectTotals {
  let estimatedExpenses = 0;
  let disbursed = 0;
  let billed = 0;
  for (const row of rows) {
    estimatedExpenses += row.agreed;
    disbursed += row.disbursed;
    billed += row.billed;
  }
  estimatedExpenses = r2(estimatedExpenses);
  disbursed = r2(disbursed);
  billed = r2(billed);
  return {
    estimatedExpenses,
    disbursed,
    billed,
    outstanding: r2(estimatedExpenses - disbursed),
    dues: r2(billed - disbursed),
    projectCount: rows.length,
  };
}

/* ── The list's `Category (+n)` cell (`110215`) ───────────────────────────── */

/**
 * `Carpentry Woodwork + 2` — the first trade, and a count of the rest.
 *
 * The overflow count is part of the data, not a styling choice: a cell that
 * silently showed one of three trades would make a three-trade vendor look
 * like a one-trade vendor to anyone scanning the column.
 */
export function categorySummary(
  categories: readonly string[],
): { first: string | null; overflow: number } {
  const clean = categories.map((c) => c.trim()).filter(Boolean);
  return {
    first: clean[0] ?? null,
    overflow: Math.max(0, clean.length - 1),
  };
}
