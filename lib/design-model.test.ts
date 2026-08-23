import { describe, it, expect } from "vitest";
import {
  ASSET_KINDS,
  KIND_LABELS,
  SIGNOFF_STATUSES,
  SIGNOFF_META,
  kindLabel,
  pinLabel,
  latestSignoffByAsset,
} from "./design-model";

/**
 * Locks the design-vault model (OPS-DES-001): kind labels, the pin-comment
 * label format ("pin @ x%,y%"), and the sign-off colour contract — rejected
 * MUST be red (a true alert that blocks site execution), pending amber,
 * approved green (HARD RULE 5).
 */

describe("kindLabel", () => {
  it("labels every known kind", () => {
    expect(kindLabel("2d")).toBe("2D drawing");
    expect(kindLabel("3d")).toBe("3D model");
    expect(kindLabel("boq")).toBe("BOQ");
    expect(kindLabel("render")).toBe("Render");
    expect(kindLabel("photo")).toBe("Photo");
    expect(kindLabel("other")).toBe("Other");
  });

  it("falls back to Other for unknown kinds", () => {
    expect(kindLabel("blueprint")).toBe("Other");
    expect(kindLabel("")).toBe("Other");
  });

  it("covers exactly the six catalogue kinds", () => {
    expect(ASSET_KINDS).toEqual(["2d", "3d", "boq", "render", "photo", "other"]);
    for (const k of ASSET_KINDS) expect(KIND_LABELS[k]).toBeTruthy();
  });
});

describe("pinLabel", () => {
  it("formats a pinned comment as pin @ x%,y%", () => {
    expect(pinLabel(40, 60)).toBe("pin @ 40%,60%");
    expect(pinLabel("12.50", "88.25")).toBe("pin @ 12.5%,88.25%");
    expect(pinLabel(0, 0)).toBe("pin @ 0%,0%");
  });

  it("rounds to at most two decimals", () => {
    expect(pinLabel(33.333333, 66.666666)).toBe("pin @ 33.33%,66.67%");
  });

  it("returns null when either coordinate is missing", () => {
    expect(pinLabel(null, 40)).toBeNull();
    expect(pinLabel(40, null)).toBeNull();
    expect(pinLabel(null, null)).toBeNull();
    expect(pinLabel("x", "y")).toBeNull();
  });
});

describe("sign-off colour contract (HARD RULE 5)", () => {
  it("pending is amber, approved is green, rejected is red", () => {
    expect(SIGNOFF_META.pending.tone).toBe("amber");
    expect(SIGNOFF_META.approved.tone).toBe("green");
    expect(SIGNOFF_META.rejected.tone).toBe("red");
  });

  it("carries human labels and covers every status", () => {
    expect(SIGNOFF_STATUSES).toEqual(["pending", "approved", "rejected"]);
    expect(SIGNOFF_META.pending.label).toContain("sign-off");
    expect(SIGNOFF_META.approved.label).toBe("Approved");
    expect(SIGNOFF_META.rejected.label).toBe("Rejected");
  });
});

describe("latestSignoffByAsset", () => {
  const s = (
    id: string,
    asset_id: string,
    status: "pending" | "approved" | "rejected",
  ) => ({
    id,
    asset_id,
    status,
    note: null,
    signed_by: null,
    signed_at: null,
    created_at: id,
  });

  it("keeps the first (newest) row per asset from a newest-first list", () => {
    const map = latestSignoffByAsset([
      s("3", "asset-a", "approved"),
      s("2", "asset-a", "pending"), // older — must lose
      s("1", "asset-b", "rejected"),
    ]);
    expect(map.get("asset-a")?.status).toBe("approved");
    expect(map.get("asset-b")?.status).toBe("rejected");
    expect(map.size).toBe(2);
  });

  it("is empty when there are no sign-offs", () => {
    expect(latestSignoffByAsset([]).size).toBe(0);
  });
});
