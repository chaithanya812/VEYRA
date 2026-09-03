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

/**
 * The REQUEST's OWN lifecycle — all that `material_requests.stage` still means
 * after migration 0036 narrowed it. Whether a request has been raised at all
 * is a genuinely different question from where its goods are, and the second
 * one is answered by `MR_ITEM_STAGES` on the lines.
 *
 * Offering `ordered` at this level would let one dropdown contradict thirteen
 * lines, which is exactly the model 0036 exists to end.
 */
export const MR_LIFECYCLE_STAGES = ["draft", "requested", "cancelled"] as const;
export type MRLifecycleStage = (typeof MR_LIFECYCLE_STAGES)[number];

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
  /** Where THIS line is (migration 0036). The request has no such answer. */
  stage: MRItemStage;
  stage_changed_at: string | null;
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

/* ══════════════════════════════════════════════════════════════════════════
   PER-LINE STAGES (PLAN-V4 §9.7, migration 0036, frame `105729`)
   ══════════════════════════════════════════════════════════════════════════
   The frame's Stage cell is not a status, it is a BREAKDOWN:

       DZY-REQ-164   Order Requested (3) · Ordered (6) · Pending (3) · In Stock (1)

   A request of thirteen items is not "ordered" — six of them are. So the
   procurement status lives on the line item and the request's stage is derived
   here, in one place, by counting.

   The tile in `105729` is the same arithmetic one level up: `Total items (177)`
   split `Pending (39) · RFQ Raised (11) · Ordered (127)`, and those three add
   back to 177. Every count on this screen comes out of these functions so that
   addition can never stop holding.
   ────────────────────────────────────────────────────────────────────────── */

export const MR_ITEM_STAGES = [
  "pending",
  "rfq_raised",
  "order_requested",
  "ordered",
  "in_stock",
  "cancelled",
] as const;
export type MRItemStage = (typeof MR_ITEM_STAGES)[number];

/**
 * Grey → amber → green as a line moves toward site. Red is NOT here: a line
 * that is merely waiting is not an alarm (DESIGN-DIRECTION §2). The one red
 * job in this module stays `isOverdue`.
 */
export const MR_ITEM_STAGE_META: Record<MRItemStage, { label: string; tone: MRTone }> = {
  pending: { label: "Pending", tone: "muted" },
  rfq_raised: { label: "RFQ raised", tone: "active" },
  order_requested: { label: "Order requested", tone: "active" },
  ordered: { label: "Ordered", tone: "positive" },
  in_stock: { label: "In stock", tone: "positive" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** Anything unrecognised reads as `pending` rather than vanishing from a count. */
export function itemStageOf(raw: string | null | undefined): MRItemStage {
  return (MR_ITEM_STAGES as readonly string[]).includes(String(raw))
    ? (raw as MRItemStage)
    : "pending";
}

export interface StageCount {
  stage: MRItemStage;
  label: string;
  tone: MRTone;
  count: number;
}

/**
 * One request's Stage cell.
 *
 * Stages with no items are dropped — the frame never prints `Cancelled (0)` —
 * and the order is the lifecycle order, not the count order, so the same
 * request does not reshuffle its own cell as work progresses.
 */
export function stageBreakdown(
  items: readonly { stage?: string | null }[],
): StageCount[] {
  const counts = new Map<MRItemStage, number>();
  for (const i of items) {
    const s = itemStageOf(i.stage);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return MR_ITEM_STAGES.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
    stage: s,
    label: MR_ITEM_STAGE_META[s].label,
    tone: MR_ITEM_STAGE_META[s].tone,
    count: counts.get(s) ?? 0,
  }));
}

/**
 * Where a whole request stands, derived — never stored.
 *
 * `not_started` every line is pending · `complete` every line has landed or
 * been cancelled · `in_progress` anything in between. This is what the frame's
 * `In Progress Requests` tile counts, and deriving it means it cannot drift
 * from the lines it describes.
 */
export type RequestProgress = "empty" | "not_started" | "in_progress" | "complete";

export function requestProgress(
  items: readonly { stage?: string | null }[],
): RequestProgress {
  if (items.length === 0) return "empty";
  const stages = items.map((i) => itemStageOf(i.stage));
  const settled = stages.filter((s) => s === "in_stock" || s === "cancelled").length;
  if (settled === stages.length) return "complete";
  if (stages.every((s) => s === "pending")) return "not_started";
  return "in_progress";
}

export const REQUEST_PROGRESS_LABELS: Record<RequestProgress, string> = {
  empty: "No items",
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export interface ProcurementTotals {
  requests: number;
  inProgress: number;
  dueSoon: number;
  overdue: number;
  items: number;
  byStage: StageCount[];
}

/**
 * The four tiles in `105729`, from the same counting as everything else.
 *
 * `dueSoon` is "expected within the next `withinDays` days and not yet
 * settled" — the frame's `Due Delivery Date` tile. Overdue is counted
 * separately because a late delivery is a different problem from an imminent
 * one, and only one of them is red.
 */
export function procurementTotals(
  requests: readonly {
    expected_delivery?: string | null;
    stage?: string | null;
    items: readonly { stage?: string | null }[];
  }[],
  withinDays = 7,
  today = new Date(),
): ProcurementTotals {
  const allItems: { stage?: string | null }[] = [];
  let inProgress = 0;
  let dueSoon = 0;
  let overdue = 0;

  const midnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const horizon = midnight + withinDays * 86_400_000;

  for (const r of requests) {
    allItems.push(...r.items);
    const progress = requestProgress(r.items);
    if (progress === "in_progress" || progress === "not_started") {
      if (progress === "in_progress") inProgress++;

      const due = dayValue(r.expected_delivery);
      if (due != null) {
        if (due < midnight) overdue++;
        else if (due <= horizon) dueSoon++;
      }
    }
  }

  return {
    requests: requests.length,
    inProgress,
    dueSoon,
    overdue,
    items: allItems.length,
    byStage: stageBreakdown(allItems),
  };
}

/** A `YYYY-MM-DD` read on the calendar, never shifted through UTC. */
function dayValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw).trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/**
 * The legal next stages for a line.
 *
 * Forward only, with one exception: anything may be cancelled, and a cancelled
 * line may be reopened to `pending`. Procurement moves in one direction on a
 * real site — un-ordering something that has been ordered is a new
 * conversation with a vendor, not a dropdown.
 */
export function nextItemStages(current: MRItemStage): MRItemStage[] {
  if (current === "cancelled") return ["pending"];
  const order: MRItemStage[] = [
    "pending",
    "rfq_raised",
    "order_requested",
    "ordered",
    "in_stock",
  ];
  const at = order.indexOf(current);
  if (at < 0) return ["cancelled"];
  return [...order.slice(at + 1), "cancelled"];
}

/* ── The project procurement sub-tabs (frame `105729`) ────────────────────── */

/**
 * The owner named four of these as non-negotiable: *"you got RFQs, you got
 * Orders, you got Acceptance… you have got to keep those four things."*
 *
 * They live HERE, in the pure model, and not in the view — a `"use client"`
 * module's exported const is a client reference when a server component
 * imports it, so `PROC_TABS.includes(...)` compiles and then throws at request
 * time. Types cross that boundary; values do not.
 */
export const PROC_TABS = [
  "requests",
  "rfqs",
  "orders",
  "deliveries",
  "inventory",
] as const;
export type ProcTab = (typeof PROC_TABS)[number];

export const PROC_TAB_LABELS: Record<ProcTab, string> = {
  requests: "Request",
  rfqs: "RFQs",
  orders: "Orders",
  deliveries: "Deliveries",
  inventory: "Inventory",
};

/** Unknown values fall back to the first tab rather than throwing. */
export function procTabOf(raw: string | null | undefined): ProcTab {
  return (PROC_TABS as readonly string[]).includes(String(raw))
    ? (raw as ProcTab)
    : "requests";
}
