import "server-only";
import { withOrg } from "./with-org";
import { createPurchaseOrder } from "./purchase-orders";
import {
  landedLineTotal,
  rankBids,
  RFQ_STATUSES,
  type Rfq,
  type RfqVendor,
  type RfqItem,
  type RfqBid,
  type RfqBidLine,
  type ResponseStatus,
} from "@/lib/rfq-model";

/**
 * RFQ + bid-comparison data module (Procurement · FEATURE-REGISTER
 * PROC-RFQ-001/004/007/008). Follows the Leads/MaterialRequests reference
 * pattern exactly: no table is ever touched directly — everything goes through
 * withOrg(), so org_id filtering/stamping is automatic and cross-tenant leakage
 * is impossible by construction. RLS is OFF; this module IS the guard.
 *
 * Bid rates (unit_rate / tax_pct / freight) are CONFIG typed by a human (proxy
 * entry) or the vendor — never an LLM output. The ONLY derived number is
 * `line_total`, computed by the pure engine helper `landedLineTotal` from
 * lib/rfq-model.ts using the RFQ item's qty. Ranking uses `rankBids`.
 *
 * Client-safe enums/types live in @/lib/rfq-model (this file is server-only).
 */
export {
  RFQ_STATUSES,
  landedLineTotal,
  rankBids,
  type Rfq,
  type RfqVendor,
  type RfqItem,
  type RfqBid,
  type RfqBidLine,
};

/* ── Reads ─────────────────────────────────────────────────────────────────── */

export async function listRfqs(filter?: {
  status?: string;
}): Promise<Rfq[]> {
  const { db } = await withOrg();
  // Apply .eq filters before .order (PostgrestTransformBuilder has no .eq).
  let q = db.table("rfqs").select("*");
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Rfq[];
}

/** Invited-vendor counts per rfq_id, for the list's "#vendors" column. */
export async function rfqVendorCounts(
  rfqIds: string[],
): Promise<Record<string, number>> {
  if (rfqIds.length === 0) return {};
  const { db } = await withOrg();
  const { data, error } = await db
    .table("rfq_vendors")
    .select("rfq_id")
    .in("rfq_id", rfqIds);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { rfq_id: string }[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.rfq_id] = (counts[r.rfq_id] ?? 0) + 1;
  return counts;
}

export async function getRfq(
  id: string,
): Promise<{
  rfq: Rfq;
  vendors: RfqVendor[];
  items: RfqItem[];
  bids: RfqBid[];
  bidLines: RfqBidLine[];
} | null> {
  const { db } = await withOrg();
  const { data: rfq, error } = await db
    .table("rfqs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!rfq) return null;

  // Related rows are all re-scoped by org automatically (withOrg), and keyed
  // to this rfq so a leaked id can never widen the read.
  const [vendorsRes, itemsRes, bidsRes] = await Promise.all([
    db.table("rfq_vendors").select("*").eq("rfq_id", id).order("invited_at"),
    db.table("rfq_items").select("*").eq("rfq_id", id).order("created_at"),
    db.table("rfq_bids").select("*").eq("rfq_id", id).order("submitted_at"),
  ]);
  if (vendorsRes.error) throw vendorsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (bidsRes.error) throw bidsRes.error;

  const bids = (bidsRes.data ?? []) as unknown as RfqBid[];
  const bidIds = bids.map((b) => b.id);
  let bidLines: RfqBidLine[] = [];
  if (bidIds.length > 0) {
    const { data: lines, error: linesErr } = await db
      .table("rfq_bid_lines")
      .select("*")
      .in("bid_id", bidIds)
      .order("created_at");
    if (linesErr) throw linesErr;
    bidLines = (lines ?? []) as unknown as RfqBidLine[];
  }

  return {
    rfq: rfq as unknown as Rfq,
    vendors: (vendorsRes.data ?? []) as unknown as RfqVendor[],
    items: (itemsRes.data ?? []) as unknown as RfqItem[],
    bids,
    bidLines,
  };
}

/** Vendor display names for a set of vendor ids (org-scoped). */
export async function vendorNames(
  vendorIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(vendorIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { db } = await withOrg();
  const { data, error } = await db
    .table("vendors")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { id: string; name: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.id] = r.name;
  return map;
}

/* ── Writes ────────────────────────────────────────────────────────────────── */

export interface RfqItemInput {
  item_id?: string | null;
  item_name: string;
  uom?: string | null;
  qty: number;
}

export async function createRfq(input: {
  mr_id?: string | null;
  title: string;
  project_label?: string | null;
  place_of_supply?: string | null;
  bid_deadline?: string | null;
  vendorIds: string[];
  items: RfqItemInput[];
}): Promise<{ id: string } | { error: string }> {
  const { db, ctx } = await withOrg();

  const { data, error } = await db.table("rfqs").insert({
    mr_id: input.mr_id || null,
    title: input.title.trim(),
    project_label: input.project_label?.trim() || null,
    place_of_supply: input.place_of_supply?.trim() || null,
    bid_deadline: input.bid_deadline || null,
    status: "draft",
    created_by: ctx.userId,
  });
  if (error) return { error: error.message };
  const id = (data?.[0] as { id: string }).id;

  const lines = (input.items ?? [])
    .filter((it) => it.item_name.trim())
    .map((it) => ({
      rfq_id: id,
      item_id: it.item_id || null,
      item_name: it.item_name.trim(),
      uom: it.uom?.trim() || null,
      qty: Number(it.qty) || 0,
    }));
  if (lines.length > 0) {
    const { error: lineErr } = await db.table("rfq_items").insert(lines);
    if (lineErr) return { error: lineErr.message };
  }

  // Dedupe vendor ids — one invitation per vendor per RFQ.
  const vendorIds = [...new Set((input.vendorIds ?? []).filter(Boolean))];
  if (vendorIds.length > 0) {
    const { error: vErr } = await db.table("rfq_vendors").insert(
      vendorIds.map((vendor_id) => ({ rfq_id: id, vendor_id })),
    );
    if (vErr) return { error: vErr.message };
  }

  return { id };
}

/**
 * Convert an approved Material Request into an RFQ: header fields and lines
 * pre-fill from the MR; no vendors yet (they're picked on the RFQ afterwards).
 */
export async function createRfqFromMr(
  mrId: string,
): Promise<{ id: string } | { error: string }> {
  const { db } = await withOrg();

  const { data: mr, error } = await db
    .table("material_requests")
    .select("*")
    .eq("id", mrId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!mr) return { error: "Material request not found." };

  const { data: mrItems, error: itemsErr } = await db
    .table("material_request_items")
    .select("*")
    .eq("mr_id", mrId)
    .order("created_at");
  if (itemsErr) return { error: itemsErr.message };

  const source = mr as unknown as {
    title: string;
    project_label: string | null;
  };
  const lines = ((mrItems ?? []) as unknown as RfqItemInput[]).map((it) => ({
    item_id: it.item_id ?? null,
    item_name: it.item_name,
    uom: it.uom ?? null,
    qty: Number(it.qty) || 0,
  }));

  return createRfq({
    mr_id: mrId,
    title: source.title,
    project_label: source.project_label,
    vendorIds: [],
    items: lines,
  });
}

export interface BidLineInput {
  rfq_item_id: string;
  /** CONFIG entered by the user/vendor — never produced by an LLM. */
  unit_rate: number;
  tax_pct?: number | null;
  freight?: number | null;
}

/**
 * Proxy bid entry: records a vendor's bid on their behalf (entry_mode 'proxy',
 * submitted_by = current user), computes each line_total via landedLineTotal()
 * against the RFQ item's qty, and marks the vendor 'submitted'. Re-entry adds a
 * new version — earlier versions stay as history.
 */
export async function enterBid(
  rfqId: string,
  vendorId: string,
  input: {
    delivery_date?: string | null;
    remark?: string | null;
    lines: BidLineInput[];
  },
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();

  const { data: rfq } = await db
    .table("rfqs")
    .select("id, status")
    .eq("id", rfqId)
    .maybeSingle();
  if (!rfq) return { error: "RFQ not found." };
  const status = (rfq as unknown as { status: string }).status;
  if (status === "awarded" || status === "closed") {
    return { error: "This RFQ is already awarded/closed — bids are locked." };
  }

  // The vendor must be invited to THIS rfq.
  const { data: rv } = await db
    .table("rfq_vendors")
    .select("id, response_status")
    .eq("rfq_id", rfqId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!rv) return { error: "This vendor is not invited to this RFQ." };

  // Only quoted lines (unit_rate > 0) become bid lines — unquoted items stay
  // blank in the matrix rather than faking a zero-cost winner.
  const quoted = (input.lines ?? []).filter(
    (l) => Number(l.unit_rate) > 0 && l.rfq_item_id,
  );
  if (quoted.length === 0) {
    return { error: "Enter at least one unit rate above zero." };
  }

  // Item qtys for landed cost (scoped to this org + this rfq).
  const { data: rfqItems, error: itemsErr } = await db
    .table("rfq_items")
    .select("id, qty")
    .eq("rfq_id", rfqId);
  if (itemsErr) return { error: itemsErr.message };
  const qtyById = new Map(
    ((rfqItems ?? []) as unknown as { id: string; qty: number }[]).map((r) => [
      r.id,
      Number(r.qty) || 0,
    ]),
  );

  // Versioning: latest bid wins in comparisons; history is kept.
  const { data: prevBids } = await db
    .table("rfq_bids")
    .select("version")
    .eq("rfq_id", rfqId)
    .eq("vendor_id", vendorId);
  const prevVersions = ((prevBids ?? []) as unknown as { version: number }[]).map(
    (b) => Number(b.version) || 0,
  );
  const nextVersion = Math.max(0, ...prevVersions) + 1;

  const { data: bidRows, error: bidErr } = await db
    .table("rfq_bids")
    .insert({
      rfq_id: rfqId,
      vendor_id: vendorId,
      version: nextVersion,
      delivery_date: input.delivery_date || null,
      remark: input.remark?.trim() || null,
      entry_mode: "proxy",
      submitted_by: ctx.userId,
    });
  if (bidErr) return { error: bidErr.message };
  const bidId = (bidRows?.[0] as { id: string }).id;

  const lineValues = quoted
    .filter((l) => qtyById.has(l.rfq_item_id)) // defensive: line must point at this rfq's items
    .map((l) => {
      const qty = qtyById.get(l.rfq_item_id)!;
      const unitRate = Number(l.unit_rate) || 0;
      const taxPct = l.tax_pct == null ? 18 : Number(l.tax_pct) || 0;
      const freight = l.freight == null ? 0 : Number(l.freight) || 0;
      return {
        bid_id: bidId,
        rfq_item_id: l.rfq_item_id,
        unit_rate: unitRate,
        tax_pct: taxPct,
        freight,
        // THE engine line — computed, never LLM-produced.
        line_total: landedLineTotal(qty, unitRate, freight),
      };
    });
  if (lineValues.length === 0) {
    return { error: "None of the entered lines belong to this RFQ." };
  }
  const { error: lineErr } = await db
    .table("rfq_bid_lines")
    .insert(lineValues);
  if (lineErr) return { error: lineErr.message };

  const { error: rvErr } = await db
    .table("rfq_vendors")
    .updateById((rv as unknown as { id: string }).id, {
      response_status: "submitted" satisfies ResponseStatus,
    });
  if (rvErr) return { error: rvErr.message };

  return {};
}

/* ── Comparison matrix ─────────────────────────────────────────────────────── */

export interface ComparisonCell {
  vendorId: string;
  vendorName: string;
  bidId: string;
  lineTotal: number;
}

export interface BidComparison {
  rfq: Rfq;
  columns: { vendorId: string; vendorName: string; responseStatus: ResponseStatus }[];
  items: {
    rfqItemId: string;
    item_name: string;
    uom: string | null;
    qty: number;
    cells: ComparisonCell[];
  }[];
  vendorTotals: {
    vendorId: string;
    vendorName: string;
    total: number;
    rank: number | undefined;
  }[];
}

/**
 * Build the side-by-side matrix: rows = rfq_items, columns = invited vendors.
 * Each vendor's ACTIVE bid is their highest version. Vendor totals sum their
 * active bid's landed lines; ranks come from the pure `rankBids` helper
 * (lowest total → rank 1; no-bid vendors rank undefined).
 */
export async function bidComparison(rfqId: string): Promise<BidComparison | null> {
  const result = await getRfq(rfqId);
  if (!result) return null;
  const { rfq, vendors, items, bids, bidLines } = result;

  const names = await vendorNames(vendors.map((v) => v.vendor_id));

  const columns = vendors.map((v) => ({
    vendorId: v.vendor_id,
    vendorName: names[v.vendor_id] ?? v.vendor_id.slice(0, 8),
    responseStatus: v.response_status,
  }));

  // Active bid per vendor = highest version (latest submission breaks ties).
  const activeByVendor = new Map<string, RfqBid>();
  for (const b of [...bids].sort((a, z) => a.version - z.version)) {
    const cur = activeByVendor.get(b.vendor_id);
    if (!cur || b.version >= cur.version) activeByVendor.set(b.vendor_id, b);
  }
  const activeLinesByBid = new Map<string, Map<string, RfqBidLine>>();
  for (const line of bidLines) {
    let m = activeLinesByBid.get(line.bid_id);
    if (!m) {
      m = new Map();
      activeLinesByBid.set(line.bid_id, m);
    }
    m.set(line.rfq_item_id, line);
  }
  const activeLine = (vendorId: string, rfqItemId: string) => {
    const bid = activeByVendor.get(vendorId);
    if (!bid) return null;
    return activeLinesByBid.get(bid.id)?.get(rfqItemId) ?? null;
  };

  const matrixItems = items.map((it) => ({
    rfqItemId: it.id,
    item_name: it.item_name,
    uom: it.uom,
    qty: Number(it.qty) || 0,
    cells: columns
      .map<ComparisonCell | null>((col) => {
        const line = activeLine(col.vendorId, it.id);
        if (!line) return null;
        return {
          vendorId: col.vendorId,
          vendorName: col.vendorName,
          bidId: line.bid_id,
          lineTotal: Number(line.line_total) || 0,
        };
      })
      .filter((c): c is ComparisonCell => c !== null),
  }));

  const totalsForRanking = columns.map((col) => {
    const bid = activeByVendor.get(col.vendorId);
    const lines = bid ? (activeLinesByBid.get(bid.id)?.values() ?? []) : [];
    const total = [...lines].reduce(
      (sum, l) => sum + (Number(l.line_total) || 0),
      0,
    );
    return { vendorId: col.vendorId, total };
  });
  const ranks = rankBids(totalsForRanking);

  const vendorTotals = columns.map((col) => {
    const total =
      totalsForRanking.find((t) => t.vendorId === col.vendorId)?.total ?? 0;
    return {
      vendorId: col.vendorId,
      vendorName: col.vendorName,
      total,
      rank: ranks[col.vendorId],
    };
  });

  return { rfq, columns, items: matrixItems, vendorTotals };
}

/* ── Award ─────────────────────────────────────────────────────────────────── */

/**
 * One-click award: flips status to 'awarded' AND auto-creates a draft PO for the
 * winning (rank-1, lowest landed total) vendor, with lines carried over from that
 * vendor's active bid (PROC-RFQ-008). Rates are CONFIG copied from the bid — no
 * LLM. PO creation is best-effort: the award still succeeds if it can't be built,
 * and re-awarding is a no-op (so no duplicate PO). Returns the new PO id.
 */
export async function awardRfq(
  rfqId: string,
): Promise<{ error?: string; poId?: string }> {
  const full = await getRfq(rfqId);
  if (!full) return { error: "RFQ not found." };
  const { rfq, vendors, items, bids, bidLines } = full;
  if (rfq.status === "awarded") return {}; // idempotent — don't re-create a PO
  if (rfq.status === "closed") return { error: "This RFQ is closed." };
  if (bids.length < 1) return { error: "Award needs at least one submitted bid." };

  const { db } = await withOrg();

  // Active bid per vendor (highest version wins) + its lines by rfq_item.
  const activeByVendor = new Map<string, RfqBid>();
  for (const b of [...bids].sort((a, z) => a.version - z.version)) {
    const cur = activeByVendor.get(b.vendor_id);
    if (!cur || b.version >= cur.version) activeByVendor.set(b.vendor_id, b);
  }
  const linesByBid = new Map<string, Map<string, RfqBidLine>>();
  for (const l of bidLines) {
    let m = linesByBid.get(l.bid_id);
    if (!m) { m = new Map(); linesByBid.set(l.bid_id, m); }
    m.set(l.rfq_item_id, l);
  }

  // Rank vendors by total landed cost; the winner is rank 1.
  const totals = vendors
    .map((v) => {
      const bid = activeByVendor.get(v.vendor_id);
      const lines = bid ? [...(linesByBid.get(bid.id)?.values() ?? [])] : [];
      return {
        vendorId: v.vendor_id,
        total: lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0),
        hasBid: !!bid && lines.length > 0,
      };
    })
    .filter((t) => t.hasBid);
  const ranks = rankBids(totals.map((t) => ({ vendorId: t.vendorId, total: t.total })));
  const winnerId = Object.keys(ranks).find((vid) => ranks[vid] === 1);

  // Flip the RFQ to awarded first (the guaranteed part of the operation).
  const { error: awardErr } = await db.table("rfqs").updateById(rfqId, {
    status: "awarded" satisfies (typeof RFQ_STATUSES)[number],
    updated_at: new Date().toISOString(),
  });
  if (awardErr) return { error: awardErr.message };

  // Best-effort: draft a PO for the winner from their bid lines.
  if (!winnerId) return {};
  const winnerBid = activeByVendor.get(winnerId)!;
  const winnerLines = linesByBid.get(winnerBid.id);
  const poLines = items
    .map((it) => {
      const bl = winnerLines?.get(it.id);
      if (!bl) return null;
      return {
        item_id: it.item_id ?? null,
        item_name: it.item_name,
        uom: it.uom,
        qty: Number(it.qty) || 0,
        unit_rate: Number(bl.unit_rate) || 0, // CONFIG from the bid, not an LLM
        tax_pct: Number(bl.tax_pct) || 0,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  if (poLines.length === 0) return {}; // awarded, but nothing to draft

  const names = await vendorNames([winnerId]);
  const po = await createPurchaseOrder({
    name: `PO — ${rfq.title}`,
    vendor_id: winnerId,
    rfq_id: rfqId,
    project_label: rfq.project_label,
    lines: poLines,
  });
  if ("error" in po) return {}; // award stands; PO draft can be retried manually
  return { poId: po.id };
}
