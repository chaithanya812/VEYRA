import "server-only";
import { withOrg } from "./with-org";
import { listMembers, type Member } from "./team";
import { issueDocNumber } from "./config";
import {
  MR_ITEM_STAGES,
  itemStageOf,
  type MRItemStage,
} from "@/lib/material-requests-model";

/**
 * Project Procurement (PLAN-V4 §9.7, frames `105729` – `105927`).
 *
 * **This module re-points the existing procurement tables at a project. It does
 * not rebuild them.** `material_requests`, `rfqs`, `purchase_orders`,
 * `po_lines` and `po_receipts` all exist (0009, 0012–0013) and all gained a
 * real `project_id` in 0028; the company-wide screens at `/procurement`,
 * `/rfq` and `/orders` read the same rows. A second procurement model scoped to
 * projects would be the mistake 0030's header talks a later session out of
 * making with money.
 *
 * What IS new is where status lives. Migration 0036 moved the procurement stage
 * onto the LINE ITEM, because `105729`'s Stage cell holds a breakdown and not a
 * status. Every count on the screen is an aggregation computed by
 * `lib/material-requests-model.ts` — nothing here stores a stage summary.
 */

export interface RequestItemRow {
  id: string;
  item_id: string | null;
  item_name: string;
  is_adhoc: boolean;
  uom: string | null;
  qty: number;
  remarks: string | null;
  stage: MRItemStage;
  stage_changed_at: string | null;
  scope_item_id: string | null;
}

export interface RequestRow {
  id: string;
  number: string | null;
  title: string;
  request_type: string;
  stage: string;
  source: string;
  expected_delivery: string | null;
  remarks: string | null;
  created_by: string | null;
  createdByName: string | null;
  created_at: string;
  items: RequestItemRow[];
}

export interface RfqRow {
  id: string;
  title: string;
  status: string;
  bid_deadline: string | null;
  place_of_supply: string | null;
  created_at: string;
  mr_id: string | null;
  vendorNames: string[];
  itemCount: number;
  awardedVendorName: string | null;
  awardReason: string | null;
}

export interface OrderRow {
  id: string;
  name: string | null;
  kind: string;
  vendorName: string | null;
  amount: number;
  order_state: string;
  payment_state: string | null;
  expected_date: string | null;
  created_at: string;
  createdByName: string | null;
  lineCount: number;
  receivedLines: number;
}

export interface DeliveryRow {
  id: string;
  poId: string;
  orderName: string | null;
  vendorName: string | null;
  received_on: string | null;
  note: string | null;
  lineCount: number;
}

export interface ProjectProcurement {
  requests: RequestRow[];
  rfqs: RfqRow[];
  orders: OrderRow[];
  deliveries: DeliveryRow[];
  members: Member[];
  /** The catalogue, for the line-item picker on a new request. */
  catalogue: { id: string; name: string; base_uom: string | null }[];
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

export async function getProjectProcurement(
  projectId: string,
): Promise<ProjectProcurement> {
  const { db } = await withOrg();

  const [reqRes, rfqRes, poRes, members, itemRes] = await Promise.all([
    db
      .table("material_requests")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    db
      .table("rfqs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    db
      .table("purchase_orders")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    listMembers(),
    db.table("items").select("id, name, base_uom").order("name", { ascending: true }),
  ]);
  if (reqRes.error) throw reqRes.error;

  const requests = (reqRes.data ?? []) as unknown as Record<string, unknown>[];
  const rfqs = (rfqRes.data ?? []) as unknown as Record<string, unknown>[];
  const orders = (poRes.data ?? []) as unknown as Record<string, unknown>[];

  const requestIds = requests.map((r) => String(r.id));
  const rfqIds = rfqs.map((r) => String(r.id));
  const orderIds = orders.map((o) => String(o.id));

  const [lineRes, rfqVendorRes, rfqItemRes, poLineRes, receiptRes, vendorRes] =
    await Promise.all([
      requestIds.length
        ? db
            .table("material_request_items")
            .select("*")
            .in("mr_id", requestIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      rfqIds.length
        ? db.table("rfq_vendors").select("rfq_id, vendor_id").in("rfq_id", rfqIds)
        : Promise.resolve({ data: [] }),
      rfqIds.length
        ? db.table("rfq_items").select("rfq_id").in("rfq_id", rfqIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? db.table("po_lines").select("id, po_id, qty").in("po_id", orderIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? db
            .table("po_receipts")
            .select("*")
            .in("po_id", orderIds)
            .order("received_on", { ascending: false })
        : Promise.resolve({ data: [] }),
      db.table("vendors").select("id, name"),
    ]);

  const vendorName = new Map(
    ((vendorRes.data ?? []) as unknown as { id: string; name: string }[]).map((v) => [
      v.id,
      v.name,
    ]),
  );
  const memberName = new Map(members.map((m) => [m.user_id ?? m.id, m.name]));

  // ── Requests + their lines ──
  const linesByRequest = new Map<string, RequestItemRow[]>();
  for (const raw of (lineRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const key = String(raw.mr_id);
    const list = linesByRequest.get(key) ?? [];
    list.push({
      id: String(raw.id),
      item_id: (raw.item_id as string | null) ?? null,
      item_name: String(raw.item_name ?? ""),
      is_adhoc: raw.is_adhoc === true,
      uom: (raw.uom as string | null) ?? null,
      qty: Number(raw.qty ?? 0),
      remarks: (raw.remarks as string | null) ?? null,
      stage: itemStageOf(raw.stage as string | null),
      stage_changed_at: (raw.stage_changed_at as string | null) ?? null,
      scope_item_id: (raw.scope_item_id as string | null) ?? null,
    });
    linesByRequest.set(key, list);
  }

  // ── RFQ fan-outs ──
  const rfqVendors = new Map<string, string[]>();
  for (const rv of (rfqVendorRes.data ?? []) as unknown as {
    rfq_id: string;
    vendor_id: string;
  }[]) {
    const list = rfqVendors.get(rv.rfq_id) ?? [];
    list.push(vendorName.get(rv.vendor_id) ?? "Unknown vendor");
    rfqVendors.set(rv.rfq_id, list);
  }
  const rfqItemCount = new Map<string, number>();
  for (const ri of (rfqItemRes.data ?? []) as unknown as { rfq_id: string }[]) {
    rfqItemCount.set(ri.rfq_id, (rfqItemCount.get(ri.rfq_id) ?? 0) + 1);
  }

  // ── PO fan-outs ──
  // A PO line carries no received quantity of its own: what arrived lives in
  // `po_receipt_lines`, one row per delivery, because a line can be delivered
  // in three loads. So "how much of this line has landed" is a SUM, not a
  // column — and asking `po_lines` for a `received_qty` gets a PostgREST error
  // that silently empties the whole read.
  const orderLineIds: string[] = [];
  const lineQty = new Map<string, { poId: string; qty: number }>();
  for (const l of (poLineRes.data ?? []) as unknown as {
    id: string;
    po_id: string;
    qty: number | string | null;
  }[]) {
    orderLineIds.push(l.id);
    lineQty.set(l.id, { poId: l.po_id, qty: Number(l.qty ?? 0) });
  }

  const receivedByLine = new Map<string, number>();
  if (orderLineIds.length > 0) {
    const { data: recLines } = await db
      .table("po_receipt_lines")
      .select("po_line_id, qty_received")
      .in("po_line_id", orderLineIds);
    for (const rl of (recLines ?? []) as unknown as {
      po_line_id: string;
      qty_received: number | string | null;
    }[]) {
      receivedByLine.set(
        rl.po_line_id,
        (receivedByLine.get(rl.po_line_id) ?? 0) + Number(rl.qty_received ?? 0),
      );
    }
  }

  const poLines = new Map<string, { total: number; received: number }>();
  for (const [lineId, { poId, qty }] of lineQty) {
    const cur = poLines.get(poId) ?? { total: 0, received: 0 };
    cur.total++;
    // "Received" means the whole ordered quantity arrived — a part load is not
    // a received line, and calling it one is how a short delivery gets closed.
    if (qty > 0 && (receivedByLine.get(lineId) ?? 0) >= qty) cur.received++;
    poLines.set(poId, cur);
  }

  const orderById = new Map(orders.map((o) => [String(o.id), o]));

  return {
    members,
    catalogue: (itemRes.data ?? []) as unknown as ProjectProcurement["catalogue"],
    requests: requests.map((r) => ({
      id: String(r.id),
      number: (r.number as string | null) ?? null,
      title: String(r.title ?? ""),
      request_type: String(r.request_type ?? "material"),
      stage: String(r.stage ?? "draft"),
      source: String(r.source ?? "manual"),
      expected_delivery: (r.expected_delivery as string | null) ?? null,
      remarks: (r.remarks as string | null) ?? null,
      created_by: (r.created_by as string | null) ?? null,
      createdByName: r.created_by
        ? (memberName.get(String(r.created_by)) ?? null)
        : null,
      created_at: String(r.created_at ?? ""),
      items: linesByRequest.get(String(r.id)) ?? [],
    })),
    rfqs: rfqs.map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      status: String(r.status ?? "draft"),
      bid_deadline: (r.bid_deadline as string | null) ?? null,
      place_of_supply: (r.place_of_supply as string | null) ?? null,
      created_at: String(r.created_at ?? ""),
      mr_id: (r.mr_id as string | null) ?? null,
      vendorNames: rfqVendors.get(String(r.id)) ?? [],
      itemCount: rfqItemCount.get(String(r.id)) ?? 0,
      awardedVendorName: r.awarded_vendor_id
        ? (vendorName.get(String(r.awarded_vendor_id)) ?? "Unknown vendor")
        : null,
      awardReason: (r.award_reason as string | null) ?? null,
    })),
    orders: orders.map((o) => {
      const counts = poLines.get(String(o.id)) ?? { total: 0, received: 0 };
      return {
        id: String(o.id),
        name: (o.name as string | null) ?? null,
        kind: String(o.kind ?? "purchase"),
        vendorName: o.vendor_id
          ? (vendorName.get(String(o.vendor_id)) ?? "Unknown vendor")
          : null,
        amount: Number(o.amount ?? 0),
        order_state: String(o.order_state ?? "draft"),
        payment_state: (o.payment_state as string | null) ?? null,
        expected_date: (o.expected_date as string | null) ?? null,
        created_at: String(o.created_at ?? ""),
        createdByName: o.created_by
          ? (memberName.get(String(o.created_by)) ?? null)
          : null,
        lineCount: counts.total,
        receivedLines: counts.received,
      };
    }),
    deliveries: ((receiptRes.data ?? []) as unknown as Record<string, unknown>[]).map(
      (rc) => {
        const po = orderById.get(String(rc.po_id));
        return {
          id: String(rc.id),
          poId: String(rc.po_id),
          orderName: (po?.name as string | null) ?? null,
          vendorName: po?.vendor_id
            ? (vendorName.get(String(po.vendor_id)) ?? "Unknown vendor")
            : null,
          received_on: (rc.received_on as string | null) ?? null,
          note: (rc.note as string | null) ?? null,
          lineCount: 0,
        };
      },
    ),
  };
}

/* ── Guards ───────────────────────────────────────────────────────────────── */

async function assertRequestBelongsToProject(
  requestId: string,
  projectId: string,
): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { data } = await db
    .table("material_requests")
    .select("id, project_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!data) return { error: "That request is not in this workspace." };
  if ((data as unknown as { project_id: string | null }).project_id !== projectId) {
    return { error: "That request belongs to a different project." };
  }
  return {};
}

/* ── Write ────────────────────────────────────────────────────────────────── */

export interface NewRequestLine {
  item_id?: string | null;
  item_name: string;
  uom?: string | null;
  qty: number;
  remarks?: string | null;
  scope_item_id?: string | null;
}

/**
 * Raise a request against this project (frame `105800` — a two-step wizard:
 * details, then lines).
 *
 * The number is issued from the tenant's `material_request` series and
 * consumed, not previewed: the request exists now, so its number does too. A
 * tenant with no series simply gets an unnumbered request rather than a
 * refusal.
 *
 * Lines start at `pending`. Nothing here writes a request-level procurement
 * stage — `material_requests.stage` is the request's own lifecycle (draft or
 * raised), and where the goods are is the items' business.
 */
export async function createProjectRequest(input: {
  projectId: string;
  title: string;
  requestType?: string;
  expectedDelivery?: string | null;
  remarks?: string | null;
  source?: "manual" | "from_quotation" | "ai_parsed";
  lines: NewRequestLine[];
}): Promise<{ id?: string; number?: string | null; error?: string }> {
  const title = input.title.trim();
  if (!title) return { error: "A request needs a title." };

  const { db, ctx } = await withOrg();

  const { data: project } = await db
    .table("projects")
    .select("id, name")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { error: "That project is not in this workspace." };

  const number = await issueDocNumber("material_request");

  const { data, error } = await db.table("material_requests").insert({
    title,
    number,
    request_type: input.requestType?.trim() || "material",
    project_id: input.projectId,
    // The label is kept in step with the FK so the legacy display fallback can
    // never contradict it (HANDOFF-V5 §3).
    project_label: (project as unknown as { name: string }).name,
    expected_delivery: input.expectedDelivery || null,
    remarks: input.remarks?.trim() || null,
    source: input.source ?? "manual",
    stage: "requested",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };

  const id = (data?.[0] as { id: string }).id;

  const lines = input.lines
    .filter((l) => l.item_name.trim())
    .map((l) => ({
      mr_id: id,
      // No catalogue match ⇒ flagged ad-hoc, never a silent free string.
      item_id: l.item_id || null,
      item_name: l.item_name.trim(),
      is_adhoc: !l.item_id,
      uom: l.uom?.trim() || null,
      qty: Number(l.qty) || 0,
      remarks: l.remarks?.trim() || null,
      scope_item_id: l.scope_item_id || null,
      stage: "pending",
    }));

  if (lines.length > 0) {
    const { error: lineErr } = await db.table("material_request_items").insert(lines);
    if (lineErr) {
      await db.table("material_requests").deleteById(id);
      return { error: lineErr.message };
    }
  }

  return { id, number };
}

/**
 * Move ONE line to a new stage.
 *
 * This is the write that migration 0036 exists for. Moving a whole request is
 * not offered, because a request does not have a stage — moving "the request"
 * would mean silently re-stamping lines somebody has already handled.
 */
export async function setItemStage(
  projectId: string,
  itemId: string,
  stage: MRItemStage,
): Promise<{ error?: string }> {
  if (!(MR_ITEM_STAGES as readonly string[]).includes(stage)) {
    return { error: "That is not a line stage." };
  }

  const { db } = await withOrg();
  const { data } = await db
    .table("material_request_items")
    .select("id, mr_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!data) return { error: "That line is not in this workspace." };

  const owned = await assertRequestBelongsToProject(
    String((data as unknown as { mr_id: string }).mr_id),
    projectId,
  );
  if (owned.error) return owned;

  const { error } = await db.table("material_request_items").updateById(itemId, {
    stage,
    stage_changed_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

/** Move several lines at once — "RFQ raised for these four". */
export async function setItemStages(
  projectId: string,
  itemIds: string[],
  stage: MRItemStage,
): Promise<{ changed: number; error?: string }> {
  if (itemIds.length === 0) return { changed: 0, error: "Select at least one line." };
  let changed = 0;
  let firstError: string | undefined;
  for (const id of itemIds) {
    const r = await setItemStage(projectId, id, stage);
    if (r.error) firstError ??= r.error;
    else changed++;
  }
  return { changed, error: changed === 0 ? firstError : undefined };
}

export async function deleteProjectRequest(
  projectId: string,
  requestId: string,
): Promise<{ error?: string }> {
  const owned = await assertRequestBelongsToProject(requestId, projectId);
  if (owned.error) return owned;
  const { db } = await withOrg();
  const { error } = await db.table("material_requests").deleteById(requestId);
  return error ? { error: error.message } : {};
}
