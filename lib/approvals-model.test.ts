import { describe, it, expect } from "vitest";
import {
  needsApproval,
  APPROVAL_MODULES,
  APPROVAL_STATUSES,
  STATUS_META,
} from "./approvals-model";

/**
 * Locks the generic approval engine's one decision — needsApproval. The
 * threshold is user config; the logic is pure arithmetic: an ACTIVE rule
 * approves-at-or-above (inclusive), no rule or inactive rule never blocks.
 */
describe("needsApproval", () => {
  it("returns false when there is no rule", () => {
    expect(needsApproval(1000, null)).toBe(false);
    expect(needsApproval(1000, undefined)).toBe(false);
  });

  it("returns false when the rule is inactive", () => {
    expect(
      needsApproval(100_000, { threshold_amount: 5000, is_active: false }),
    ).toBe(false);
  });

  it("returns false below the threshold", () => {
    expect(
      needsApproval(4999.99, { threshold_amount: 5000, is_active: true }),
    ).toBe(false);
  });

  it("is inclusive at the threshold", () => {
    expect(
      needsApproval(5000, { threshold_amount: 5000, is_active: true }),
    ).toBe(true);
  });

  it("returns true above the threshold", () => {
    expect(
      needsApproval(75_000, { threshold_amount: 5000, is_active: true }),
    ).toBe(true);
  });

  it("with threshold 0 every non-negative amount needs approval", () => {
    expect(needsApproval(0, { threshold_amount: 0, is_active: true })).toBe(
      true,
    );
    expect(needsApproval(1, { threshold_amount: 0, is_active: true })).toBe(
      true,
    );
  });
});

describe("approvals model invariants", () => {
  it("every status has chip metadata with a reserved colour job", () => {
    for (const s of APPROVAL_STATUSES) {
      const meta = STATUS_META[s];
      expect(meta.label.length).toBeGreaterThan(0);
      if (s === "pending") expect(meta.tone).toBe("amber");
      if (s === "approved") expect(meta.tone).toBe("green");
      if (s === "rejected") expect(meta.tone).toBe("red"); // red RESERVED
    }
  });

  it("exposes the four engine modules with labels", () => {
    expect(APPROVAL_MODULES).toEqual([
      "procurement",
      "quotations",
      "finance",
      "other",
    ]);
  });
});
