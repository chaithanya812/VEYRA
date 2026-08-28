import { describe, it, expect } from "vitest";
import { DEFAULT_LEAD_STATUSES } from "./lead-management-model";
import {
  conversionAnalysis,
  countTrend,
  funnelStages,
  inRange,
  ownerSplit,
  sourceBreakdown,
  type InsightLead,
} from "./lead-insights-model";

const statuses = DEFAULT_LEAD_STATUSES.map((s, i) => ({ ...s, id: `s${i}` }));

function lead(over: Partial<InsightLead> & { id: string }): InsightLead {
  return {
    created_at: "2026-08-20T10:00:00.000Z",
    status: "new",
    value: 100000,
    source: "walk_in",
    sales_owner_id: null,
    assigned_to: null,
    ...over,
  };
}

const LEADS: InsightLead[] = [
  lead({ id: "1", status: "won", sales_owner_id: "m1", value: 500000 }),
  lead({ id: "2", status: "lost", sales_owner_id: "m1", value: 200000 }),
  lead({ id: "3", status: "junk", value: 0 }),
  lead({ id: "4", status: "contacted", sales_owner_id: "m2" }),
  lead({ id: "5", status: "contacted", source: "referral" }),
];

describe("conversionAnalysis", () => {
  it("separates won, lost and junk", () => {
    const a = conversionAnalysis(LEADS, statuses);
    expect(a).toMatchObject({ received: 5, converted: 1, lost: 1, junk: 1 });
  });

  it("counts a lead with no owner and no assignee as unassigned", () => {
    expect(conversionAnalysis(LEADS, statuses).unassigned).toBe(2);
  });

  it("carries the denominator with the rate, never the rate alone", () => {
    const a = conversionAnalysis(LEADS, statuses);
    expect(a.ratePct).toBe(20);
    expect(a.denominator).toBe(5);
  });

  it("reproduces the frame's 6.12% of 147", () => {
    const many: InsightLead[] = [];
    for (let i = 0; i < 147; i++) {
      many.push(lead({ id: `x${i}`, status: i < 9 ? "won" : "contacted" }));
    }
    const a = conversionAnalysis(many, statuses);
    expect(a.ratePct).toBe(6.12);
    expect(a.denominator).toBe(147);
  });

  it("reports zero rather than dividing by zero on an empty range", () => {
    expect(conversionAnalysis([], statuses).ratePct).toBe(0);
  });
});

describe("countTrend", () => {
  const now = new Date(2026, 7, 28);

  it("emits one point per day, including the days nobody created a lead", () => {
    const t = countTrend([lead({ id: "1", created_at: "2026-08-28T09:00:00Z" })], 7, now);
    expect(t).toHaveLength(7);
    expect(t[0].date).toBe("2026-08-22");
    expect(t[6]).toEqual({ date: "2026-08-28", count: 1 });
    expect(t.filter((p) => p.count === 0)).toHaveLength(6);
  });

  it("ignores leads outside the window", () => {
    const t = countTrend([lead({ id: "1", created_at: "2026-01-01T09:00:00Z" })], 7, now);
    expect(t.every((p) => p.count === 0)).toBe(true);
  });
});

describe("sourceBreakdown", () => {
  it("sorts by count and always shows the share", () => {
    const s = sourceBreakdown(LEADS);
    expect(s[0]).toMatchObject({ key: "walk_in", count: 4, pct: 80 });
    expect(s[1]).toMatchObject({ key: "referral", count: 1, pct: 20 });
  });

  it("gives blank sources a real label instead of an empty slice", () => {
    const s = sourceBreakdown([lead({ id: "1", source: "" })]);
    expect(s[0]).toMatchObject({ key: "__none__", label: "No source", count: 1 });
  });

  it("uses the tenant's label for a slug", () => {
    const s = sourceBreakdown(LEADS, (slug) =>
      slug === "walk_in" ? "Walk-in" : slug,
    );
    expect(s[0].label).toBe("Walk-in");
  });
});

describe("funnelStages", () => {
  it("reads from lead_statuses, not a hardcoded list", () => {
    const custom = [
      { ...statuses[0], value: "sid_demo_done", label: "Sid_DemoDone" },
      statuses[1],
    ];
    const rows = funnelStages([lead({ id: "1", status: "sid_demo_done" })], custom);
    expect(rows[0]).toMatchObject({ status: "sid_demo_done", label: "Sid_DemoDone", count: 1 });
  });

  it("sorts descending by count", () => {
    const rows = funnelStages(LEADS, statuses);
    expect(rows[0]).toMatchObject({ status: "contacted", count: 2 });
  });

  it("sorts by value when measuring value, and shares of value", () => {
    const rows = funnelStages(LEADS, statuses, "value");
    expect(rows[0]).toMatchObject({ status: "won", value: 500000 });
    // 500000 of 900000 total
    expect(rows[0].pct).toBe(55.56);
  });

  it("keeps a live status with no leads, so the ladder stays legible", () => {
    const rows = funnelStages([], statuses);
    expect(rows).toHaveLength(statuses.length);
    expect(rows.every((r) => r.count === 0 && r.pct === 0)).toBe(true);
  });

  it("still counts leads sitting on a retired status", () => {
    // Retiring a status must not silently drop its leads out of the funnel,
    // or the stages stop summing to Received.
    const retired = statuses.map((s) =>
      s.value === "contacted" ? { ...s, is_active: false } : s,
    );
    const rows = funnelStages(LEADS, retired);
    const contacted = rows.find((r) => r.status === "contacted");
    expect(contacted?.count).toBe(2);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(LEADS.length);
  });
});

describe("funnelStages — unmapped statuses", () => {
  it("flags a status that is not in the ladder at all", () => {
    // Real demo data hit this: six leads carried display names from an older
    // ladder ("Design Pitch"), so the funnel appeared to have twice the stages.
    const rows = funnelStages([lead({ id: "1", status: "Design Pitch" })], statuses);
    const stray = rows.find((r) => r.status === "Design Pitch");
    expect(stray).toMatchObject({ count: 1, unmapped: true });
    expect(rows.filter((r) => r.unmapped)).toHaveLength(1);
  });

  it("does not flag a configured status", () => {
    const rows = funnelStages(LEADS, statuses);
    expect(rows.every((r) => !r.unmapped)).toBe(true);
  });
});

describe("ownerSplit", () => {
  const members = [
    { id: "m1", name: "Meghana Rao" },
    { id: "m2", name: "Rahul Verma" },
  ];

  it("puts unassigned first, whatever its count", () => {
    const rows = ownerSplit(LEADS, members);
    expect(rows[0]).toMatchObject({ memberId: null, name: "Unassigned", count: 2 });
  });

  it("orders the rest by count", () => {
    const rows = ownerSplit(LEADS, members);
    expect(rows.slice(1).map((r) => r.name)).toEqual(["Meghana Rao", "Rahul Verma"]);
  });

  it("treats an owner who has left the org as unassigned", () => {
    const rows = ownerSplit([lead({ id: "1", sales_owner_id: "gone" })], members);
    expect(rows).toHaveLength(1);
    expect(rows[0].memberId).toBe(null);
  });

  it("falls back to assigned_to when there is no sales owner", () => {
    const rows = ownerSplit([lead({ id: "1", assigned_to: "m2" })], members);
    expect(rows[0]).toMatchObject({ memberId: "m2", count: 1 });
  });
});

describe("inRange", () => {
  it("returns everything when the range is unbounded", () => {
    expect(inRange(LEADS, { from: null, to: null })).toHaveLength(5);
  });

  it("filters on the creation date", () => {
    const rows = inRange(
      [
        lead({ id: "1", created_at: "2026-08-01T00:00:00Z" }),
        lead({ id: "2", created_at: "2026-09-01T00:00:00Z" }),
      ],
      { from: "2026-08-01", to: "2026-08-31" },
    );
    expect(rows.map((l) => l.id)).toEqual(["1"]);
  });
});
