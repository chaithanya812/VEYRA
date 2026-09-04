import { describe, it, expect } from "vitest";

/**
 * Financial Planning's arithmetic (PLAN-V4 §9.3). Lives beside the rest of the
 * finance model on purpose — one module computes this project's money.
 */
import {
  actualDueOf,
  amountFromPct,
  clampPct,
  pctFromAmount,
  rollupContract,
  round2,
  scheduleTotals,
  splitEvenly,
  summarisePlan,
  type Contract,
  type Milestone,
} from "./finance-model";

function ms(over: Partial<Milestone> = {}): Milestone {
  return {
    id: "m1",
    contract_id: "c1",
    seq: 1,
    name: "1st",
    pct: 40,
    amount: 800000,
    tentative_due: "2026-03-20",
    work_done: true,
    actual_due: "2026-03-20",
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("the two-way binding", () => {
  it("computes the amount from the percentage", () => {
    // 105238's Civil contract: 40% of 20,00,000 is 8,00,000.
    expect(amountFromPct(40, 2000000)).toBe(800000);
    expect(amountFromPct(20, 2000000)).toBe(400000);
  });

  it("computes the percentage from the amount", () => {
    expect(pctFromAmount(800000, 2000000)).toBe(40);
    expect(pctFromAmount(24000, 120000)).toBe(20);
  });

  it("round-trips without drifting", () => {
    const amount = amountFromPct(33.33, 1000000);
    expect(pctFromAmount(amount, 1000000)).toBe(33.33);
  });

  it("does not divide by zero while the contract value is still blank", () => {
    expect(pctFromAmount(50000, 0)).toBe(0);
  });

  it("refuses a percentage outside 0-100", () => {
    expect(clampPct(140)).toBe(100);
    expect(clampPct(-5)).toBe(0);
  });
});

describe("scheduleTotals — the 100% rule", () => {
  const contract = 2000000;

  it("accepts a schedule that bills exactly 100%", () => {
    const t = scheduleTotals(
      [
        { pct: 40, amount: 800000 },
        { pct: 20, amount: 400000 },
        { pct: 40, amount: 800000 },
      ],
      contract,
    );
    expect(t.pct).toBe(100);
    expect(t.amount).toBe(2000000);
    expect(t.isComplete).toBe(true);
    expect(t.drift).toBe(0);
  });

  it("refuses a schedule that leaves part of the contract unbilled", () => {
    const t = scheduleTotals([{ pct: 40, amount: 800000 }], contract);
    expect(t.isComplete).toBe(false);
    expect(t.remainingPct).toBe(60);
    expect(t.remainingAmount).toBe(1200000);
  });

  it("refuses a schedule that bills more than the contract", () => {
    const t = scheduleTotals(
      [
        { pct: 70, amount: 1400000 },
        { pct: 50, amount: 1000000 },
      ],
      contract,
    );
    expect(t.isComplete).toBe(false);
    expect(t.remainingPct).toBe(-20);
  });

  it("tolerates a hair of rounding — thirds sum to 99.99, not 100", () => {
    const t = scheduleTotals(
      [
        { pct: 33.33, amount: 333333.33 },
        { pct: 33.33, amount: 333333.33 },
        { pct: 33.34, amount: 333333.34 },
      ],
      1000000,
    );
    expect(t.isComplete).toBe(true);
  });

  it("reports rounding drift rather than absorbing it", () => {
    const t = scheduleTotals(
      [
        { pct: 50, amount: 333333.33 },
        { pct: 50, amount: 333333.33 },
      ],
      666666.67,
    );
    expect(t.drift).toBe(-0.01);
  });
});

describe("actualDueOf — work done is what makes a milestone billable", () => {
  it("has no actual due until the work is ticked", () => {
    expect(actualDueOf(ms({ work_done: false, actual_due: null }))).toBeNull();
  });

  it("ignores an actual due that was set before the work was ticked", () => {
    // 105238's contract 2 row 1: unticked, and the column is simply empty.
    expect(actualDueOf(ms({ work_done: false, actual_due: "2026-02-06" }))).toBeNull();
  });

  it("falls back to the tentative date so a billable milestone never loses its ageing", () => {
    expect(
      actualDueOf(ms({ work_done: true, actual_due: null, tentative_due: "2026-04-04" })),
    ).toBe("2026-04-04");
  });
});

describe("rollupContract", () => {
  it("counts only work-done milestones as billable", () => {
    const r = rollupContract(
      { amount: 2000000 },
      [
        { pct: 40, amount: 800000, work_done: true },
        { pct: 20, amount: 400000, work_done: true },
        { pct: 40, amount: 800000, work_done: false },
      ],
      [{ amount: 1000000 }],
    );
    expect(r.billable).toBe(1200000);
    expect(r.unbilled).toBe(800000);
    expect(r.settled).toBe(1000000);
    expect(r.due).toBe(200000);
    expect(r.billableCount).toBe(2);
  });

  it("shows a negative due when more was collected than billed", () => {
    // 105238's "Contract - 2": Receivables Due reads -1,000, in red.
    const r = rollupContract(
      { amount: 120000 },
      [{ pct: 20, amount: 24000, work_done: false }],
      [{ amount: 1000 }],
    );
    expect(r.billable).toBe(0);
    expect(r.due).toBe(-1000);
  });
});

describe("summarisePlan", () => {
  const contracts: Pick<Contract, "id" | "amount" | "source">[] = [
    { id: "in", amount: 2000000, source: "client" },
    { id: "out", amount: 650000, source: "vendor" },
  ];

  const summary = summarisePlan({
    projectValue: 3612239.29,
    contracts,
    milestonesByContract: new Map([
      ["in", [{ pct: 100, amount: 2000000, work_done: true }]],
      ["out", [{ pct: 100, amount: 469481.23, work_done: true }]],
    ]),
    paymentsByContract: new Map([
      ["in", [{ amount: 1974400 }]],
      ["out", [{ amount: 179535.4 }]],
    ]),
  });

  it("keeps the client side and the vendor side apart", () => {
    expect(summary.funds).toBe(1974400);
    expect(summary.receivableBilled).toBe(2000000);
    expect(summary.receivableDues).toBe(25600);
    expect(summary.billed).toBe(469481.23);
    expect(summary.disbursed).toBe(179535.4);
  });

  // HANDOFF-V8 §10.8, settled 2026-09-04: the receivables twin of §10.1.
  // `Contracted` is the whole client commitment; `Billed` is what has been
  // signed off. Here they happen to agree because the single client milestone
  // covers 100% of the contract and is done — so the test also proves they are
  // read from DIFFERENT sources rather than one being the other's alias.
  it("reports Contracted and Billed as separate client figures", () => {
    expect(summary.contracted).toBe(2000000);
    expect(summary.receivableBilled).toBe(2000000);

    const halfDone = summarisePlan({
      projectValue: 2000000,
      contracts: [{ id: "in", amount: 2000000, source: "client" }],
      milestonesByContract: new Map([
        [
          "in",
          [
            { pct: 40, amount: 800000, work_done: true },
            { pct: 60, amount: 1200000, work_done: false },
          ],
        ],
      ]),
      paymentsByContract: new Map([["in", [{ amount: 300000 }]]]),
    });
    expect(halfDone.contracted).toBe(2000000);
    expect(halfDone.receivableBilled).toBe(800000);
    expect(halfDone.receivableDues).toBe(500000);
    expect(halfDone.contracted).not.toBe(halfDone.receivableBilled);
  });

  // HANDOFF-V8 §10.1, settled 2026-09-04: `Committed` and `Billed` are two
  // real figures that one label used to cover. They must not collapse.
  it("reports Committed and Billed as different figures", () => {
    expect(summary.estimatedExpenses).toBe(650000);
    expect(summary.committed).toBe(650000 - 179535.4);
    expect(summary.billed).toBe(469481.23);
    expect(summary.payableDues).toBe(round2(469481.23 - 179535.4));
    expect(summary.committed).not.toBe(summary.billed);
  });

  it("counts a payment with no contract as money that really moved", () => {
    const loose = summarisePlan({
      projectValue: 1800000,
      contracts: [{ id: "out", amount: 240000, source: "vendor" }],
      milestonesByContract: new Map([
        ["out", [{ pct: 40, amount: 96000, work_done: true }]],
      ]),
      paymentsByContract: new Map(),
      unattachedPayments: [{ direction: "outflow", amount: 50000 }],
    });
    expect(loose.disbursed).toBe(50000);
    expect(loose.committed).toBe(190000);
    expect(loose.payableDues).toBe(46000);
    expect(loose.cashFlow).toBe(-50000);
  });

  it("derives cash flow as what came in less what went out", () => {
    expect(summary.cashFlow).toBe(1794864.6);
  });

  it("derives expected P&L from the project value, not from stored figures", () => {
    expect(summary.expectedPnl).toBe(2962239.29);
  });

  it("reports zeroes rather than NaN for a project with no contracts", () => {
    const empty = summarisePlan({
      projectValue: 0,
      contracts: [],
      milestonesByContract: new Map(),
      paymentsByContract: new Map(),
    });
    expect(empty.cashFlow).toBe(0);
    expect(empty.receivableDues).toBe(0);
  });
});

describe("splitEvenly", () => {
  it("splits without losing paise — the remainder lands on the last row", () => {
    const rows = splitEvenly(1000000, 3);
    expect(rows.reduce((a: number, r) => a + r.amount, 0)).toBe(1000000);
    expect(rows.reduce((a: number, r) => a + r.pct, 0)).toBe(100);
  });

  it("splits a clean contract cleanly", () => {
    expect(splitEvenly(2000000, 4)).toEqual([
      { pct: 25, amount: 500000 },
      { pct: 25, amount: 500000 },
      { pct: 25, amount: 500000 },
      { pct: 25, amount: 500000 },
    ]);
  });

  it("returns nothing for a count of zero", () => {
    expect(splitEvenly(100000, 0)).toEqual([]);
  });
});
