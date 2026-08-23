import { describe, it, expect } from "vitest";
import {
  formatDuration,
  connectRate,
  STATUS_META,
} from "./interactions-model";

/**
 * Locks the REQ-03 interaction helpers. formatDuration renders the compact
 * h/m/s form the call-log table and timeline show, and connectRate is the
 * hero wallboard metric — both must be exact.
 */
describe("interaction helpers (REQ-03)", () => {
  describe("formatDuration", () => {
    it("renders zero as 0s", () => {
      expect(formatDuration(0)).toBe("0s");
    });

    it("renders bare seconds", () => {
      expect(formatDuration(45)).toBe("45s");
    });

    it("renders minutes with leftover seconds", () => {
      expect(formatDuration(80)).toBe("1m 20s");
    });

    it("drops zero units (60 → 1m, not 1m 0s)", () => {
      expect(formatDuration(60)).toBe("1m");
    });

    it("renders hours with minutes", () => {
      expect(formatDuration(3720)).toBe("1h 2m");
      expect(formatDuration(3600)).toBe("1h");
    });

    it("renders every non-zero unit", () => {
      expect(formatDuration(3661)).toBe("1h 1m 1s");
    });
  });

  describe("connectRate", () => {
    it("returns 0 for an empty set", () => {
      expect(connectRate([])).toBe(0);
    });

    it("counts connected AND completed as connections", () => {
      expect(
        connectRate([
          { status: "connected" },
          { status: "completed" },
          { status: "not_connected" },
          { status: "no_answer" },
        ]),
      ).toBe(50);
    });

    it("returns 100 when every row connected", () => {
      expect(connectRate([{ status: "connected" }, { status: "completed" }])).toBe(
        100,
      );
    });

    it("returns 0 when nothing connected (a missed call is NOT an alarm)", () => {
      expect(
        connectRate([
          { status: "not_connected" },
          { status: "no_answer" },
          { status: "failed" },
        ]),
      ).toBe(0);
    });

    it("rounds to an integer percent", () => {
      // 1 of 3 → 33.33% → 33
      expect(
        connectRate([{ status: "completed" }, { status: "no_answer" }, { status: "no_answer" }]),
      ).toBe(33);
      // 2 of 3 → 66.67% → 67
      expect(
        connectRate([{ status: "connected" }, { status: "connected" }, { status: "failed" }]),
      ).toBe(67);
    });
  });

  describe("STATUS_META tones", () => {
    it("never maps a status to red — green/amber/grey only (DESIGN §2)", () => {
      for (const meta of Object.values(STATUS_META)) {
        expect(["positive", "warning", "muted", "neutral"]).toContain(meta.tone);
      }
      expect(STATUS_META.connected.tone).toBe("positive");
      expect(STATUS_META.not_connected.tone).toBe("muted");
      expect(STATUS_META.no_answer.tone).toBe("warning");
    });
  });
});
