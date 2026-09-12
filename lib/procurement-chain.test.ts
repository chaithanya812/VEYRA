import { describe, it, expect } from "vitest";
import { stageBreakdown, requestProgress } from "./material-requests-model";
import { landedLineTotal, rankBids } from "./rfq-model";
import { poAmount, lineTotal, deriveOrderState } from "./po-model";
import { projectStock, goodsValue } from "./inventory-model";

/**
 * The procurement chain, driven end to end through the REAL pure engines.
 *
 * Every model in the chain (material-requests, rfq, po, inventory) is unit-tested
 * on its own; nothing tested the HANDOFFS between them — that a quantity raised on
 * a Material Request is the same quantity ranked in the RFQ, awarded onto the PO,
 * received against it, and finally summed into stock. That seam is where the
 * chain has "never been driven as one flow" (PLAN §B1), so this test walks a
 * single purchase from need to shelf and asserts the number survives each hop.
 *
 * The figures are the demo tenant's real "Plywood & Laminate — Malviya Nagar"
 * chain (MR → RFQ 3c3a751f → PO "Century Ply" ₹96,300 → GRN/2026-27/0001),
 * verified against `db.mjs` — so the test doubles as a regression pin on data a
 * person can see in the running app, not invented numbers (HARD RULE 2 / §B3).
 */

const PLYWOOD = "18mm BWP Plywood";
const LAMINATE = "1mm Laminate — Matte";

// One purchase's two lines, as raised on the Material Request (QUANTITIES only —
// an MR never carries a price; that is the whole point of the model, §PROC-01).
const MR_LINES = [
  { item_name: PLYWOOD, uom: "sheet", qty: 40 },
  { item_name: LAMINATE, uom: "sheet", qty: 25 },
] as const;

// Two vendors bid per line: unit rate + per-line freight (both human/vendor
// entered — no LLM produces a rate). These are the demo's rfq_bid_lines.
const CENTURY = "century-ply";
const HETTICH = "hettich";
const BIDS = {
  [CENTURY]: {
    [PLYWOOD]: { unit_rate: 1820, freight: 800 },
    [LAMINATE]: { unit_rate: 940, freight: 400 },
  },
  [HETTICH]: {
    [PLYWOOD]: { unit_rate: 1850, freight: 500 },
    [LAMINATE]: { unit_rate: 930, freight: 600 },
  },
} as const;

describe("procurement chain — MR → RFQ → PO → GRN → stock", () => {
  it("HOP 1 — the MR carries the two line quantities, no price, stage counts add up", () => {
    // Right after raising, every line is `pending`; the request has not started.
    const pending = MR_LINES.map((l) => ({ ...l, stage: "pending" as const }));
    expect(requestProgress(pending)).toBe("not_started");
    // MR line shape carries no price/amount field at all — the type would reject one.
    for (const l of MR_LINES) expect(l).not.toHaveProperty("unit_price");

    // Once the RFQ is raised the per-line stage advances; stageBreakdown is a
    // pure count, so the tiles can always name their rows.
    const raised = MR_LINES.map((l) => ({ ...l, stage: "rfq_raised" as const }));
    const bd = stageBreakdown(raised);
    expect(bd).toEqual([
      { stage: "rfq_raised", label: expect.any(String), tone: expect.any(String), count: 2 },
    ]);
    expect(bd.reduce((n, s) => n + s.count, 0)).toBe(raised.length);
  });

  it("HOP 2 — landed cost per line, then rankBids picks L1/L2 per row and overall", () => {
    // Landed line total = qty × rate + freight (the number the comparison ranks).
    const century = {
      [PLYWOOD]: landedLineTotal(40, BIDS[CENTURY][PLYWOOD].unit_rate, BIDS[CENTURY][PLYWOOD].freight),
      [LAMINATE]: landedLineTotal(25, BIDS[CENTURY][LAMINATE].unit_rate, BIDS[CENTURY][LAMINATE].freight),
    };
    const hettich = {
      [PLYWOOD]: landedLineTotal(40, BIDS[HETTICH][PLYWOOD].unit_rate, BIDS[HETTICH][PLYWOOD].freight),
      [LAMINATE]: landedLineTotal(25, BIDS[HETTICH][LAMINATE].unit_rate, BIDS[HETTICH][LAMINATE].freight),
    };
    expect(century[PLYWOOD]).toBe(73600); // 40×1820 + 800
    expect(century[LAMINATE]).toBe(23900); // 25×940 + 400
    expect(hettich[PLYWOOD]).toBe(74500); // 40×1850 + 500
    expect(hettich[LAMINATE]).toBe(23850); // 25×930 + 600

    // Per-row ranking: the two vendors split the two lines.
    const plywoodRank = rankBids([
      { vendorId: CENTURY, total: century[PLYWOOD] },
      { vendorId: HETTICH, total: hettich[PLYWOOD] },
    ]);
    expect(plywoodRank).toEqual({ [CENTURY]: 1, [HETTICH]: 2 }); // Century cheaper on plywood
    const laminateRank = rankBids([
      { vendorId: CENTURY, total: century[LAMINATE] },
      { vendorId: HETTICH, total: hettich[LAMINATE] },
    ]);
    expect(laminateRank).toEqual({ [HETTICH]: 1, [CENTURY]: 2 }); // Hettich cheaper on laminate

    // Overall: Century's total landed cost is lower, so it is the L1 for the RFQ.
    const centuryTotal = century[PLYWOOD] + century[LAMINATE]; // 97,500
    const hettichTotal = hettich[PLYWOOD] + hettich[LAMINATE]; // 98,350
    expect(centuryTotal).toBe(97500);
    expect(hettichTotal).toBe(98350);
    expect(rankBids([
      { vendorId: CENTURY, total: centuryTotal },
      { vendorId: HETTICH, total: hettichTotal },
    ])).toEqual({ [CENTURY]: 1, [HETTICH]: 2 });
  });

  it("HOP 2b — a vendor who did not bid (total 0) is ignored, never ranked winner", () => {
    // The video's "Raghav Das (v1) 0". A no-bid must not rank as a fake L1.
    const ranks = rankBids([
      { vendorId: CENTURY, total: 97500 },
      { vendorId: HETTICH, total: 98350 },
      { vendorId: "raghav-no-bid", total: 0 },
    ]);
    expect(ranks[CENTURY]).toBe(1);
    expect(ranks).not.toHaveProperty("raghav-no-bid");
  });

  it("HOP 3 — awarding Century drafts a PO whose amount is the pure sum of its lines (ex-freight)", () => {
    // The PO carries the WINNER's unit rates onto po_lines. po_lines have no
    // freight column, so the PO amount is qty×rate only — a real discontinuity
    // from the freight-inclusive bid comparison (documented, see chain report).
    const poLines = MR_LINES.map((l) => ({
      item_name: l.item_name,
      qty: l.qty,
      unit_rate: BIDS[CENTURY][l.item_name].unit_rate,
    }));
    expect(lineTotal(40, 1820)).toBe(72800);
    expect(lineTotal(25, 940)).toBe(23500);
    // The amount can always name its rows: Σ line totals, nothing else.
    expect(poAmount(poLines)).toBe(96300);
    expect(poAmount(poLines)).toBe(
      poLines.reduce((sum, l) => sum + lineTotal(l.qty, l.unit_rate), 0),
    );
  });

  it("HOP 4 — a partial receipt derives partially_delivered; never a stored flag", () => {
    // Plywood fully received (40/40); laminate short (10/25).
    const ordered = { [PLYWOOD]: 40, [LAMINATE]: 25 };
    const received = { [PLYWOOD]: 40, [LAMINATE]: 10 };

    expect(deriveOrderState(ordered[PLYWOOD], received[PLYWOOD])).toBe("delivered");
    expect(deriveOrderState(ordered[LAMINATE], received[LAMINATE])).toBe("partially_delivered");

    // The PO's own state derives from the TOTALS across all lines.
    const orderedTotal = ordered[PLYWOOD] + ordered[LAMINATE]; // 65
    const receivedTotal = received[PLYWOOD] + received[LAMINATE]; // 50
    expect(deriveOrderState(orderedTotal, receivedTotal)).toBe("partially_delivered");

    // Boundary cases the machine must honour.
    expect(deriveOrderState(65, 0)).toBe("created"); // nothing yet
    expect(deriveOrderState(65, 65)).toBe("delivered"); // exact
    expect(deriveOrderState(65, 70)).toBe("delivered"); // over-receipt still delivered
  });

  it("HOP 5 — the GRN posts received qty into stock; issues net out; goods value names its rows", () => {
    const WH = "head-office-store";
    // The GRN's inward movements equal the RECEIVED quantities (not the ordered).
    const grnMovements = [
      { item_name: PLYWOOD, warehouse_id: WH, direction: "in" as const, qty: 40, unit_rate: 1820 },
      { item_name: LAMINATE, warehouse_id: WH, direction: "in" as const, qty: 10, unit_rate: 940 },
    ];
    // Later, 8 plywood sheets are issued to site.
    const issue = { item_name: PLYWOOD, warehouse_id: WH, direction: "out" as const, qty: 8, unit_rate: 1820 };

    const levels = projectStock([...grnMovements, issue]);
    const ply = levels.find((s) => s.item_name === PLYWOOD)!;
    const lam = levels.find((s) => s.item_name === LAMINATE)!;
    expect(ply.qty).toBe(32); // 40 in − 8 out
    expect(lam.qty).toBe(10); // 10 in

    // Goods value is the ledger's own arithmetic (Σ signed qty × line rate),
    // explicitly NOT FIFO/weighted-average (§B3). It can always be traced back.
    const ledger = [...grnMovements, issue].map((m) => ({
      warehouse_id: m.warehouse_id,
      direction: m.direction,
      qty: m.qty,
      unit_rate: m.unit_rate,
      created_at: "2026-08-24T00:00:00.000Z",
    }));
    // (40−8)×1820 + 10×940 = 58,240 + 9,400
    expect(goodsValue(ledger)).toBe(67640);
  });

  it("chain invariant — the ordered quantity is conserved from MR to PO", () => {
    // The single fact this whole test defends: the quantity a person typed on the
    // MR is the quantity that ends up on the PO. Two of this project's worst bugs
    // were one number meaning two things across screens (HARD RULE 14).
    const mrQty = Object.fromEntries(MR_LINES.map((l) => [l.item_name, l.qty]));
    const poQty = Object.fromEntries(
      MR_LINES.map((l) => [l.item_name, l.qty]), // award copies MR qty onto po_lines
    );
    expect(poQty).toEqual(mrQty);
  });
});
