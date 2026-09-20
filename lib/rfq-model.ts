/**
 * Client-safe RFQ model — enums, types and PURE helpers with NO server-only
 * import, so both client components (forms) and the server data module can
 * share them. The server logic lives in lib/data/rfq.ts.
 *
 * FEATURE-REGISTER PROC-RFQ-001/004/007/008: an approved Material Request is
 * converted into an RFQ, vendors are invited, their per-line bids (unit rate +
 * tax % + freight) are collected, and a side-by-side comparison matrix ranks
 * each line L1/L2/L3 on LANDED COST. One click awards; PO creation is a
 * separate downstream module.
 *
 * ⚠ CONFIG, NOT LLM (PLAN §8): bid rates are typed by a human (proxy entry) or
 *   the vendor. The only number this module produces is landedLineTotal() — a
 *   deterministic arithmetic helper over human-entered inputs.
 *
 * Red is RESERVED (DESIGN-DIRECTION §2): status tones here are grey/amber/green
 * ONLY. Red's single status job in this module is the past-bid-deadline alert,
 * handled by isBidDeadlinePassed below — never a chip tone.
 */

/** RFQ lifecycle: draft → sent → comparing → awarded (or closed from any). */
export const RFQ_STATUSES = [
  "draft",
  "sent",
  "comparing",
  "awarded",
  "closed",
] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

/**
 * Status chip tone — grey/amber/green ONLY (no red exists in this map).
 *   muted/neutral = grey · active = amber · positive = green
 */
export type RfqTone = "muted" | "neutral" | "active" | "positive";

export const RFQ_STATUS_META: Record<RfqStatus, { label: string; tone: RfqTone }> =
  {
    draft: { label: "Draft", tone: "muted" },
    sent: { label: "Sent", tone: "active" },
    comparing: { label: "Comparing", tone: "active" },
    awarded: { label: "Awarded", tone: "positive" },
    closed: { label: "Closed", tone: "neutral" },
  };

/** How an invited vendor has responded. */
export const RESPONSE_STATUSES = ["invited", "submitted", "declined"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const RESPONSE_STATUS_META: Record<
  ResponseStatus,
  { label: string; tone: RfqTone }
> = {
  invited: { label: "Invited", tone: "active" },
  submitted: { label: "Submitted", tone: "positive" },
  declined: { label: "Declined", tone: "muted" },
};

/** How a bid arrived: vendor portal, or proxy entry by the purchase team. */
export const BID_ENTRY_MODES = ["portal", "proxy"] as const;
export type BidEntryMode = (typeof BID_ENTRY_MODES)[number];

export interface Rfq {
  id: string;
  org_id: string;
  mr_id: string | null; // nullable source material request
  title: string;
  project_label: string | null;
  place_of_supply: string | null;
  bid_deadline: string | null; // date (YYYY-MM-DD)
  status: RfqStatus;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Null on a seeded award that never ran awardRfq — the F1 backfill fills it. */
  awarded_vendor_id?: string | null;
  award_reason?: string | null;
}

export interface RfqVendor {
  id: string;
  org_id: string;
  rfq_id: string;
  vendor_id: string;
  response_status: ResponseStatus;
  invited_at: string;
  /** Unguessable portal token; identity of THIS invited vendor on THIS RFQ. */
  share_token: string | null;
  share_enabled: boolean;
}

export interface RfqItem {
  id: string;
  org_id: string;
  rfq_id: string;
  item_id: string | null; // catalogue ref; null = uncatalogued ad-hoc line…
  item_name: string; // …label always kept
  uom: string | null;
  qty: number;
  created_at: string;
}

export interface RfqBid {
  id: string;
  org_id: string;
  rfq_id: string;
  vendor_id: string;
  version: number; // latest version supersedes earlier ones in comparisons
  delivery_date: string | null;
  remark: string | null;
  entry_mode: BidEntryMode;
  submitted_by: string | null;
  submitted_at: string;
}

export interface RfqBidLine {
  id: string;
  org_id: string;
  bid_id: string;
  rfq_item_id: string;
  /** CONFIG entered by the user/vendor — NEVER an LLM output. */
  unit_rate: number;
  tax_pct: number;
  freight: number;
  /** Computed via landedLineTotal — qty × unit_rate + freight. */
  line_total: number;
  created_at: string;
}

/* ── Pure engine helpers ───────────────────────────────────────────────────── */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * THE landed-cost line: qty × unit_rate + freight, rounded to currency
 * granularity (2 dp). Pure and deterministic over human-entered inputs only —
 * no LLM ever produces a number (PLAN §8). This is what ranks L1/L2/L3.
 */
export function landedLineTotal(
  qty: number,
  unit_rate: number,
  freight = 0,
): number {
  return round2(qty * unit_rate + freight);
}

/**
 * Next bid version for a vendor on an RFQ. History is append-only: re-entry
 * never overwrites. Empty history → version 1.
 */
export function nextBidVersion(prevVersions: number[]): number {
  return Math.max(0, ...prevVersions) + 1;
}

/**
 * Who is recorded as the submitter. Portal entry is the vendor themselves —
 * `submitted_by` is always null, even if a session user id leaked in. Proxy
 * entry records the purchase-team user who typed the quote.
 */
export function bidSubmittedBy(
  entryMode: BidEntryMode,
  sessionUserId: string | null,
): string | null {
  return entryMode === "portal" ? null : sessionUserId;
}

/**
 * Rank vendor totals for one comparison row (an item, or the whole RFQ):
 * 1 = lowest landed cost (L1), ascending thereafter. Ties SHARE a rank
 * (competition ranking: two joint-lowest both get 1; the next distinct total
 * gets 3). Totals ≤ 0 mean "no bid" — they are ignored (left out of the map,
 * so lookups yield undefined) rather than ranked as a fake winner.
 */
export function rankBids(
  totals: { vendorId: string; total: number }[],
): Record<string, number> {
  const valid = totals
    .filter((t) => t.total > 0)
    .map((t) => ({ ...t, total: round2(t.total) }))
    .sort((a, b) => a.total - b.total);

  const ranks: Record<string, number> = {};
  let prevTotal: number | null = null;
  let prevRank = 0;
  valid.forEach((t, i) => {
    if (prevTotal !== null && t.total === prevTotal) {
      ranks[t.vendorId] = prevRank; // tie shares the earlier rank
    } else {
      prevRank = i + 1;
      prevTotal = t.total;
      ranks[t.vendorId] = prevRank;
    }
  });
  return ranks;
}

/**
 * TRUE ALERT (the one red status use in this module): the bid deadline exists,
 * has fully passed, and the RFQ isn't awarded/closed yet. Date-granularity on
 * purpose — deadline day itself still accepts bids.
 */
export function isBidDeadlinePassed(
  deadline: string | null,
  status: string,
): boolean {
  if (!deadline) return false;
  if (status === "awarded" || status === "closed") return false;

  // Date-only strings ("YYYY-MM-DD") parse on the calendar, not through
  // UTC → local; anything else falls back to Date parsing (mirrors isOverdue).
  let y: number, m: number, d: number;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline.trim());
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]) - 1;
    d = Number(match[3]);
  } else {
    const parsed = new Date(deadline);
    if (Number.isNaN(parsed.getTime())) return false;
    y = parsed.getFullYear();
    m = parsed.getMonth();
    d = parsed.getDate();
  }

  const now = new Date();
  const deadlineDay = new Date(y, m, d).getTime();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return deadlineDay < today;
}
