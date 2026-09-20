import { describe, it, expect } from "vitest";
import { lastPrice } from "./items-model";

describe("lastPrice (derived, never stored)", () => {
  it("is null when the item has no movements", () => {
    expect(lastPrice([])).toBeNull();
  });

  it("returns the newest unit_rate by created_at, not array order", () => {
    expect(
      lastPrice([
        { unit_rate: 100, created_at: "2026-01-01T00:00:00.000Z" },
        { unit_rate: 250, created_at: "2026-03-01T00:00:00.000Z" },
        { unit_rate: 180, created_at: "2026-02-01T00:00:00.000Z" },
      ]),
    ).toBe(250);
  });

  it("returns null for a non-finite newest rate rather than inventing 0", () => {
    expect(
      lastPrice([{ unit_rate: Number.NaN, created_at: "2026-01-01T00:00:00.000Z" }]),
    ).toBeNull();
  });
});
