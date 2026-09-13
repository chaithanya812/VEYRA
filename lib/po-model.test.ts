import { describe, it, expect } from "vitest";
import {
  ORDER_STATES,
  PAYMENT_STATES,
  PO_TYPES,
  ORDER_STATE_META,
  PAYMENT_STATE_META,
  ACCEPTANCE_STATES,
  ACCEPTANCE_META,
  acceptanceBucketOf,
  lineTotal,
  poAmount,
  deriveOrderState,
} from "./po-model";

/**
 * The money rule (PLAN §8): no LLM produces a number. Rates are user-entered
 * CONFIG; amount is the pure SUM of line totals. These tests lock the pure
 * arithmetic and every branch of the derived fulfilment state.
 */
describe("lineTotal", () => {
  it("multiplies qty × unit_rate", () => {
    expect(lineTotal(10, 250)).toBe(2500);
    expect(lineTotal(0, 999)).toBe(0);
    expect(lineTotal(3, 0)).toBe(0);
  });

  it("handles fractional quantities without float drift", () => {
    // lineTotal rounds to paise (2dp) by design — 499.975 rounds to 499.98.
    expect(lineTotal(2.5, 199.99)).toBe(499.98);
    expect(lineTotal(0.1, 0.3)).toBeCloseTo(0.03, 10);
  });

  it("treats missing/garbage input as zero instead of NaN", () => {
    expect(lineTotal(Number.NaN, 5)).toBe(0);
    expect(lineTotal(4, Number.NaN)).toBe(0);
  });
});

describe("poAmount", () => {
  it("is the pure SUM of line totals", () => {
    const lines = [
      { qty: 10, unit_rate: 250 }, // 2500
      { qty: 4, unit_rate: 120 }, // 480
      { qty: 1.5, unit_rate: 80 }, // 120
    ];
    expect(poAmount(lines)).toBeCloseTo(3100, 6);
  });

  it("returns 0 for an empty grid", () => {
    expect(poAmount([])).toBe(0);
  });

  it("ignores extra fields on the line objects", () => {
    expect(
      poAmount([{ qty: 2, unit_rate: 50, tax_pct: 18 } as { qty: number; unit_rate: number; tax_pct?: number }]),
    ).toBe(100);
  });
});

describe("deriveOrderState (all branches)", () => {
  it("created when nothing has been received", () => {
    expect(deriveOrderState(100, 0)).toBe("created");
  });

  it("partially_delivered when some (but not all) goods arrived", () => {
    expect(deriveOrderState(100, 1)).toBe("partially_delivered");
    expect(deriveOrderState(100, 99)).toBe("partially_delivered");
  });

  it("delivered when received meets or exceeds ordered", () => {
    expect(deriveOrderState(100, 100)).toBe("delivered");
    expect(deriveOrderState(100, 130)).toBe("delivered"); // over-receipt still closes
  });

  it("delivered when ordered is 0 but something arrived (edge)", () => {
    expect(deriveOrderState(0, 5)).toBe("delivered");
  });

  it("created when received is negative garbage", () => {
    expect(deriveOrderState(50, -3)).toBe("created");
  });
});

/** Red must never decorate routine status; chips are green/amber/grey + one red. */
describe("PO state model (design guardrails)", () => {
  it("order/payment/type enums match the spec", () => {
    expect([...ORDER_STATES]).toEqual([
      "draft",
      "created",
      "partially_delivered",
      "delivered",
      "cancelled",
    ]);
    expect([...PAYMENT_STATES]).toEqual(["not_initiated", "partial", "paid"]);
    expect([...PO_TYPES]).toEqual(["purchase_order", "work_order"]);
  });

  it("every state has a label + tone", () => {
    for (const s of ORDER_STATES) {
      const meta = ORDER_STATE_META[s];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(["neutral", "active", "positive", "red"]).toContain(meta.tone);
    }
    for (const s of PAYMENT_STATES) {
      const meta = PAYMENT_STATE_META[s];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(["neutral", "active", "positive", "red"]).toContain(meta.tone);
    }
  });

  it("cancelled is the ONLY red order state; payment never goes red", () => {
    const reds = ORDER_STATES.filter((s) => ORDER_STATE_META[s].tone === "red");
    expect(reds).toEqual(["cancelled"]);
    for (const s of PAYMENT_STATES) {
      expect(PAYMENT_STATE_META[s].tone).not.toBe("red");
    }
  });

  it("'Not initiated' payment is grey, not red (it isn't an alarm)", () => {
    expect(PAYMENT_STATE_META.not_initiated.tone).toBe("neutral");
  });
});

/**
 * The acceptance lens (RULE 14): a SECOND vocabulary over the SAME order_state,
 * used only by the delivery-acceptance queue. It must cover every order state,
 * never paint a chip red, and bucket states the way the queue's filters expect.
 */
describe("ACCEPTANCE_META (delivery-acceptance queue lens)", () => {
  it("covers every ORDER_STATES value", () => {
    for (const s of ORDER_STATES) {
      expect(ACCEPTANCE_META[s]).toBeDefined();
      expect(ACCEPTANCE_META[s].label.length).toBeGreaterThan(0);
    }
  });

  it("maps each state to the queue's label", () => {
    expect(ACCEPTANCE_META.draft.label).toBe("Pending");
    expect(ACCEPTANCE_META.created.label).toBe("Pending");
    expect(ACCEPTANCE_META.partially_delivered.label).toBe("Partial");
    expect(ACCEPTANCE_META.delivered.label).toBe("Accepted");
    expect(ACCEPTANCE_META.cancelled.label).toBe("Cancelled");
  });

  it("NEVER paints an acceptance chip red — only grey/amber/green", () => {
    for (const s of ORDER_STATES) {
      expect(["neutral", "active", "positive"]).toContain(ACCEPTANCE_META[s].tone);
      expect(ACCEPTANCE_META[s].tone).not.toBe("red");
    }
  });

  it("tones the queue the way the desk reads it (created grey, partial amber, delivered green)", () => {
    expect(ACCEPTANCE_META.created.tone).toBe("neutral");
    expect(ACCEPTANCE_META.partially_delivered.tone).toBe("active");
    expect(ACCEPTANCE_META.delivered.tone).toBe("positive");
    expect(ACCEPTANCE_META.cancelled.tone).toBe("neutral");
  });
});

describe("acceptanceBucketOf (filter chips)", () => {
  it("buckets draft and created as pending", () => {
    expect(acceptanceBucketOf("draft")).toBe("pending");
    expect(acceptanceBucketOf("created")).toBe("pending");
  });

  it("buckets partial and delivered into their own chips", () => {
    expect(acceptanceBucketOf("partially_delivered")).toBe("partial");
    expect(acceptanceBucketOf("delivered")).toBe("accepted");
  });

  it("gives cancelled and unknown states NO bucket (they match no filter)", () => {
    expect(acceptanceBucketOf("cancelled")).toBeNull();
    expect(acceptanceBucketOf("nonsense")).toBeNull();
  });

  it("every non-null bucket is one of ACCEPTANCE_STATES", () => {
    for (const s of ORDER_STATES) {
      const bucket = acceptanceBucketOf(s);
      if (bucket !== null) {
        expect([...ACCEPTANCE_STATES]).toContain(bucket);
      }
    }
  });
});
