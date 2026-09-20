import "server-only";
import { randomUUID } from "node:crypto";
import { withOrg, orgDbForVerifiedOrg, type OrgDb } from "./with-org";
import { admin } from "@/lib/supabase/admin";
import { createPurchaseOrder } from "./purchase-orders";
import {
  landedLineTotal,
  rankBids,
  RFQ_STATUSES,
  isBidDeadlinePassed,
  nextBidVersion,
  bidSubmittedBy,
  type Rfq,
  type RfqVendor,
  type RfqItem,
  type RfqBid,
  type RfqBidLine,
  type ResponseStatus,
  type BidEntryMode,
  type RfqStatus,
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

/**
 * Invite more vendors to an EXISTING RFQ (PROC-04). Vendors can arrive after the
 * RFQ is drafted — a buyer remembers a fourth supplier once quotes start coming
 * in. Refused once the RFQ is awarded/closed: at that point the field of bids is
 * the record of a decision and must not gain a late entrant.
 *
 * Dedupes against vendors already invited so a re-add is a no-op, not a second
 * invitation. All inserted rows carry exactly `{ rfq_id, vendor_id }` — uniform
 * keys, so PostgREST cannot send an explicit NULL that defeats the
 * `response_status` column default (Part 6 · Writes).
 */
export async function addVendorsToRfq(
  rfqId: string,
  vendorIds: string[],
): Promise<{ added: number } | { error: string }> {
  const { db } = await withOrg();

  const { data: rfq, error: rfqErr } = await db
    .table("rfqs")
    .select("id, status")
    .eq("id", rfqId)
    .maybeSingle();
  if (rfqErr) return { error: rfqErr.message };
  if (!rfq) return { error: "RFQ not found." };
  const status = (rfq as unknown as { status: string }).status;
  if (status === "awarded" || status === "closed") {
    return { error: "This RFQ is awarded/closed — its vendors are locked." };
  }

  // Already-invited vendors are skipped, never re-invited.
  const { data: existing, error: exErr } = await db
    .table("rfq_vendors")
    .select("vendor_id")
    .eq("rfq_id", rfqId);
  if (exErr) return { error: exErr.message };
  const already = new Set(
    ((existing ?? []) as unknown as { vendor_id: string }[]).map(
      (r) => r.vendor_id,
    ),
  );

  const toAdd = [...new Set((vendorIds ?? []).filter(Boolean))].filter(
    (id) => !already.has(id),
  );
  if (toAdd.length === 0) return { added: 0 };

  const { error: insErr } = await db
    .table("rfq_vendors")
    .insert(toAdd.map((vendor_id) => ({ rfq_id: rfqId, vendor_id })));
  if (insErr) return { error: insErr.message };

  return { added: toAdd.length };
}

/**
 * Withdraw an invited vendor from an RFQ (PROC-04).
 *
 * Two refusals, both protecting the record:
 *  - the RFQ is awarded/closed — the vendor set is locked with the decision;
 *  - the vendor has ANY bid on this RFQ — their quote is part of the record, and
 *    deleting the invitation would orphan `rfq_bids`/`rfq_bid_lines` rows. The
 *    screen already hides the control for a vendor who has bid; this is the
 *    server-side backstop for the same rule.
 */
export async function removeRfqVendor(
  rfqId: string,
  vendorId: string,
): Promise<{ error?: string }> {
  const { db } = await withOrg();

  const { data: rfq, error: rfqErr } = await db
    .table("rfqs")
    .select("id, status")
    .eq("id", rfqId)
    .maybeSingle();
  if (rfqErr) return { error: rfqErr.message };
  if (!rfq) return { error: "RFQ not found." };
  const status = (rfq as unknown as { status: string }).status;
  if (status === "awarded" || status === "closed") {
    return { error: "This RFQ is awarded/closed — its vendors are locked." };
  }

  const { data: rv, error: rvErr } = await db
    .table("rfq_vendors")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (rvErr) return { error: rvErr.message };
  if (!rv) return { error: "That vendor is not invited to this RFQ." };

  const { data: bids, error: bidsErr } = await db
    .table("rfq_bids")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("vendor_id", vendorId)
    .limit(1);
  if (bidsErr) return { error: bidsErr.message };
  if ((bids ?? []).length > 0) {
    return {
      error:
        "Remove is blocked once a vendor has bid — their quote is part of the record.",
    };
  }

  const { error: delErr } = await db
    .table("rfq_vendors")
    .deleteById((rv as unknown as { id: string }).id);
  if (delErr) return { error: delErr.message };

  return {};
}

export interface BidLineInput {
  rfq_item_id: string;
  /** CONFIG entered by the user/vendor — never produced by an LLM. */
  unit_rate: number;
  tax_pct?: number | null;
  freight?: number | null;
}

export type BidWriteInput = {
  delivery_date?: string | null;
  remark?: string | null;
  lines: BidLineInput[];
};

/**
 * ONE bid writer. Both callers (proxy entry and the public vendor portal)
 * go through here so landedLineTotal, versioning, and the invited-vendor
 * check cannot drift. `entry_mode` / `submitted_by` are parameters instead
 * of hardcoded literals; every other check and insert is the body that used
 * to live in enterBid, unchanged.
 *
 * There is NO deadline check here. The portal refuses a late bid in
 * submitPortalBid (and on the public page). Proxy entry deliberately still
 * accepts a late quote that came by phone.
 */
async function writeBid(
  db: OrgDb,
  rfqId: string,
  vendorId: string,
  entryMode: BidEntryMode,
  submittedBy: string | null,
  input: BidWriteInput,
): Promise<{ error?: string }> {
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
  const version = nextBidVersion(prevVersions);

  const { data: bidRows, error: bidErr } = await db
    .table("rfq_bids")
    .insert({
      rfq_id: rfqId,
      vendor_id: vendorId,
      version,
      delivery_date: input.delivery_date || null,
      remark: input.remark?.trim() || null,
      entry_mode: entryMode,
      submitted_by: bidSubmittedBy(entryMode, submittedBy),
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

/**
 * Proxy bid entry: records a vendor's bid on their behalf (entry_mode 'proxy',
 * submitted_by = current user), computes each line_total via landedLineTotal()
 * against the RFQ item's qty, and marks the vendor 'submitted'. Re-entry adds a
 * new version — earlier versions stay as history.
 */
export async function enterBid(
  rfqId: string,
  vendorId: string,
  input: BidWriteInput,
): Promise<{ error?: string }> {
  const { db, ctx } = await withOrg();
  return writeBid(db, rfqId, vendorId, "proxy", ctx.userId, input);
}

/* ── Public vendor portal (/rfq-bid/<token>) ──────────────────────────────── */

type PortalInvite = {
  vendorRowId: string;
  orgId: string;
  rfqId: string;
  vendorId: string;
};

/**
 * PUBLIC token → invite lookup. The unguessable share_token is the capability;
 * share_enabled gates it. This is the single raw-`admin` call on the portal
 * path: resolving the org is its whole job. Everything after uses
 * orgDbForVerifiedOrg so writes stay inside the one isolation accessor.
 *
 * Returns `{ invite: null, error: null }` for a missing/disabled token (the
 * page renders "link unavailable"). A query failure is reported as itself.
 */
async function lookupPortalInvite(token: string): Promise<{
  invite: PortalInvite | null;
  error: string | null;
}> {
  if (!token) return { invite: null, error: null };
  const { data, error } = await admin
    .from("rfq_vendors")
    .select("id, org_id, rfq_id, vendor_id")
    .eq("share_token", token)
    .eq("share_enabled", true)
    .maybeSingle();
  if (error) return { invite: null, error: error.message };
  if (!data) return { invite: null, error: null };
  const row = data as {
    id: string;
    org_id: string;
    rfq_id: string;
    vendor_id: string;
  };
  return {
    invite: {
      vendorRowId: row.id,
      orgId: row.org_id,
      rfqId: row.rfq_id,
      vendorId: row.vendor_id,
    },
    error: null,
  };
}

export type PortalRfqView = {
  sellerName: string | null;
  title: string;
  project_label: string | null;
  place_of_supply: string | null;
  bid_deadline: string | null;
  status: RfqStatus;
  biddingClosed: boolean;
  items: { id: string; item_name: string; uom: string | null; qty: number }[];
  currentBid: {
    version: number;
    delivery_date: string | null;
    remark: string | null;
    submitted_at: string;
    lines: {
      rfq_item_id: string;
      unit_rate: number;
      tax_pct: number;
      freight: number;
    }[];
  } | null;
};

/**
 * PUBLIC read by per-vendor share token — NO auth, NO session, NO org from
 * the caller. The unguessable token is the capability; share_enabled gates
 * it. Returns ONLY presentational fields for THIS vendor's RFQ: header, line
 * items, the seller org's name, and this vendor's own current bid. Never
 * other vendors' names/rates/totals, never the comparison matrix, never
 * L1/L2/L3, never internal remarks, never the MR, never org_id.
 */
export async function getPortalRfq(token: string): Promise<PortalRfqView | null> {
  const { invite, error } = await lookupPortalInvite(token);
  if (error) throw new Error(error);
  if (!invite) return null;

  const db = orgDbForVerifiedOrg(invite.orgId);

  const { data: rfq, error: rfqErr } = await db
    .table("rfqs")
    .select("title, project_label, place_of_supply, bid_deadline, status")
    .eq("id", invite.rfqId)
    .maybeSingle();
  if (rfqErr) throw rfqErr;
  if (!rfq) return null;
  const header = rfq as unknown as {
    title: string;
    project_label: string | null;
    place_of_supply: string | null;
    bid_deadline: string | null;
    status: RfqStatus;
  };

  const { data: itemRows, error: itemsErr } = await db
    .table("rfq_items")
    .select("id, item_name, uom, qty")
    .eq("rfq_id", invite.rfqId)
    .order("created_at");
  if (itemsErr) throw itemsErr;

  // `orgs` is a platform table (not tenant-scoped), so it cannot go through
  // orgDb. Same sanctioned read getSharedQuotation uses to brand the document;
  // the org id never leaves this function.
  const { data: org, error: orgErr } = await admin
    .from("orgs")
    .select("name")
    .eq("id", invite.orgId)
    .maybeSingle();
  if (orgErr) throw orgErr;

  const { data: bidRows, error: bidsErr } = await db
    .table("rfq_bids")
    .select("id, version, delivery_date, remark, submitted_at")
    .eq("rfq_id", invite.rfqId)
    .eq("vendor_id", invite.vendorId)
    .order("version", { ascending: false });
  if (bidsErr) throw bidsErr;
  const latest = ((bidRows ?? []) as unknown as {
    id: string;
    version: number;
    delivery_date: string | null;
    remark: string | null;
    submitted_at: string;
  }[])[0] ?? null;

  let currentBid: PortalRfqView["currentBid"] = null;
  if (latest) {
    const { data: lineRows, error: linesErr } = await db
      .table("rfq_bid_lines")
      .select("rfq_item_id, unit_rate, tax_pct, freight")
      .eq("bid_id", latest.id);
    if (linesErr) throw linesErr;
    currentBid = {
      version: Number(latest.version) || 1,
      delivery_date: latest.delivery_date,
      remark: latest.remark,
      submitted_at: latest.submitted_at,
      lines: ((lineRows ?? []) as unknown as {
        rfq_item_id: string;
        unit_rate: number;
        tax_pct: number;
        freight: number;
      }[]).map((l) => ({
        rfq_item_id: l.rfq_item_id,
        unit_rate: Number(l.unit_rate) || 0,
        tax_pct: Number(l.tax_pct) || 0,
        freight: Number(l.freight) || 0,
      })),
    };
  }

  const biddingClosed =
    header.status === "awarded" ||
    header.status === "closed" ||
    isBidDeadlinePassed(header.bid_deadline, header.status);

  return {
    sellerName: (org as { name: string | null } | null)?.name ?? null,
    title: header.title,
    project_label: header.project_label,
    place_of_supply: header.place_of_supply,
    bid_deadline: header.bid_deadline,
    status: header.status,
    biddingClosed,
    items: ((itemRows ?? []) as unknown as {
      id: string;
      item_name: string;
      uom: string | null;
      qty: number;
    }[]).map((it) => ({
      id: it.id,
      item_name: it.item_name,
      uom: it.uom,
      qty: Number(it.qty) || 0,
    })),
    currentBid,
  };
}

/**
 * PUBLIC write: the vendor holding this token submits (or re-submits) a bid.
 * Token lookup is the auth. Deadline refusal lives HERE, not in writeBid —
 * proxy entry is unchanged and can still record a late phone quote.
 */
export async function submitPortalBid(
  token: string,
  input: BidWriteInput,
): Promise<{ error?: string }> {
  const { invite, error } = await lookupPortalInvite(token);
  if (error) return { error };
  if (!invite) return { error: "This link is not active." };

  const db = orgDbForVerifiedOrg(invite.orgId);

  const { data: rfq, error: rfqErr } = await db
    .table("rfqs")
    .select("id, status, bid_deadline")
    .eq("id", invite.rfqId)
    .maybeSingle();
  if (rfqErr) return { error: rfqErr.message };
  if (!rfq) return { error: "RFQ not found." };
  const header = rfq as unknown as {
    status: string;
    bid_deadline: string | null;
  };
  if (isBidDeadlinePassed(header.bid_deadline, header.status)) {
    return { error: "Bidding has closed." };
  }

  return writeBid(db, invite.rfqId, invite.vendorId, "portal", null, input);
}

/**
 * Mint or revoke a per-vendor portal link. Reuses an existing token if
 * present (matching quotations.setShare); disabling clears share_enabled
 * and keeps the token so re-enable restores the same URL.
 */
export async function setVendorPortalShare(
  rfqId: string,
  vendorId: string,
  enabled: boolean,
): Promise<{ token: string | null } | { error: string }> {
  const { db } = await withOrg();

  const { data: rv, error } = await db
    .table("rfq_vendors")
    .select("id, share_token")
    .eq("rfq_id", rfqId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!rv) return { error: "This vendor is not invited to this RFQ." };

  const patch: Record<string, unknown> = { share_enabled: enabled };
  let token: string | null = null;
  if (enabled) {
    token =
      (rv as unknown as { share_token: string | null }).share_token ??
      randomUUID().replace(/-/g, "");
    patch.share_token = token;
  }
  const { error: updErr } = await db
    .table("rfq_vendors")
    .updateById((rv as unknown as { id: string }).id, patch);
  if (updErr) return { error: updErr.message };
  return { token: enabled ? token : null };
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
 * Award the RFQ to a vendor A PERSON CHOSE, with the reason they chose them.
 *
 * ⚠ THIS USED TO PICK THE CHEAPEST BID AUTOMATICALLY, and PLAN-V4 §9.7 says
 * that was wrong. Frame `105853` is the evidence: in the owner's own data the
 * cheaper bid was NOT the one ordered. A site buys on delivery date, on whose
 * last three loads were not short, on who answers the phone — arithmetic ranks
 * the bids, it does not decide between them. `bidComparison()` still computes
 * the ranking and the screen still shows it; it is a suggestion now.
 *
 * So `vendorId` is required and `reason` is required, and both are stored. An
 * award nobody can explain six months later is an award nobody can defend.
 *
 * The draft PO is still built from the winner's active bid — rates are CONFIG
 * copied from that bid, never an LLM (HARD RULE 2). PO creation stays
 * best-effort: the award stands even if the draft cannot be built, and
 * re-awarding is a no-op so there is never a duplicate PO.
 */
export async function awardRfq(
  rfqId: string,
  choice: { vendorId: string; reason: string },
): Promise<{ error?: string; poId?: string }> {
  const reason = (choice?.reason ?? "").trim();
  if (!choice?.vendorId) return { error: "Choose the vendor to award to." };
  if (reason.length < 3) {
    return { error: "Say why this vendor won — an award nobody can explain is not a decision." };
  }

  const full = await getRfq(rfqId);
  if (!full) return { error: "RFQ not found." };
  const { rfq, vendors, items, bids, bidLines } = full;
  if (rfq.status === "awarded") return {}; // idempotent — don't re-create a PO
  if (rfq.status === "closed") return { error: "This RFQ is closed." };
  if (bids.length < 1) return { error: "Award needs at least one submitted bid." };
  if (!vendors.some((v) => v.vendor_id === choice.vendorId)) {
    return { error: "That vendor was not invited to this RFQ." };
  }

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

  // The winner is the vendor a person picked. The ranking below is computed
  // only so the award can record whether the buyer went with the cheapest —
  // which is a useful thing to be able to ask later, and a terrible thing to
  // decide automatically.
  const winnerId = choice.vendorId;
  if (!activeByVendor.get(winnerId)) {
    return { error: "That vendor has not submitted a bid on this RFQ." };
  }

  // Flip the RFQ to awarded first (the guaranteed part of the operation).
  const { ctx } = await withOrg();
  const { error: awardErr } = await db.table("rfqs").updateById(rfqId, {
    status: "awarded" satisfies (typeof RFQ_STATUSES)[number],
    awarded_vendor_id: winnerId,
    award_reason: reason,
    awarded_by: ctx.userId,
    awarded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (awardErr) return { error: awardErr.message };

  // Best-effort: draft a PO for the winner from their bid lines.
  const winnerBid = activeByVendor.get(winnerId);
  if (!winnerBid) return {};
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

  // F2: freight was dropped here, so the PO total disagreed with the
  // landed cost the award was ranked on. Copy it as ONE extra line
  // (no new po_lines column). tax_pct is the first quoted line's slab.
  let freightSum = 0;
  for (const it of items) {
    const bl = winnerLines?.get(it.id);
    if (!bl) continue;
    freightSum += Number(bl.freight) || 0;
  }
  if (freightSum > 0) {
    poLines.push({
      item_id: null,
      item_name: "Freight & delivery",
      uom: null,
      qty: 1,
      unit_rate: freightSum,
      tax_pct: Number(poLines[0].tax_pct) || 0,
    });
  }

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
