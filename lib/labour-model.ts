/**
 * Labour Report — the pure half (PLAN-V4 §9.6, frames `105620` / `105716`).
 *
 * **The rule this module exists to enforce: a total is never stored, only
 * derived.** `105620`'s header reads `71 / 34 / 25 / 12` and those four numbers
 * must reconcile every time anybody looks at them. So there is exactly one
 * function that adds labour up (`totalOf`) and every summary, every table cell
 * and every chart goes through it. A second place that adds is a second place
 * that can be wrong.
 *
 * The second rule is about attribution. An entry may name several trades and
 * several vendors, and its headcount belongs to all of them — so
 * `Labour by Vendor` and `Labour by Category` each sum to MORE than the total
 * when entries are multi-valued. That is not a bug and it must not be hidden:
 * every breakdown here reports its own total alongside the report total, so a
 * reader can see the double-count rather than be misled by it.
 */

export interface LabourEntry {
  id: string;
  project_id: string;
  entry_date: string;
  contract_id: string | null;
  skilled: number;
  unskilled: number;
  coordinator: number;
  remark: string | null;
  client_visible: boolean;
  created_at: string;
  /** `workspace_options` value slugs, not labels. */
  categories: string[];
  vendor_ids: string[];
}

/* ── The one place labour is added up ─────────────────────────────────────── */

const n = (v: number | string | null | undefined): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? Math.trunc(x) : 0;
};

/** Skilled + unskilled + coordinator. The `Total` column, and nothing else. */
export function totalOf(e: Pick<LabourEntry, "skilled" | "unskilled" | "coordinator">): number {
  return n(e.skilled) + n(e.unskilled) + n(e.coordinator);
}

export interface LabourTotals {
  entries: number;
  skilled: number;
  unskilled: number;
  coordinator: number;
  total: number;
}

/**
 * The header strip. `total` is computed from the three parts here too — it is
 * never carried in from anywhere — so `34 + 25 + 12 = 71` is true by
 * construction rather than by luck.
 */
export function summarise(entries: readonly LabourEntry[]): LabourTotals {
  const t = entries.reduce(
    (acc, e) => ({
      skilled: acc.skilled + n(e.skilled),
      unskilled: acc.unskilled + n(e.unskilled),
      coordinator: acc.coordinator + n(e.coordinator),
    }),
    { skilled: 0, unskilled: 0, coordinator: 0 },
  );
  return {
    entries: entries.length,
    ...t,
    total: t.skilled + t.unskilled + t.coordinator,
  };
}

/* ── Filtering ────────────────────────────────────────────────────────────── */

export interface LabourFilter {
  /** Inclusive `YYYY-MM-DD` bounds; either may be omitted. */
  from?: string | null;
  to?: string | null;
  category?: string | null;
  vendorId?: string | null;
  contractId?: string | null;
  /** True = only what a client would be shown. */
  clientVisibleOnly?: boolean;
  query?: string;
}

/**
 * `NO_VENDOR` / `NO_CONTRACT` are real answers, not missing data — `105620`
 * prints `No Vendor` in the table and `105716` gives `No Contract` a slice of
 * its own. They are sentinels for filtering and grouping only; nothing is ever
 * stored under them.
 */
export const NO_VENDOR = "__none__";
export const NO_CONTRACT = "__none__";

export function filterEntries(
  entries: readonly LabourEntry[],
  filter: LabourFilter,
  vendorName: (id: string) => string = () => "",
): LabourEntry[] {
  const q = (filter.query ?? "").trim().toLowerCase();

  return entries.filter((e) => {
    const day = String(e.entry_date ?? "").slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.clientVisibleOnly && !e.client_visible) return false;

    if (filter.category) {
      if (!e.categories.includes(filter.category)) return false;
    }
    if (filter.vendorId) {
      const hit =
        filter.vendorId === NO_VENDOR
          ? e.vendor_ids.length === 0
          : e.vendor_ids.includes(filter.vendorId);
      if (!hit) return false;
    }
    if (filter.contractId) {
      const hit =
        filter.contractId === NO_CONTRACT
          ? !e.contract_id
          : e.contract_id === filter.contractId;
      if (!hit) return false;
    }

    if (q) {
      const haystack = [
        e.remark ?? "",
        ...e.categories,
        ...e.vendor_ids.map(vendorName),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/* ── Analytics (frame `105716`) ───────────────────────────────────────────── */

export interface TrendPoint {
  date: string;
  count: number;
}

/**
 * Daily Labour Trend. One point per day that has an entry — days with no
 * labour are absent rather than plotted as zero, because "nobody worked" and
 * "nobody recorded anything" are different claims and the data cannot tell them
 * apart.
 */
export function dailyTrend(entries: readonly LabourEntry[]): TrendPoint[] {
  const byDay = new Map<string, number>();
  for (const e of entries) {
    const day = String(e.entry_date ?? "").slice(0, 10);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + totalOf(e));
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

export interface LabourSlice {
  key: string;
  label: string;
  count: number;
}

export interface LabourBreakdown {
  slices: LabourSlice[];
  /** The slices' own sum. */
  sliceTotal: number;
  /** The report's headcount. Differs from `sliceTotal` when entries are multi-valued. */
  reportTotal: number;
  /** True when one entry's headcount is counted under more than one slice. */
  overlaps: boolean;
}

function pack(
  counts: Map<string, number>,
  label: (key: string) => string,
  reportTotal: number,
): LabourBreakdown {
  const slices = [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const sliceTotal = slices.reduce((sum, s) => sum + s.count, 0);
  return { slices, sliceTotal, reportTotal, overlaps: sliceTotal !== reportTotal };
}

/**
 * Labour by Category.
 *
 * An entry tagged with two trades contributes its full headcount to BOTH, which
 * is the only honest answer — nine people who did carpentry and painting were
 * nine people on each. It also means the slices can sum past the total, so the
 * breakdown carries both figures and the card says so.
 */
export function byCategory(
  entries: readonly LabourEntry[],
  label: (slug: string) => string = (s) => s,
  untaggedLabel = "No category",
): LabourBreakdown {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const t = totalOf(e);
    if (e.categories.length === 0) {
      counts.set("", (counts.get("") ?? 0) + t);
      continue;
    }
    for (const c of e.categories) counts.set(c, (counts.get(c) ?? 0) + t);
  }
  return pack(counts, (k) => (k === "" ? untaggedLabel : label(k)), summarise(entries).total);
}

/** Labour by Vendor. `No Vendor` is a slice, never a dropped row. */
export function byVendor(
  entries: readonly LabourEntry[],
  label: (id: string) => string = (id) => id,
  noVendorLabel = "No vendor",
): LabourBreakdown {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const t = totalOf(e);
    if (e.vendor_ids.length === 0) {
      counts.set(NO_VENDOR, (counts.get(NO_VENDOR) ?? 0) + t);
      continue;
    }
    for (const v of e.vendor_ids) counts.set(v, (counts.get(v) ?? 0) + t);
  }
  return pack(
    counts,
    (k) => (k === NO_VENDOR ? noVendorLabel : label(k)),
    summarise(entries).total,
  );
}

/** Labour by Contract. One contract per entry, so this one always reconciles. */
export function byContract(
  entries: readonly LabourEntry[],
  label: (id: string) => string = (id) => id,
  noContractLabel = "No contract",
): LabourBreakdown {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = e.contract_id ?? NO_CONTRACT;
    counts.set(key, (counts.get(key) ?? 0) + totalOf(e));
  }
  return pack(
    counts,
    (k) => (k === NO_CONTRACT ? noContractLabel : label(k)),
    summarise(entries).total,
  );
}

/** The split behind the header strip, as a breakdown the Table view can render. */
export function bySkill(entries: readonly LabourEntry[]): LabourBreakdown {
  const t = summarise(entries);
  const counts = new Map<string, number>([
    ["skilled", t.skilled],
    ["unskilled", t.unskilled],
    ["coordinator", t.coordinator],
  ]);
  return pack(counts, (k) => SKILL_LABELS[k as SkillKind] ?? k, t.total);
}

export const SKILL_KINDS = ["skilled", "unskilled", "coordinator"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];

export const SKILL_LABELS: Record<SkillKind, string> = {
  skilled: "Skilled",
  unskilled: "Unskilled",
  coordinator: "Coordinator",
};

/* ── Writing one entry ────────────────────────────────────────────────────── */

export interface LabourDraft {
  entry_date: string;
  categories: string[];
  vendor_ids: string[];
  contract_id: string | null;
  skilled: number;
  unskilled: number;
  coordinator: number;
  remark: string | null;
  client_visible: boolean;
}

/**
 * What the attendance dialog is allowed to submit.
 *
 * The one rule worth having: **an entry with nobody in it is not attendance.**
 * A row of three zeroes records nothing and would still drag a point onto the
 * daily trend, so it is refused rather than stored. Everything else the dialog
 * offers is genuinely optional — no vendor, no contract and no trade are all
 * real answers on a real site.
 */
export function validateDraft(draft: Partial<LabourDraft>): { error?: string } {
  const day = String(draft.entry_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick the date this labour worked." };

  const counts = [draft.skilled, draft.unskilled, draft.coordinator].map((v) => n(v));
  if (counts.some((c) => c < 0)) return { error: "A headcount cannot be negative." };
  if (counts.reduce((a, b) => a + b, 0) === 0) {
    return { error: "Enter at least one person — an attendance of nobody records nothing." };
  }
  return {};
}
