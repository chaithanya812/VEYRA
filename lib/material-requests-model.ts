/**
 * Client-safe Material Request model — enums and types with NO server-only
 * import, so both client components (forms) and the server data module can
 * share them. The server logic lives in lib/data/material-requests.ts.
 *
 * FEATURE-REGISTER PROC-MR-001/003: a site team raises a Material Request
 * against a project — a title, an expected delivery, and a grid of line items.
 * A line is a CATALOGUE REFERENCE (item_id → items), never a silent free
 * string; an uncatalogued line is flagged ad-hoc instead.
 *
 * MR carries QUANTITIES only (user-entered) — no price/amount field exists in
 * this module, and no LLM ever produces a number (PLAN §8).
 */

/** Stage cycle: draft → requested → rfq_raised → order_requested → ordered
 *  (or cancelled from any stage). */
export const MR_STAGES = [
  "draft",
  "requested",
  "rfq_raised",
  "order_requested",
  "ordered",
  "cancelled",
] as const;
export type MRStage = (typeof MR_STAGES)[number];

/**
 * Stage chip tone — grey/amber/green ONLY. Red is RESERVED (DESIGN-DIRECTION
 * §2): it may never decorate a stage; its one status job here is the overdue
 * delivery alert, handled by isOverdue below.
 *   neutral/muted = grey · active = amber · positive = green
 */
export type MRTone = "neutral" | "active" | "positive" | "muted";

export const MR_STAGE_META: Record<MRStage, { label: string; tone: MRTone }> = {
  draft: { label: "Draft", tone: "muted" },
  requested: { label: "Requested", tone: "active" },
  rfq_raised: { label: "RFQ raised", tone: "active" },
  order_requested: { label: "Order requested", tone: "active" },
  ordered: { label: "Ordered", tone: "positive" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export const MR_SOURCES = ["manual", "from_quotation", "ai_parsed"] as const;
export type MRSource = (typeof MR_SOURCES)[number];

export interface MaterialRequest {
  id: string;
  org_id: string;
  title: string;
  project_id: string | null;
  project_label: string | null;
  expected_delivery: string | null; // date (YYYY-MM-DD)
  stage: MRStage;
  source: MRSource;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialRequestItem {
  id: string;
  org_id: string;
  mr_id: string;
  item_id: string | null; // catalogue ref; null = uncatalogued…
  item_name: string; // …label always kept
  is_adhoc: boolean; // true when item_id is null — flagged, pending promotion
  uom: string | null;
  qty: number;
  remarks: string | null;
  created_at: string;
}

/** The slim catalogue shape the line autocomplete pulls from the Item master. */
export interface CatalogueMatch {
  id: string;
  name: string;
  base_uom: string | null;
}

/**
 * TRUE ALERT (the one red status use in this module): the expected delivery
 * date exists, has fully passed, and the request hasn't reached `ordered` /
 * `cancelled`. Date-granularity on purpose — delivery day itself isn't late.
 */
export function isOverdue(
  expectedDelivery: string | null,
  stage: string,
): boolean {
  if (!expectedDelivery) return false;
  if (stage === "ordered" || stage === "cancelled") return false;

  // Date-only strings ("YYYY-MM-DD") are parsed on the calendar, not shifted
  // through UTC → local; anything else falls back to Date parsing.
  let y: number, m: number, d: number;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(expectedDelivery.trim());
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]) - 1;
    d = Number(match[3]);
  } else {
    const parsed = new Date(expectedDelivery);
    if (Number.isNaN(parsed.getTime())) return false;
    y = parsed.getFullYear();
    m = parsed.getMonth();
    d = parsed.getDate();
  }

  const now = new Date();
  const deliveryDay = new Date(y, m, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return deliveryDay < today;
}
