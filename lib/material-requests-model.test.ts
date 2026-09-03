import { describe, it, expect } from "vitest";
import {
  MR_ITEM_STAGES,
  MR_ITEM_STAGE_META,
  MR_STAGES,
  MR_STAGE_META,
  MR_SOURCES,
  isOverdue,
  nextItemStages,
  procurementTotals,
  requestProgress,
  stageBreakdown,
} from "./material-requests-model";

/**
 * The overdue alert is the ONLY red status use on the Material Requests
 * screen (red is reserved — DESIGN-DIRECTION §2), so its edges are locked:
 * date-granularity (delivery day itself is not late), and it self-clears
 * once the request is ordered or cancelled.
 */
describe("isOverdue (the one true-alert red)", () => {
  const today = () => {
    const n = new Date();
    const p = (v: number) => String(v).padStart(2, "0");
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  };

  it("false when there is no expected delivery", () => {
    expect(isOverdue(null, "requested")).toBe(false);
    expect(isOverdue("", "requested")).toBe(false);
  });

  it("false when the delivery day is today or in the future", () => {
    expect(isOverdue(today(), "requested")).toBe(false);
    expect(isOverdue("2999-01-01", "requested")).toBe(false);
  });

  it("true only once the whole delivery day has passed", () => {
    expect(isOverdue("2000-01-01", "requested")).toBe(true);
    expect(isOverdue("2000-01-01", "rfq_raised")).toBe(true);
  });

  it("self-clears at ordered / cancelled regardless of the date", () => {
    expect(isOverdue("2000-01-01", "ordered")).toBe(false);
    expect(isOverdue("2000-01-01", "cancelled")).toBe(false);
  });

  it("ignores garbage dates instead of crashing", () => {
    expect(isOverdue("not-a-date", "requested")).toBe(false);
  });
});

/** Red must never decorate a stage; chips are green/amber/grey only. */
describe("MR stage model (design guardrails)", () => {
  it("cycles draft → requested → rfq_raised → order_requested → ordered (+ cancelled)", () => {
    expect([...MR_STAGES]).toEqual([
      "draft",
      "requested",
      "rfq_raised",
      "order_requested",
      "ordered",
      "cancelled",
    ]);
  });

  it("every stage has a label + a non-red tone", () => {
    for (const s of MR_STAGES) {
      const meta = MR_STAGE_META[s];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(["neutral", "active", "positive", "muted"]).toContain(meta.tone);
      expect(meta.tone).not.toBe("red");
    }
  });

  it("ordered is the positive end of the funnel; draft parks muted", () => {
    expect(MR_STAGE_META.ordered.tone).toBe("positive");
    expect(MR_STAGE_META.draft.tone).toBe("muted");
  });

  it("sources are manual / from_quotation / ai_parsed", () => {
    expect([...MR_SOURCES]).toEqual(["manual", "from_quotation", "ai_parsed"]);
  });
});

/* ── Per-line stages (PLAN-V4 §9.7, frame `105729`) ───────────────────────── */

describe("stageBreakdown", () => {
  const line = (stage: string) => ({ stage });

  it("reproduces the frame's cell: a request has FOUR stages at once", () => {
    // DZY-REQ-164 — Order Requested (3) · Ordered (6) · Pending (3) · In Stock (1)
    const items = [
      ...Array(3).fill(line("order_requested")),
      ...Array(6).fill(line("ordered")),
      ...Array(3).fill(line("pending")),
      line("in_stock"),
    ];
    const out = stageBreakdown(items);
    expect(out.map((s) => [s.label, s.count])).toEqual([
      ["Pending", 3],
      ["Order requested", 3],
      ["Ordered", 6],
      ["In stock", 1],
    ]);
    // The parts add back to the whole, which is the point of the model.
    expect(out.reduce((n, s) => n + s.count, 0)).toBe(13);
  });

  it("orders by lifecycle, not by count, so a cell does not reshuffle itself", () => {
    const out = stageBreakdown([line("ordered"), line("ordered"), line("pending")]);
    expect(out.map((s) => s.stage)).toEqual(["pending", "ordered"]);
  });

  it("drops empty stages — the frame never prints Cancelled (0)", () => {
    expect(stageBreakdown([line("pending")]).map((s) => s.stage)).toEqual(["pending"]);
    expect(stageBreakdown([])).toEqual([]);
  });

  it("counts an unrecognised stage as pending rather than losing the item", () => {
    const out = stageBreakdown([line("nonsense"), line("pending")]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
  });

  it("never tones a stage red — a waiting line is not an alarm", () => {
    for (const s of MR_ITEM_STAGES) {
      expect(["neutral", "active", "positive", "muted"]).toContain(
        MR_ITEM_STAGE_META[s].tone,
      );
    }
  });
});

describe("requestProgress", () => {
  const line = (stage: string) => ({ stage });

  it("is not started while every line is pending", () => {
    expect(requestProgress([line("pending"), line("pending")])).toBe("not_started");
  });

  it("is in progress the moment one line moves", () => {
    expect(requestProgress([line("pending"), line("ordered")])).toBe("in_progress");
  });

  it("is complete only when every line has landed or been cancelled", () => {
    expect(requestProgress([line("in_stock"), line("cancelled")])).toBe("complete");
    expect(requestProgress([line("in_stock"), line("ordered")])).toBe("in_progress");
  });

  it("distinguishes a request with no items from one not started", () => {
    expect(requestProgress([])).toBe("empty");
  });
});

describe("procurementTotals", () => {
  const line = (stage: string) => ({ stage });
  const today = new Date(2026, 5, 27); // 27 Jun 2026

  it("splits total items across stages that add back to the total", () => {
    const t = procurementTotals(
      [
        { expected_delivery: "2026-06-30", items: [...Array(39).fill(line("pending"))] },
        { expected_delivery: "2026-06-30", items: [...Array(11).fill(line("rfq_raised"))] },
        { expected_delivery: "2026-06-30", items: [...Array(127).fill(line("ordered"))] },
      ],
      7,
      today,
    );
    // The frame's tile: Total items (177) = 39 + 11 + 127.
    expect(t.items).toBe(177);
    expect(t.byStage.reduce((n, s) => n + s.count, 0)).toBe(177);
    expect(t.byStage.map((s) => [s.label, s.count])).toEqual([
      ["Pending", 39],
      ["RFQ raised", 11],
      ["Ordered", 127],
    ]);
  });

  it("counts in-progress requests, not in-progress items", () => {
    const t = procurementTotals(
      [
        { items: [line("pending"), line("ordered")] },
        { items: [line("pending"), line("pending")] },
        { items: [line("in_stock")] },
      ],
      7,
      today,
    );
    expect(t.requests).toBe(3);
    expect(t.inProgress).toBe(1);
  });

  it("separates an imminent delivery from a late one — only one is an alarm", () => {
    const t = procurementTotals(
      [
        { expected_delivery: "2026-06-30", items: [line("pending")] },  // in 3 days
        { expected_delivery: "2026-06-20", items: [line("pending")] },  // a week late
        { expected_delivery: "2026-09-01", items: [line("pending")] },  // far off
      ],
      7,
      today,
    );
    expect(t.dueSoon).toBe(1);
    expect(t.overdue).toBe(1);
  });

  it("stops chasing a request whose lines have all landed", () => {
    const t = procurementTotals(
      [{ expected_delivery: "2026-06-20", items: [line("in_stock")] }],
      7,
      today,
    );
    expect(t.overdue).toBe(0);
    expect(t.dueSoon).toBe(0);
  });

  it("is all zeroes for no requests", () => {
    const t = procurementTotals([], 7, today);
    expect(t).toEqual({
      requests: 0, inProgress: 0, dueSoon: 0, overdue: 0, items: 0, byStage: [],
    });
  });
});

describe("nextItemStages", () => {
  it("moves forward only, because un-ordering is a conversation not a dropdown", () => {
    expect(nextItemStages("pending")).toEqual([
      "rfq_raised", "order_requested", "ordered", "in_stock", "cancelled",
    ]);
    expect(nextItemStages("ordered")).toEqual(["in_stock", "cancelled"]);
    expect(nextItemStages("in_stock")).toEqual(["cancelled"]);
  });

  it("lets a cancelled line be reopened, and only to the start", () => {
    expect(nextItemStages("cancelled")).toEqual(["pending"]);
  });
});
