import { describe, it, expect } from "vitest";
import {
  bidSubmittedBy,
  isBidDeadlinePassed,
  nextBidVersion,
} from "./rfq-model";

/**
 * Locks the vendor-portal contract that sits on top of the existing bid
 * engine (U4): version bump on re-submit, entry_mode/submitted_by differing
 * between the two callers, and the portal-only deadline refusal.
 *
 * writeBid itself is not imported here (server-only, hits the db). These
 * helpers are what writeBid / submitPortalBid call; if they drift, the two
 * callers drift.
 */

describe("nextBidVersion", () => {
  it("starts at 1 when the vendor has no history", () => {
    expect(nextBidVersion([])).toBe(1);
  });

  it("bumps past the highest existing version", () => {
    expect(nextBidVersion([1])).toBe(2);
    expect(nextBidVersion([1, 2, 2])).toBe(3);
    expect(nextBidVersion([3, 1])).toBe(4);
  });

  it("treats missing/zero versions as empty history", () => {
    expect(nextBidVersion([0])).toBe(1);
  });
});

describe("bidSubmittedBy — two callers, two identities", () => {
  it("portal always records submitted_by as null (vendor typed it)", () => {
    expect(bidSubmittedBy("portal", null)).toBeNull();
    expect(bidSubmittedBy("portal", "user-who-must-not-be-stamped")).toBeNull();
  });

  it("proxy records the purchase-team user who typed the quote", () => {
    expect(bidSubmittedBy("proxy", "user-1")).toBe("user-1");
    expect(bidSubmittedBy("proxy", null)).toBeNull();
  });
});

describe("isBidDeadlinePassed — portal refuses, proxy does not use this", () => {
  it("refuses a vendor arriving after the deadline on an open RFQ", () => {
    expect(isBidDeadlinePassed("2000-01-01", "sent")).toBe(true);
    expect(isBidDeadlinePassed("2000-01-01", "draft")).toBe(true);
    expect(isBidDeadlinePassed("2000-01-01", "comparing")).toBe(true);
  });

  it("still accepts bids on the deadline day itself", () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    expect(isBidDeadlinePassed(`${y}-${m}-${d}`, "sent")).toBe(false);
  });

  it("does not fire once the RFQ is awarded or closed", () => {
    expect(isBidDeadlinePassed("2000-01-01", "awarded")).toBe(false);
    expect(isBidDeadlinePassed("2000-01-01", "closed")).toBe(false);
  });

  it("does not fire when there is no deadline", () => {
    expect(isBidDeadlinePassed(null, "sent")).toBe(false);
    expect(isBidDeadlinePassed("", "sent")).toBe(false);
  });

  it("does not fire for a future deadline", () => {
    expect(isBidDeadlinePassed("2099-12-31", "sent")).toBe(false);
  });
});
