import { describe, it, expect } from "vitest";
import {
  MR_STAGES,
  MR_STAGE_META,
  MR_SOURCES,
  isOverdue,
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
