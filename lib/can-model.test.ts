import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  can,
  capabilityDef,
  capabilityTree,
  enableAllKeys,
  isCapability,
  parseCapability,
  resolveActor,
  resolveRole,
  searchCapabilities,
  resolveTier,
  TIER_CAPABILITIES,
  type GrantRow,
  type RoleRow,
} from "./can-model";

/**
 * These tests are mostly about REFUSAL. A `can()` never proven to say no is
 * indistinguishable from a comment.
 */

const role = (id: string, over: Partial<RoleRow> = {}): RoleRow => ({
  id,
  name: id,
  is_system: false,
  inherits_from: null,
  ...over,
});

const grant = (role_id: string, module: string, entity: string, action: string): GrantRow => ({
  role_id,
  module,
  entity,
  action,
});

describe("the capability registry", () => {
  it("has unique keys", () => {
    const keys = CAPABILITIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every key is exactly three segments", () => {
    for (const c of CAPABILITIES) {
      expect(c.key.split(".")).toHaveLength(3);
    }
  });

  it("knows its own keys and nothing else", () => {
    expect(isCapability("procurement.po.approve")).toBe(true);
    expect(isCapability("procurement.po.aprove")).toBe(false);
    expect(isCapability("")).toBe(false);
    expect(isCapability("procurement.po")).toBe(false);
    expect(capabilityDef("nope.nope.nope")).toBeNull();
  });

  it("marks the two deletes the frame shows unchecked as destructive", () => {
    expect(capabilityDef("procurement.mr.delete")?.destructive).toBe(true);
    expect(capabilityDef("vendors.vendor.delete")?.destructive).toBe(true);
  });

  it("Enable All never sweeps in a destructive capability", () => {
    const procurement = enableAllKeys("Procurement");
    expect(procurement).toContain("procurement.po.approve");
    expect(procurement).not.toContain("procurement.mr.delete");

    const vendors = enableAllKeys("Vendors");
    expect(vendors).toContain("vendors.vendor.create");
    expect(vendors).not.toContain("vendors.vendor.delete");
  });

  it("groups into the nested shape Edit Role renders", () => {
    const tree = capabilityTree();
    const procurement = tree.find((g) => g.group === "Procurement");
    expect(procurement).toBeDefined();
    expect(procurement?.parents.map((p) => p.parent)).toEqual([
      "Acceptance",
      "RFQ",
      "Requests",
      "Orders",
    ]);
  });
});

describe("resolveRole", () => {
  it("grants a role its own capabilities", () => {
    const r = resolveRole([role("a")], [grant("a", "procurement", "po", "approve")], "a");
    expect(r.error).toBeNull();
    expect(can(r, "procurement.po.approve")).toBe(true);
    expect(can(r, "procurement.mr.approve")).toBe(false);
  });

  it("inherits a parent's capabilities, nearest first", () => {
    const roles = [role("child", { inherits_from: "parent" }), role("parent")];
    const grants = [
      grant("child", "procurement", "po", "approve"),
      grant("parent", "procurement", "mr", "approve"),
    ];
    const r = resolveRole(roles, grants, "child");
    expect(r.chain).toEqual(["child", "parent"]);
    expect(can(r, "procurement.po.approve")).toBe(true);
    expect(can(r, "procurement.mr.approve")).toBe(true);
  });

  it("inherits through more than one level", () => {
    const roles = [
      role("a", { inherits_from: "b" }),
      role("b", { inherits_from: "c" }),
      role("c"),
    ];
    const r = resolveRole(roles, [grant("c", "leads", "lead", "view")], "a");
    expect(r.chain).toEqual(["a", "b", "c"]);
    expect(can(r, "leads.lead.view")).toBe(true);
  });

  it("does NOT inherit downward — a parent has none of its child's grants", () => {
    const roles = [role("child", { inherits_from: "parent" }), role("parent")];
    const r = resolveRole(roles, [grant("child", "leads", "lead", "delete")], "parent");
    expect(can(r, "leads.lead.delete")).toBe(false);
  });

  /* ── Failure is the point ──────────────────────────────────────────────── */

  it("a CYCLE denies everything, not merely what it saw before looping", () => {
    const roles = [role("a", { inherits_from: "b" }), role("b", { inherits_from: "a" })];
    const grants = [grant("a", "procurement", "po", "approve")];
    const r = resolveRole(roles, grants, "a");
    expect(r.error).toBe("cycle");
    // 'a' genuinely holds this grant. The broken chain still refuses it.
    expect(can(r, "procurement.po.approve")).toBe(false);
    expect(r.keys.size).toBe(0);
  });

  it("a missing PARENT denies everything the child held", () => {
    const roles = [role("child", { inherits_from: "ghost" })];
    const r = resolveRole(roles, [grant("child", "leads", "lead", "view")], "child");
    expect(r.error).toBe("missing-parent");
    expect(can(r, "leads.lead.view")).toBe(false);
  });

  it("a missing role denies", () => {
    expect(resolveRole([], [], "ghost").error).toBe("missing-role");
    expect(can(resolveRole([], [], "ghost"), "leads.lead.view")).toBe(false);
  });

  it("a null role id denies", () => {
    expect(resolveRole([role("a")], [], null).error).toBe("no-role");
    expect(resolveRole([role("a")], [], undefined).error).toBe("no-role");
  });

  it("ignores a grant naming a capability the registry does not know", () => {
    const r = resolveRole([role("a")], [grant("a", "wizardry", "spell", "cast")], "a");
    expect(r.error).toBeNull();
    expect(r.keys.size).toBe(0);
    expect(can(r, "wizardry.spell.cast")).toBe(false);
  });

  it("ignores another role's grants entirely", () => {
    const r = resolveRole(
      [role("a"), role("b")],
      [grant("b", "procurement", "po", "approve")],
      "a",
    );
    expect(can(r, "procurement.po.approve")).toBe(false);
  });

  it("expands a '*' entity across that module's matching actions only", () => {
    const r = resolveRole([role("a")], [grant("a", "reports", "*", "view")], "a");
    expect(can(r, "reports.payment.view")).toBe(true);
    expect(can(r, "reports.financial.view")).toBe(true);
    expect(can(r, "leads.lead.view")).toBe(false);
    expect(can(r, "procurement.po.approve")).toBe(false);
  });

  it("a '*' grant still cannot invent a capability", () => {
    const r = resolveRole([role("a")], [grant("a", "leads", "*", "detonate")], "a");
    expect(r.keys.size).toBe(0);
  });

  it("a system role with {all:true} grants everything", () => {
    const roles = [role("owner", { is_system: true, permissions: { all: true } })];
    const r = resolveRole(roles, [], "owner");
    expect(r.all).toBe(true);
    expect(can(r, "procurement.po.approve")).toBe(true);
    expect(can(r, "vendors.vendor.delete")).toBe(true);
  });

  it("but {all:true} still cannot grant a capability that does not exist", () => {
    const roles = [role("owner", { permissions: { all: true } })];
    expect(can(resolveRole(roles, [], "owner"), "procurement.po.aprove")).toBe(false);
  });

  it("a jsonb that is not exactly {all:true} grants nothing", () => {
    for (const p of [{ all: false }, { all: "yes" }, {}, null, "all", 1]) {
      const r = resolveRole([role("x", { permissions: p })], [], "x");
      expect(r.all).toBe(false);
      expect(can(r, "leads.lead.view")).toBe(false);
    }
  });
});

describe("can", () => {
  it("denies on a null or undefined resolution", () => {
    expect(can(null, "leads.lead.view")).toBe(false);
    expect(can(undefined, "leads.lead.view")).toBe(false);
  });

  it("denies an unknown capability even from a full grant set", () => {
    const r = resolveRole([role("a", { permissions: { all: true } })], [], "a");
    expect(can(r, "")).toBe(false);
    expect(can(r, "not.a.capability")).toBe(false);
  });

  it("never throws, whatever it is handed", () => {
    const r = resolveRole([role("a")], [grant("a", "leads", "lead", "view")], "a");
    for (const bad of ["", ".", "..", "a.b.c.d", "leads.lead.", "LEADS.LEAD.VIEW"]) {
      expect(() => can(r, bad)).not.toThrow();
      expect(can(r, bad)).toBe(false);
    }
  });

  it("is case sensitive — a capability is an identifier, not a phrase", () => {
    const r = resolveRole([role("a")], [grant("a", "leads", "lead", "view")], "a");
    expect(can(r, "leads.lead.view")).toBe(true);
    expect(can(r, "Leads.Lead.View")).toBe(false);
  });
});

describe("the tier floor", () => {
  it("owner and admin hold everything", () => {
    for (const tier of ["owner", "admin"]) {
      const r = resolveTier(tier);
      expect(r.all).toBe(true);
      expect(can(r, "vendors.vendor.delete")).toBe(true);
    }
  });

  it("no tier below admin carries a destructive capability", () => {
    for (const tier of ["manager", "member"]) {
      const r = resolveTier(tier);
      for (const c of CAPABILITIES.filter((x) => x.destructive)) {
        expect(can(r, c.key)).toBe(false);
      }
    }
  });

  it("a manager approves but does not reach settings", () => {
    const r = resolveTier("manager");
    expect(can(r, "hr.leave.approve")).toBe(true);
    expect(can(r, "procurement.po.approve")).toBe(true);
    expect(can(r, "settings.role.edit")).toBe(false);
    expect(can(r, "settings.user.edit")).toBe(false);
  });

  it("a member neither approves nor sees costs", () => {
    const r = resolveTier("member");
    expect(can(r, "procurement.mr.create")).toBe(true);
    expect(can(r, "procurement.mr.approve")).toBe(false);
    expect(can(r, "hr.leave.approve")).toBe(false);
    expect(can(r, "billing.cost.view")).toBe(false);
    expect(can(r, "reports.financial.view")).toBe(false);
  });

  it("an unknown or missing tier denies", () => {
    for (const t of ["supervisor", "", null, undefined]) {
      const r = resolveTier(t);
      expect(r.error).toBe("unknown-tier");
      expect(can(r, "leads.lead.view")).toBe(false);
    }
  });

  it("every tier list contains only real capabilities", () => {
    for (const [, set] of Object.entries(TIER_CAPABILITIES)) {
      if (set === "all") continue;
      for (const key of set) expect(isCapability(key)).toBe(true);
    }
  });
});

describe("parseCapability", () => {
  it("splits a known capability into its three columns", () => {
    expect(parseCapability("procurement.po.approve")).toEqual({
      module: "procurement",
      entity: "po",
      action: "approve",
    });
  });

  it("refuses anything the registry does not know", () => {
    // The editor writes grants from this. A capability the registry has never
    // heard of would sit in `permissions` forever while `can()` ignored it —
    // a setting that appears to have been saved and controls nothing.
    for (const bad of ["", "a.b.c", "procurement.po.aprove", "procurement.po", "x"]) {
      expect(parseCapability(bad)).toBeNull();
    }
  });
});

describe("searchCapabilities", () => {
  it("returns everything for an empty query", () => {
    expect(searchCapabilities("  ")).toHaveLength(CAPABILITIES.length);
  });

  it("matches on label, group, parent and key, case-insensitively", () => {
    expect(searchCapabilities("approve/reject po").map((c) => c.key)).toContain(
      "procurement.po.approve",
    );
    expect(searchCapabilities("VENDORS").length).toBeGreaterThan(0);
    expect(searchCapabilities("hr.leave").map((c) => c.key)).toContain("hr.leave.approve");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchCapabilities("zzzznotathing")).toEqual([]);
  });
});

describe("resolveActor", () => {
  it("uses the tier when the member has no role", () => {
    expect(resolveActor([], [], null, "manager").all).toBe(false);
    expect(can(resolveActor([], [], null, "manager"), "hr.leave.approve")).toBe(true);
    expect(can(resolveActor([], [], null, "member"), "hr.leave.approve")).toBe(false);
  });

  it("uses the role when the member has one, ignoring the tier", () => {
    const roles = [role("locked")];
    // An OWNER tier, but an explicit role granting nothing.
    const r = resolveActor(roles, [], "locked", "owner");
    expect(r.all).toBe(false);
    expect(can(r, "leads.lead.view")).toBe(false);
  });

  it("a broken role does NOT fall back to the tier", () => {
    // The dangerous inversion: a cyclic role must not silently restore the
    // owner powers the tenant thought they had replaced.
    const roles = [role("a", { inherits_from: "b" }), role("b", { inherits_from: "a" })];
    const r = resolveActor(roles, [], "a", "owner");
    expect(r.error).toBe("cycle");
    expect(can(r, "leads.lead.view")).toBe(false);
    expect(can(r, "vendors.vendor.delete")).toBe(false);
  });
});
