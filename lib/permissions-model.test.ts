import { describe, it, expect } from "vitest";
import { indianFY, formatDocNumber } from "./permissions-model";

/**
 * Locks the numbering-series helpers (FEATURE-REGISTER PROC-CFG-005). The
 * Indian financial year runs 1 Apr → 31 Mar, so Jan–Mar of calendar year Y
 * carry the PREVIOUS FY label — the boundary behaviour below is exactly what
 * makes VEYRA numbers like VEYRA/2026-27/0042 correct all year round.
 * Dates are built with the local-time constructor so assertions hold in any
 * timezone (the helpers read local-year/local-month by contract).
 */
describe("indianFY (Apr–Mar financial year)", () => {
  it("maps Jan–Mar to the PREVIOUS FY label", () => {
    expect(indianFY(new Date(2026, 0, 15))).toBe("2025-26"); // 15 Jan 2026
    expect(indianFY(new Date(2026, 2, 31))).toBe("2025-26"); // 31 Mar 2026 — old FY's last day
  });

  it("maps Apr–Dec to the CURRENT FY label", () => {
    expect(indianFY(new Date(2026, 3, 1))).toBe("2026-27"); // 1 Apr 2026 — new FY's first day
    expect(indianFY(new Date(2026, 11, 31))).toBe("2026-27"); // 31 Dec 2026
  });

  it("labels are startYear + two-digit endYear", () => {
    expect(indianFY(new Date(2027, 0, 5))).toBe("2026-27"); // Jan 2027 is still FY 2026-27
    expect(indianFY(new Date(2030, 4, 10))).toBe("2030-31");
  });
});

describe("formatDocNumber", () => {
  const jun2026 = new Date(2026, 5, 1); // mid-FY 2026-27

  it("renders prefix / FY segment / zero-padded integer", () => {
    expect(
      formatDocNumber(
        { prefix: "VEYRA", fy_segment: true, padding: 4, current_int: 42 },
        jun2026,
      ),
    ).toBe("VEYRA/2026-27/0042");
  });

  it("omits the FY segment when disabled", () => {
    expect(
      formatDocNumber(
        { prefix: "VEYRA", fy_segment: false, padding: 4, current_int: 42 },
        jun2026,
      ),
    ).toBe("VEYRA/0042");
  });

  it("honours smaller padding without truncating", () => {
    expect(
      formatDocNumber(
        { prefix: "ACME", fy_segment: true, padding: 2, current_int: 7 },
        jun2026,
      ),
    ).toBe("ACME/2026-27/07");
  });

  it("honours larger padding", () => {
    expect(
      formatDocNumber(
        { prefix: "ACME", fy_segment: false, padding: 6, current_int: 7 },
        jun2026,
      ),
    ).toBe("ACME/000007");
  });

  it("picks up the FY boundary through the document date", () => {
    // Same config, but dated inside the previous financial year.
    expect(
      formatDocNumber(
        { prefix: "VEYRA", fy_segment: true, padding: 4, current_int: 12 },
        new Date(2026, 0, 20), // 20 Jan 2026 → FY 2025-26
      ),
    ).toBe("VEYRA/2025-26/0012");
  });
});
