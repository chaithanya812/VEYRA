import { describe, it, expect } from "vitest";
import { parseAiBoq, aiBoqLineCount, type AiBoq } from "./ai-boq-model";

describe("ai-boq-model — parseAiBoq (AI never prices; validator sanitizes)", () => {
  it("parses a valid rooms/lines structure", () => {
    const r = parseAiBoq({
      rooms: [
        { name: "Kitchen", lines: [{ title: "Base unit", category: "Modular", description: "d", qty: 12, uom: "sqft" }] },
      ],
    });
    expect("boq" in r).toBe(true);
    if ("boq" in r) {
      expect(r.boq.rooms[0].name).toBe("Kitchen");
      expect(r.boq.rooms[0].lines[0].qty).toBe(12);
      expect(r.boq.rooms[0].lines[0].uom).toBe("sqft");
      expect(aiBoqLineCount(r.boq)).toBe(1);
    }
  });

  it("DROPS any price/rate/amount field the model emits", () => {
    const r = parseAiBoq({
      rooms: [{ name: "Bedroom", lines: [{ title: "Wardrobe", qty: 56, uom: "sqft", unit_price: 1800, rate: 1800, amount: 100800 }] }],
    });
    expect("boq" in r).toBe(true);
    if ("boq" in r) {
      const line = r.boq.rooms[0].lines[0] as Record<string, unknown>;
      expect(line.unit_price).toBeUndefined();
      expect(line.rate).toBeUndefined();
      expect(line.amount).toBeUndefined();
      expect(Object.keys(line).sort()).toEqual(["category", "description", "qty", "title", "uom"]);
    }
  });

  it("normalises an unknown uom to 'nos' and a bad qty to 0", () => {
    const r = parseAiBoq({ rooms: [{ name: "X", lines: [{ title: "T", qty: "abc", uom: "furlongs" }] }] });
    expect("boq" in r).toBe(true);
    if ("boq" in r) {
      expect(r.boq.rooms[0].lines[0].uom).toBe("nos");
      expect(r.boq.rooms[0].lines[0].qty).toBe(0);
    }
  });

  it("drops title-less lines and empty rooms", () => {
    const r = parseAiBoq({ rooms: [{ name: "A", lines: [{ qty: 3, uom: "nos" }] }, { name: "B", lines: [{ title: "keep", qty: 1, uom: "nos" }] }] });
    expect("boq" in r).toBe(true);
    if ("boq" in r) {
      expect(r.boq.rooms).toHaveLength(1);
      expect(r.boq.rooms[0].name).toBe("B");
    }
  });

  it("rejects unusable input", () => {
    expect("error" in parseAiBoq(null)).toBe(true);
    expect("error" in parseAiBoq({})).toBe(true);
    expect("error" in parseAiBoq({ rooms: [] })).toBe(true);
    expect("error" in parseAiBoq({ rooms: [{ name: "x", lines: [] }] })).toBe(true);
  });
});
