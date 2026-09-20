import { describe, it, expect } from "vitest";
import dotenv from "dotenv";
import path from "node:path";

/**
 * LIVE end-to-end drive of the procurement chain (U1) — OPT-IN, not part of the
 * default suite. It writes REAL rows into the demo tenant through the app's own
 * data layer (the same functions the server actions call), then verifies each
 * hop against what it wrote. This is the "drive it as one flow with real data"
 * the chain has never had (PLAN-DZYLO-PROC §B1 / U1).
 *
 *   Run it:  U1_LIVE=1 node ./node_modules/vitest/vitest.mjs run lib/procurement-chain.live.test.ts
 *
 * Rows are tagged "[U1-TEST]" so they are findable. NB: stock_movements is an
 * append-only ledger (HARD RULE 4) — these rows cannot be cleanly deleted, only
 * reversed. Owner authorised writing them (session 2026-09-12).
 */

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Demo tenant fixtures (verified present via db.mjs).
const PROJECT_LABEL = "Malviya Nagar 3BHK";
const VENDOR_CENTURY = "466eca5f-a4a5-4170-970e-ceb8978320c6";
const VENDOR_HETTICH = "e7e39271-358f-4147-a9a8-e2984e003a2e";
const WAREHOUSE_HEAD_OFFICE = "cf91eefd-a6d3-42b2-b724-18311160cc87";
const TAG = "[U1-TEST]";

const PLYWOOD = "18mm BWP Plywood (U1)";
const LAMINATE = "1mm Laminate — Matte (U1)";

const run = process.env.U1_LIVE === "1";

describe.runIf(run)("LIVE procurement chain drive (writes to demo tenant)", () => {
  it(
    "drives MR → RFQ → bids → award → PO → receive → GRN → stock and verifies each hop",
    { timeout: 120_000 },
    async () => {
      const { withOrg } = await import("@/lib/data/with-org");
      const mrMod = await import("@/lib/data/material-requests");
      const rfqMod = await import("@/lib/data/rfq");
      const poMod = await import("@/lib/data/purchase-orders");
      const invMod = await import("@/lib/data/inventory");
      const { landedLineTotal, rankBids } = await import("@/lib/rfq-model");
      const { poAmount } = await import("@/lib/po-model");

      const { db } = await withOrg();
      const log = (m: string) => console.log(`  [U1] ${m}`);

      // ── HOP 1 — Material Request (quantities only) ────────────────────────
      const mr = await mrMod.createMaterialRequest({
        title: `${TAG} Plywood & Laminate drive`,
        project_label: PROJECT_LABEL,
        expected_delivery: "2026-10-15",
        items: [
          { item_name: PLYWOOD, uom: "sheet", qty: 40 },
          { item_name: LAMINATE, uom: "sheet", qty: 25 },
        ],
      });
      expect(mr, `MR create: ${JSON.stringify(mr)}`).toHaveProperty("id");
      const mrId = (mr as unknown as { id: string }).id;
      log(`MR ${mrId}`);
      const { data: mrItems } = await db
        .table("material_request_items")
        .select("item_name, qty")
        .eq("mr_id", mrId);
      expect(mrItems).toHaveLength(2);

      // ── HOP 2 — RFQ from the MR, both vendors invited ─────────────────────
      const rfq = await rfqMod.createRfq({
        mr_id: mrId,
        title: `${TAG} Plywood & Laminate RFQ`,
        project_label: PROJECT_LABEL,
        place_of_supply: "Telangana",
        bid_deadline: "2026-10-01",
        vendorIds: [VENDOR_CENTURY, VENDOR_HETTICH],
        items: [
          { item_name: PLYWOOD, uom: "sheet", qty: 40 },
          { item_name: LAMINATE, uom: "sheet", qty: 25 },
        ],
      });
      expect(rfq, `RFQ create: ${JSON.stringify(rfq)}`).toHaveProperty("id");
      const rfqId = (rfq as unknown as { id: string }).id;
      log(`RFQ ${rfqId}`);

      const { data: rfqItemRows } = await db
        .table("rfq_items")
        .select("id, item_name, qty")
        .eq("rfq_id", rfqId);
      const itemId = (name: string) =>
        (rfqItemRows as unknown as { id: string; item_name: string }[]).find(
          (r) => r.item_name === name,
        )!.id;
      const plyItem = itemId(PLYWOOD);
      const lamItem = itemId(LAMINATE);

      // ── HOP 3 — proxy bids from both vendors ──────────────────────────────
      const bidCentury = await rfqMod.enterBid(rfqId, VENDOR_CENTURY, {
        delivery_date: "2026-10-12",
        remark: `${TAG} bid`,
        lines: [
          { rfq_item_id: plyItem, unit_rate: 1820, tax_pct: 18, freight: 800 },
          { rfq_item_id: lamItem, unit_rate: 940, tax_pct: 18, freight: 400 },
        ],
      });
      expect(bidCentury.error, `Century bid: ${bidCentury.error}`).toBeUndefined();
      const bidHettich = await rfqMod.enterBid(rfqId, VENDOR_HETTICH, {
        delivery_date: "2026-10-14",
        remark: `${TAG} bid`,
        lines: [
          { rfq_item_id: plyItem, unit_rate: 1850, tax_pct: 18, freight: 500 },
          { rfq_item_id: lamItem, unit_rate: 930, tax_pct: 18, freight: 600 },
        ],
      });
      expect(bidHettich.error, `Hettich bid: ${bidHettich.error}`).toBeUndefined();

      // Verify the persisted landed-cost lines match the pure engine.
      const { data: bidRows } = await db
        .table("rfq_bids")
        .select("id, vendor_id")
        .eq("rfq_id", rfqId);
      const bidIds = (bidRows as unknown as { id: string; vendor_id: string }[]);
      const centuryBidId = bidIds.find((b) => b.vendor_id === VENDOR_CENTURY)!.id;
      const { data: centuryLines } = await db
        .table("rfq_bid_lines")
        .select("line_total")
        .eq("bid_id", centuryBidId);
      const centuryTotal = (centuryLines as unknown as { line_total: number }[]).reduce(
        (s, l) => s + Number(l.line_total),
        0,
      );
      // 40×1820+800 + 25×940+400 = 73,600 + 23,900
      expect(centuryTotal).toBe(
        landedLineTotal(40, 1820, 800) + landedLineTotal(25, 940, 400),
      );
      expect(centuryTotal).toBe(97500);

      // rankBids: Century is the overall L1 (97,500 < 98,350).
      const ranks = rankBids([
        { vendorId: VENDOR_CENTURY, total: 97500 },
        { vendorId: VENDOR_HETTICH, total: 98350 },
      ]);
      expect(ranks[VENDOR_CENTURY]).toBe(1);

      // ── HOP 4 — award Century; RFQ stamped + PO drafted ───────────────────
      const award = await rfqMod.awardRfq(rfqId, {
        vendorId: VENDOR_CENTURY,
        reason: "Lowest total landed cost (U1 drive)",
      });
      expect(award.error, `award: ${award.error}`).toBeUndefined();
      expect(award.poId, "award should draft a PO").toBeTruthy();
      const poId = award.poId!;
      log(`PO ${poId}`);

      // F1 guard: the real award path DOES stamp the winner (the seed did not).
      const { data: rfqAfter } = await db
        .table("rfqs")
        .select("status, awarded_vendor_id")
        .eq("id", rfqId)
        .maybeSingle();
      expect((rfqAfter as unknown as { status: string }).status).toBe("awarded");
      expect((rfqAfter as unknown as { awarded_vendor_id: string }).awarded_vendor_id).toBe(
        VENDOR_CENTURY,
      );

      // F2: freight is copied as its own PO line, so amount = landed total.
      const { data: poLineRows } = await db
        .table("po_lines")
        .select("id, item_name, qty, unit_rate, line_total")
        .eq("po_id", poId);
      const poLines = poLineRows as unknown as {
        id: string;
        item_name: string;
        qty: number;
        unit_rate: number;
      }[];
      expect(poLines.some((l) => l.item_name === "Freight & delivery")).toBe(true);
      expect(poAmount(poLines)).toBe(97500); // 72,800 + 23,500 + 1,200 freight
      const { data: poRow } = await db
        .table("purchase_orders")
        .select("amount, order_state")
        .eq("id", poId)
        .maybeSingle();
      expect(Number((poRow as unknown as { amount: number }).amount)).toBe(97500);

      // ── HOP 5 — partial receipt derives partially_delivered ───────────────
      const poLineId = (name: string) =>
        poLines.find((l) => l.item_name.startsWith(name.split(" ")[0]))!.id;
      const receipt = await poMod.recordReceipt(poId, {
        mode: "admin_override",
        note: `${TAG} partial receipt`,
        lines: [
          { po_line_id: poLineId("18mm"), qty_received: 40 }, // plywood full
          { po_line_id: poLineId("1mm"), qty_received: 10 }, // laminate short
        ],
      });
      expect(receipt.error, `receipt: ${receipt.error}`).toBeUndefined();
      const { data: poAfterReceipt } = await db
        .table("purchase_orders")
        .select("order_state")
        .eq("id", poId)
        .maybeSingle();
      expect((poAfterReceipt as unknown as { order_state: string }).order_state).toBe(
        "partially_delivered",
      );

      // ── HOP 6 — book received goods into stock via a GRN ──────────────────
      const stockIn = await invMod.addStockIn({
        warehouse_id: WAREHOUSE_HEAD_OFFICE,
        vendor_id: VENDOR_CENTURY,
        po_id: poId,
        note: `${TAG} GRN`,
        lines: [
          { item_name: PLYWOOD, uom: "sheet", qty: 40, unit_rate: 1820, gst_pct: 18 },
          { item_name: LAMINATE, uom: "sheet", qty: 10, unit_rate: 940, gst_pct: 18 },
        ],
      });
      expect(stockIn.error, `stock-in: ${stockIn.error}`).toBeUndefined();
      log(`GRN ${stockIn.number}`);

      // The GRN's movements equal the received quantities.
      const { data: grnRow } = await db
        .table("grns")
        .select("id, grn_no, status")
        .eq("po_id", poId)
        .maybeSingle();
      expect(grnRow, "GRN should exist for the PO").toBeTruthy();
      const grnId = (grnRow as unknown as { id: string }).id;
      const { data: moves } = await db
        .table("stock_movements")
        .select("item_name, direction, qty")
        .eq("grn_id", grnId);
      const moveRows = moves as unknown as { item_name: string; direction: string; qty: number }[];
      expect(moveRows).toHaveLength(2);
      const ply = moveRows.find((m) => m.item_name === PLYWOOD)!;
      const lam = moveRows.find((m) => m.item_name === LAMINATE)!;
      expect(ply.direction).toBe("in");
      expect(Number(ply.qty)).toBe(40);
      expect(Number(lam.qty)).toBe(10);

      log(`DONE — MR ${mrId} · RFQ ${rfqId} · PO ${poId} · GRN ${stockIn.number}`);
    },
  );
});
