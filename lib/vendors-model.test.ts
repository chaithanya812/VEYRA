import { describe, it, expect } from "vitest";
import {
  VENDOR_CATEGORIES,
  vendorRatingLabel,
} from "./vendors-model";

/**
 * Locks the client-safe vendors model: the curated category seed and the
 * rating label rule — null means "Not rated" (grey), never a fake zero.
 */
describe("vendorRatingLabel", () => {
  it('returns "Not rated" for null (rating is computed later, never faked)', () => {
    expect(vendorRatingLabel(null)).toBe("Not rated");
  });

  it("formats to one decimal + star", () => {
    expect(vendorRatingLabel(4.25)).toBe("4.3 ★");
    expect(vendorRatingLabel(5)).toBe("5.0 ★");
    expect(vendorRatingLabel(0)).toBe("0.0 ★");
  });
});

describe("VENDOR_CATEGORIES", () => {
  it("covers common construction/interior supplier categories", () => {
    expect(VENDOR_CATEGORIES.length).toBeGreaterThan(5);
    expect(VENDOR_CATEGORIES).toContain("Hardware");
    expect(VENDOR_CATEGORIES).toContain("Plywood");
    expect(VENDOR_CATEGORIES).toContain("Electrical");
  });

  it("has no duplicate categories", () => {
    expect(new Set(VENDOR_CATEGORIES).size).toBe(VENDOR_CATEGORIES.length);
  });
});
