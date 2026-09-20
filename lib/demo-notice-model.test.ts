import { describe, it, expect } from "vitest";
import {
  shouldShowDemoNotice,
  tenantAuthoredCount,
} from "./demo-notice-model";

describe("shouldShowDemoNotice", () => {
  it("is true when every row is a demo sample", () => {
    expect(
      shouldShowDemoNotice([{ is_demo: true }, { is_demo: true }]),
    ).toBe(true);
  });

  it("is false as soon as any non-demo row exists", () => {
    expect(
      shouldShowDemoNotice([{ is_demo: true }, { is_demo: false }]),
    ).toBe(false);
    expect(shouldShowDemoNotice([{ is_demo: false }])).toBe(false);
  });

  it("is false for an empty list — nothing to explain", () => {
    expect(shouldShowDemoNotice([])).toBe(false);
  });

  it("treats a missing is_demo as a real row, so the notice hides", () => {
    expect(shouldShowDemoNotice([{}])).toBe(false);
    expect(shouldShowDemoNotice([{ is_demo: null }])).toBe(false);
  });
});

describe("tenantAuthoredCount", () => {
  it("excludes demo rows from the configured count", () => {
    expect(
      tenantAuthoredCount([
        { is_demo: true },
        { is_demo: true },
        { is_demo: false },
      ]),
    ).toBe(1);
  });

  it("is zero when only samples exist", () => {
    expect(tenantAuthoredCount([{ is_demo: true }])).toBe(0);
  });

  it("is zero on an empty list", () => {
    expect(tenantAuthoredCount([])).toBe(0);
  });
});
