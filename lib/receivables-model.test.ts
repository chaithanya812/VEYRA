import { describe, expect, it } from "vitest";
import {
  allocateReceipts,
  BUCKET_META,
  bucketOf,
  describeReceivablesFilter,
  dueDateOf,
  dueKindOf,
  filterReceivables,
  parseBucket,
  receivableRows,
  RECEIVABLE_BUCKETS,
  summariseReceivables,
  TILE_BUCKETS,
  todayIso,
  validateWriteOff,
  type ReceivableContract,
  type ReceivableMilestone,
  type ReceivableProject,
  type ReceivableReceipt,
} from "./receivables-model";
import { rollupContract, summarisePlan } from "./finance-model";

/**
 * Account Receivables — the demo tenant's real numbers, used as the fixture on
 * purpose so a failure here is a failure a human can see on the screen.
 *
 * Malviya Nagar 3BHK: a ₹18,00,000 client contract, four milestones, three of
 * them signed off (₹12,60,000), ₹5,60,000 received across two receipts that
 * name no milestone. Dues ₹7,00,000. HANDOFF-V8 §10.8.
 */

const TODAY = "2026-09-04";

const project: ReceivableProject = {
  id: "p1",
  name: "Malviya Nagar 3BHK",
  clientName: "Ritu Malhotra",
  salesOwner: null,
  stage: "execution",
};

const contract: ReceivableContract = {
  id: "c1",
  project_id: "p1",
  name: "Malviya Nagar 3BHK — Client Agreement",
  amount: 1800000,
};

function ms(over: Partial<ReceivableMilestone> & { id: string; seq: number }): ReceivableMilestone {
  return {
    contract_id: "c1",
    name: "Milestone",
    pct: 0,
    amount: 0,
    tentative_due: null,
    work_done: false,
    actual_due: null,
    ...over,
  };
}

const MILESTONES: ReceivableMilestone[] = [
  ms({ id: "m1", seq: 1, name: "Advance (booking)", pct: 20, amount: 360000, tentative_due: "2026-07-20", work_done: true, actual_due: "2026-07-20" }),
  ms({ id: "m2", seq: 2, name: "Design freeze", pct: 20, amount: 360000, tentative_due: "2026-08-14", work_done: true, actual_due: "2026-08-16" }),
  ms({ id: "m3", seq: 3, name: "Production & carcass", pct: 30, amount: 540000, tentative_due: "2026-09-03", work_done: true, actual_due: null }),
  ms({ id: "m4", seq: 4, name: "Handover", pct: 30, amount: 540000, tentative_due: "2026-09-28", work_done: false, actual_due: null }),
];

function receipt(over: Partial<ReceivableReceipt> & { id: string; amount: number }): ReceivableReceipt {
  return {
    contract_id: "c1",
    milestone_id: null,
    direction: "inflow",
    paid_on: "2026-07-20",
    created_at: "2026-07-20T00:00:00.000Z",
    reversal_of: null,
    ...over,
  };
}

const RECEIPTS: ReceivableReceipt[] = [
  receipt({ id: "r1", amount: 360000, paid_on: "2026-07-20" }),
  receipt({ id: "r2", amount: 200000, paid_on: "2026-08-17", created_at: "2026-08-17T00:00:00.000Z" }),
];

function build(over?: {
  milestones?: ReceivableMilestone[];
  receipts?: ReceivableReceipt[];
  today?: string;
}) {
  const milestones = over?.milestones ?? MILESTONES;
  return receivableRows({
    projects: [project],
    contracts: [contract],
    milestonesByContract: new Map([["c1", milestones]]),
    receipts: over?.receipts ?? RECEIPTS,
    today: over?.today ?? TODAY,
  });
}

describe("allocateReceipts", () => {
  it("applies a receipt that names a milestone to exactly that milestone", () => {
    const { byMilestone, unallocated } = allocateReceipts(MILESTONES, [
      receipt({ id: "r9", amount: 540000, milestone_id: "m3" }),
    ]);
    expect(byMilestone.get("m3")).toBe(540000);
    expect(byMilestone.get("m1")).toBe(0);
    expect(unallocated).toBe(0);
  });

  it("applies unnamed receipts oldest milestone first", () => {
    const { byMilestone, unallocated } = allocateReceipts(MILESTONES, RECEIPTS);
    expect(byMilestone.get("m1")).toBe(360000);
    expect(byMilestone.get("m2")).toBe(200000);
    expect(byMilestone.get("m3")).toBe(0);
    expect(byMilestone.get("m4")).toBe(0);
    expect(unallocated).toBe(0);
  });

  it("never fills a milestone past its own value, and reports the surplus", () => {
    const { byMilestone, unallocated } = allocateReceipts(
      [MILESTONES[0]],
      [receipt({ id: "r9", amount: 400000 })],
    );
    expect(byMilestone.get("m1")).toBe(360000);
    expect(unallocated).toBe(40000);
  });

  it("leaves a named over-payment alone rather than clawing it back", () => {
    const { byMilestone } = allocateReceipts(
      [MILESTONES[0], MILESTONES[1]],
      [receipt({ id: "r9", amount: 400000, milestone_id: "m1" })],
    );
    expect(byMilestone.get("m1")).toBe(400000);
    expect(byMilestone.get("m2")).toBe(0);
  });
});

describe("dueDateOf / dueKindOf", () => {
  it("shows the actual due date once the work is signed off", () => {
    expect(dueDateOf(MILESTONES[1])).toBe("2026-08-16");
    expect(dueKindOf(MILESTONES[1])).toBe("actual");
  });

  it("falls back to the tentative date when nobody recorded a real one", () => {
    expect(dueDateOf(MILESTONES[2])).toBe("2026-09-03");
    expect(dueKindOf(MILESTONES[2])).toBe("tentative");
  });

  it("an unsigned milestone shows the date it was planned for", () => {
    expect(dueDateOf(MILESTONES[3])).toBe("2026-09-28");
    expect(dueKindOf(MILESTONES[3])).toBe("tentative");
  });

  it("says so when there is no date at all", () => {
    expect(dueKindOf(ms({ id: "x", seq: 9 }))).toBe("none");
  });
});

describe("bucketOf — Overdue Payment and Milestone Overdue are different questions", () => {
  it("signed off, due date passed, money outstanding is an OVERDUE PAYMENT", () => {
    expect(bucketOf(MILESTONES[2], 540000, TODAY)).toBe("overdue_payment");
  });

  it("NOT signed off with a date in the past is a MILESTONE OVERDUE", () => {
    const slipped = ms({ id: "s", seq: 5, amount: 100, tentative_due: "2026-08-01", work_done: false });
    expect(bucketOf(slipped, 100, TODAY)).toBe("milestone_overdue");
  });

  it("work_done is the only thing separating them — the same date, two answers", () => {
    const done = ms({ id: "d", seq: 7, amount: 100, tentative_due: "2026-08-01", work_done: true });
    const notDone = ms({ id: "n", seq: 8, amount: 100, tentative_due: "2026-08-01", work_done: false });
    expect(bucketOf(done, 100, TODAY)).toBe("overdue_payment");
    expect(bucketOf(notDone, 100, TODAY)).toBe("milestone_overdue");
  });

  it("a future date is upcoming whether or not the work is done", () => {
    expect(bucketOf(MILESTONES[3], 540000, TODAY)).toBe("upcoming");
    const early = ms({ id: "e", seq: 6, amount: 100, tentative_due: "2026-12-01", work_done: true, actual_due: "2026-12-01" });
    expect(bucketOf(early, 100, TODAY)).toBe("upcoming");
  });

  it("a fully received milestone is settled, not overdue", () => {
    expect(bucketOf(MILESTONES[0], 0, TODAY)).toBe("settled");
  });

  it("a written-off milestone leaves every other bucket", () => {
    const off = { ...MILESTONES[2], written_off_at: "2026-09-04T05:00:00.000Z", write_off_reason: "Client dispute" };
    expect(bucketOf(off, 540000, TODAY)).toBe("written_off");
  });

  it("every bucket has a label and a note that says what it counts", () => {
    for (const b of RECEIVABLE_BUCKETS) {
      expect(BUCKET_META[b].label.length).toBeGreaterThan(3);
      expect(BUCKET_META[b].note.length).toBeGreaterThan(20);
    }
  });
});

describe("receivableRows", () => {
  it("reads one row per client milestone, oldest money first", () => {
    const rows = build();
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.milestoneName)).toEqual([
      "Advance (booking)",
      "Design freeze",
      "Production & carcass",
      "Handover",
    ]);
  });

  it("labels a milestone the way the frame does", () => {
    expect(build()[0].milestoneLabel).toBe("Advance (booking) (20%)");
  });

  it("splits the ₹5,60,000 received across the schedule and leaves the rest pending", () => {
    const rows = build();
    expect(rows.map((r) => r.received)).toEqual([360000, 200000, 0, 0]);
    expect(rows.map((r) => r.pending)).toEqual([0, 160000, 540000, 540000]);
  });

  it("names the sales owner as unassigned rather than printing a blank", () => {
    expect(build()[0].salesOwner).toBe("(Not assigned)");
  });

  it("skips a contract whose project cannot be named", () => {
    const rows = receivableRows({
      projects: [],
      contracts: [contract],
      milestonesByContract: new Map([["c1", MILESTONES]]),
      receipts: RECEIPTS,
      today: TODAY,
    });
    expect(rows).toHaveLength(0);
  });

  it("excludes BOTH halves of a reversed receipt (HARD RULE 4)", () => {
    const withReversal = [
      ...RECEIPTS,
      receipt({ id: "r3", amount: 100000, paid_on: "2026-08-20", created_at: "2026-08-20T00:00:00.000Z" }),
      receipt({ id: "r4", amount: -100000, reversal_of: "r3", paid_on: "2026-08-21", created_at: "2026-08-21T00:00:00.000Z" }),
    ];
    const rows = build({ receipts: withReversal });
    const received = rows.reduce((a, r) => a + r.received, 0);
    expect(received).toBe(560000);
  });

  it("ignores an outflow — a payable is not a receivable", () => {
    const rows = build({
      receipts: [...RECEIPTS, receipt({ id: "out", amount: 50000, direction: "outflow" })],
    });
    expect(rows.reduce((a, r) => a + r.received, 0)).toBe(560000);
  });
});

describe("summariseReceivables — the settled vocabulary (§10.8)", () => {
  it("Contracted is the whole client commitment, Billed is what is signed off", () => {
    const rows = build();
    const s = summariseReceivables(rows, [contract]);
    expect(s.contracted).toBe(1800000);
    expect(s.billed).toBe(1260000);
    expect(s.received).toBe(560000);
    expect(s.dues).toBe(700000);
  });

  it("agrees with rollupContract, which the project screens use", () => {
    const roll = rollupContract(
      { amount: 1800000 },
      MILESTONES,
      RECEIPTS.map((r) => ({ amount: r.amount })),
    );
    const s = summariseReceivables(build(), [contract]);
    expect(s.billed).toBe(roll.billable);
    expect(s.dues).toBe(roll.due);
  });

  it("agrees with summarisePlan, which the Payments Dashboard uses", () => {
    const plan = summarisePlan({
      projectValue: 1800000,
      contracts: [{ id: "c1", amount: 1800000, source: "client" }],
      milestonesByContract: new Map([["c1", MILESTONES]]),
      paymentsByContract: new Map([["c1", RECEIPTS.map((r) => ({ amount: r.amount }))]]),
    });
    const s = summariseReceivables(build(), [contract]);
    expect(plan.contracted).toBe(s.contracted);
    expect(plan.receivableBilled).toBe(s.billed);
    expect(plan.receivableDues).toBe(s.dues);
  });

  it("the four tiles partition every milestone", () => {
    const rows = build();
    const s = summariseReceivables(rows, [contract]);
    const counted = s.tiles.reduce((a, t) => a + t.count, 0);
    const settled = rows.filter((r) => r.bucket === "settled").length;
    expect(counted + settled).toBe(rows.length);
    expect(s.tiles.map((t) => t.bucket)).toEqual([...TILE_BUCKETS]);
  });

  it("the tiles read the demo tenant's real position", () => {
    const s = summariseReceivables(build(), [contract]);
    const by = Object.fromEntries(s.tiles.map((t) => [t.bucket, t]));
    expect(by.overdue_payment.count).toBe(2);
    expect(by.overdue_payment.amount).toBe(700000);
    expect(by.milestone_overdue.count).toBe(0);
    expect(by.upcoming.count).toBe(1);
    expect(by.upcoming.amount).toBe(540000);
    expect(by.written_off.count).toBe(0);
  });

  it("Σ of the tiles plus what is settled is Contracted − Received", () => {
    const s = summariseReceivables(build(), [contract]);
    const tiled = s.tiles.reduce((a, t) => a + t.amount, 0);
    expect(tiled).toBe(s.contracted - s.received);
  });

  it("prints schedule drift rather than reconciling it quietly", () => {
    const short = [MILESTONES[0], MILESTONES[1]];
    const s = summariseReceivables(
      build({ milestones: short, receipts: [] }),
      [contract],
    );
    expect(s.scheduled).toBe(720000);
    expect(s.scheduleDrift).toBe(-1080000);
  });

  it("a write-off leaves Billed and shows up as its own tile", () => {
    const off = MILESTONES.map((m) =>
      m.id === "m3"
        ? { ...m, written_off_at: "2026-09-04T05:00:00.000Z", write_off_reason: "Client dispute settled at 0" }
        : m,
    );
    const s = summariseReceivables(build({ milestones: off }), [contract]);
    expect(s.billed).toBe(720000);
    expect(s.dues).toBe(160000);
    const tile = s.tiles.find((t) => t.bucket === "written_off")!;
    expect(tile.count).toBe(1);
    expect(tile.amount).toBe(540000);
  });

  it("counts the projects and milestones a figure was built from", () => {
    const s = summariseReceivables(build(), [contract]);
    expect(s.projectCount).toBe(1);
    expect(s.milestoneCount).toBe(4);
  });

  it("is empty-safe", () => {
    const s = summariseReceivables([], []);
    expect(s.contracted).toBe(0);
    expect(s.dues).toBe(0);
    expect(s.tiles).toHaveLength(4);
  });
});

describe("filterReceivables", () => {
  it("narrows to one tile", () => {
    const rows = build();
    expect(filterReceivables(rows, { bucket: "overdue_payment" })).toHaveLength(2);
    expect(filterReceivables(rows, { bucket: "upcoming" })).toHaveLength(1);
  });

  it("searches project, client, owner and milestone", () => {
    const rows = build();
    expect(filterReceivables(rows, { q: "malviya" })).toHaveLength(4);
    expect(filterReceivables(rows, { q: "handover" })).toHaveLength(1);
    expect(filterReceivables(rows, { q: "ritu" })).toHaveLength(4);
    expect(filterReceivables(rows, { q: "nothing at all" })).toHaveLength(0);
  });

  it("the band moves with the filter it is shown above", () => {
    const rows = build();
    const only = filterReceivables(rows, { bucket: "upcoming" });
    const s = summariseReceivables(only, [contract]);
    expect(s.milestoneCount).toBe(1);
    expect(s.billed).toBe(0);
  });

  it("describes what is applied, and says nothing when nothing is", () => {
    expect(describeReceivablesFilter()).toBeNull();
    expect(describeReceivablesFilter({ bucket: "written_off" })).toBe("Written Off Payments");
    expect(describeReceivablesFilter({ bucket: "upcoming", q: "kitchen" })).toBe(
      "Upcoming Milestone · Search: kitchen",
    );
  });

  it("only accepts a bucket it knows", () => {
    expect(parseBucket("overdue_payment")).toBe("overdue_payment");
    expect(parseBucket("everything")).toBeNull();
    expect(parseBucket(null)).toBeNull();
  });
});

describe("validateWriteOff", () => {
  it("insists on a reason — a write-off is a decision somebody explains", () => {
    const r = validateWriteOff({ milestoneId: "m1", reason: "  " });
    expect(r.ok).toBe(false);
  });

  it("insists on a milestone", () => {
    expect(validateWriteOff({ milestoneId: "", reason: "Client dispute" }).ok).toBe(false);
  });

  it("accepts a real decision and trims it", () => {
    const r = validateWriteOff({ milestoneId: " m1 ", reason: "  Client dispute settled at 0  " });
    expect(r).toEqual({ ok: true, milestoneId: "m1", reason: "Client dispute settled at 0" });
  });

  it("refuses an essay", () => {
    expect(validateWriteOff({ milestoneId: "m1", reason: "x".repeat(501) }).ok).toBe(false);
  });
});

describe("todayIso", () => {
  it("formats the local day, never through a UTC shift", () => {
    expect(todayIso(new Date(2026, 8, 4, 1, 30))).toBe("2026-09-04");
    expect(todayIso(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
  });
});
