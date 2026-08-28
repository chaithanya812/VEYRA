import { describe, it, expect } from "vitest";
import { NAV, activeGroupId, activeHref, isGroup } from "./nav";

describe("activeHref", () => {
  it("matches an exact route", () => {
    expect(activeHref("/leads")).toBe("/leads");
  });

  it("matches a nested route to its module", () => {
    expect(activeHref("/leads/9f0a")).toBe("/leads");
    expect(activeHref("/quotations/abc/compare/def")).toBe("/quotations");
  });

  it("prefers the longest match, so a child route does not light its parent", () => {
    // The whole reason this is a function and not `startsWith`: /leads/insights
    // is its own module and must not light Lead Management too.
    expect(activeHref("/leads/insights")).toBe("/leads/insights");
    expect(activeHref("/projects/insights")).toBe("/projects/insights");
    expect(activeHref("/projects/1234")).toBe("/projects");
  });

  it("does not match a route that merely shares a prefix string", () => {
    expect(activeHref("/leadsomething")).toBe(null);
  });

  it("returns null off the map", () => {
    expect(activeHref("/nowhere")).toBe(null);
  });
});

describe("activeGroupId", () => {
  it("finds the group that owns the route", () => {
    expect(activeGroupId("/leads/9f0a")).toBe("sales");
    expect(activeGroupId("/inventory/stock-in")).toBe("operations");
    expect(activeGroupId("/settings/roles")).toBe("admin");
  });

  it("has no group for a top-level leaf", () => {
    expect(activeGroupId("/dashboard")).toBe(null);
  });

  it("has no group off the map", () => {
    expect(activeGroupId("/nowhere")).toBe(null);
  });
});

describe("the map itself", () => {
  it("gives every entry a unique route", () => {
    const hrefs = NAV.flatMap((e) => (isGroup(e) ? e.items.map((i) => i.href) : [e.href]));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every group a unique id", () => {
    const ids = NAV.filter(isGroup).map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts every route at the root", () => {
    const hrefs = NAV.flatMap((e) => (isGroup(e) ? e.items.map((i) => i.href) : [e.href]));
    for (const h of hrefs) expect(h.startsWith("/")).toBe(true);
  });
});
