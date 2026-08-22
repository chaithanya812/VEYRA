import { describe, it, expect } from "vitest";
import { remaining, isOverLimit, USAGE_METRICS } from "./subscription-model";

/**
 * Locks the REQ-04 metering helpers. Usage is lifetime-metered against the
 * append-only ledger, so these pure helpers must be exact: limit reached,
 * unlimited (null limit), and over-limit all behave correctly.
 */
describe("subscription metering helpers (REQ-04)", () => {
  it("returns remaining when under the limit", () => {
    expect(remaining(50, 12)).toBe(38);
  });

  it("returns 0 when the limit is reached exactly", () => {
    expect(remaining(50, 50)).toBe(0);
    expect(isOverLimit(50, 50)).toBe(true);
  });

  it("treats a null limit as unlimited (remaining unknown, never over)", () => {
    expect(remaining(null, 1000)).toBeNull();
    expect(isOverLimit(null, 1000)).toBe(false);
  });

  it("clamps remaining at 0 when over the limit", () => {
    expect(remaining(50, 73)).toBe(0);
  });

  it("reports over-limit when used exceeds the limit", () => {
    expect(isOverLimit(50, 73)).toBe(true);
  });

  it("every metric defaults to unlimited when absent from the plan", () => {
    for (const _m of USAGE_METRICS) {
      expect(remaining(undefined as unknown as number | null, 0)).toBeNull();
    }
  });
});
