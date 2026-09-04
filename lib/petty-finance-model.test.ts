import { describe, expect, it } from "vitest";
import {
  DELETED_PROJECT,
  filterClaims,
  isPettyKind,
  isPettyTab,
  kindOf,
  matchesUserSearch,
  monthLabel,
  monthPrefix,
  pettyLedgers,
  pettyReversalOf,
  pettySummary,
  pettyUserCards,
  projectNameFor,
  recordedAtOf,
  resolveMonth,
  shortId,
  stepMonth,
  toLedgerEntry,
  transactionDateOf,
  validatePettyEntry,
  type PettyClaim,
} from "./petty-finance-model";

/**
 * The arithmetic of `110521`, tested before any of it reached a screen.
 *
 * The two facts worth failing over: a reversed pair must vanish from BOTH the
 * rows and the totals with the checkbox off, and reappear in the rows WITHOUT
 * moving the total when it is ticked — and a balance is funds minus expenses,
 * never anything stored.
 */

let seq = 0;
function claim(over: Partial<PettyClaim> = {}): PettyClaim {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    member_id: "m1",
    project_id: null,
    project_label: null,
    spent_on: "2026-08-10",
    amount: 1000,
    category: "materials",
    remark: null,
    receipt_url: null,
    status: "submitted",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    created_at: "2026-08-12T09:00:00.000Z",
    ...over,
  };
}

describe("vocabulary", () => {
  it("a row with no kind is an expense — every pre-0041 row is one", () => {
    expect(kindOf(claim())).toBe("expense");
    expect(kindOf(claim({ kind: null }))).toBe("expense");
    expect(kindOf(claim({ kind: "fund" }))).toBe("fund");
    // An unknown value is not silently a fund; only 'fund' is a fund.
    expect(kindOf(claim({ kind: "advance" }))).toBe("expense");
  });

  it("guards accept only what the registry knows", () => {
    expect(isPettyKind("fund")).toBe(true);
    expect(isPettyKind("funds")).toBe(false);
    expect(isPettyTab("my-fund")).toBe(true);
    expect(isPettyTab("myfund")).toBe(false);
    expect(isPettyTab(undefined)).toBe(false);
  });

  it("shows the id the frame shows", () => {
    expect(shortId("abcdef01-2345-6789-abcd-ef0123456789")).toBe("ABCDEF01");
  });
});

describe("the two dates are two columns", () => {
  const c = claim({ spent_on: "2026-08-10", created_at: "2026-08-27T04:30:00.000Z" });

  it("transaction date is what a person typed", () => {
    expect(transactionDateOf(c)).toBe("2026-08-10");
  });

  it("recorded date is what the database stamped, and they differ", () => {
    expect(recordedAtOf(c)).toBe("2026-08-27T04:30:00.000Z");
    expect(recordedAtOf(c).slice(0, 10)).not.toBe(transactionDateOf(c));
  });
});

describe("a project that no longer resolves", () => {
  const names = { p1: "Malviya Nagar 3BHK" };

  it("resolves the FK when the project is alive", () => {
    expect(projectNameFor(claim({ project_id: "p1" }), names)).toBe("Malviya Nagar 3BHK");
  });

  it("falls back to the label the row carried", () => {
    expect(projectNameFor(claim({ project_label: "DLF Greens" }), names)).toBe("DLF Greens");
  });

  it("says Deleted Project rather than leaving the cell blank", () => {
    expect(projectNameFor(claim(), names)).toBe(DELETED_PROJECT);
    // A dead FK with no label is the same case, not an empty string.
    expect(projectNameFor(claim({ project_id: "gone" }), names)).toBe(DELETED_PROJECT);
  });
});

describe("the ledger adapter", () => {
  it("a fund is inflow and an expense is outflow", () => {
    expect(toLedgerEntry(claim({ kind: "fund" })).direction).toBe("inflow");
    expect(toLedgerEntry(claim()).direction).toBe("outflow");
  });

  it("carries the TRANSACTION date into paid_on, never the stamp", () => {
    const e = toLedgerEntry(claim({ spent_on: "2026-08-03", created_at: "2026-08-20T00:00:00Z" }));
    expect(e.paid_on).toBe("2026-08-03");
    expect(e.created_at).toBe("2026-08-20T00:00:00Z");
  });
});

describe("reversals hide as a pair and never move the total", () => {
  const spent = claim({ amount: 5000, member_id: "m1" });
  const reversal = claim({ amount: -5000, member_id: "m1", reversal_of: spent.id });
  const other = claim({ amount: 1200, member_id: "m1" });
  const rows = [spent, reversal, other];

  it("with the checkbox OFF, both halves are gone", () => {
    const { expense } = pettyLedgers(rows, false);
    expect(expense.rows.map((r) => r.id)).toEqual([other.id]);
    expect(expense.total).toBe(1200);
    expect(expense.hiddenCount).toBe(2);
  });

  it("with the checkbox ON, both halves are back and the total is UNCHANGED", () => {
    const { expense } = pettyLedgers(rows, true);
    expect(expense.rows).toHaveLength(3);
    expect(expense.rows.map((r) => r.id).sort()).toEqual(
      [spent.id, reversal.id, other.id].sort(),
    );
    // The whole point: showing a corrected entry is a display question.
    expect(expense.total).toBe(1200);
  });

  it("a reversal never crosses to the other side of the toggle", () => {
    const fund = claim({ kind: "fund", amount: 8000 });
    const fundReversal = claim({ kind: "fund", amount: -8000, reversal_of: fund.id });
    const { expense, fund: funds } = pettyLedgers([...rows, fund, fundReversal], false);
    expect(funds.total).toBe(0);
    expect(funds.rows).toHaveLength(0);
    // The expense side is untouched by what happened on the fund side.
    expect(expense.total).toBe(1200);
  });
});

describe("per-user cards and the summary band", () => {
  const members = [
    { id: "m1", name: "Rahul Verma" },
    { id: "m2", name: "Meghana Rao" },
    { id: "m3", name: "Karthik Nair" },
  ];
  const claims = [
    claim({ member_id: "m1", kind: "fund", amount: 20000 }),
    claim({ member_id: "m1", amount: 5400 }),
    claim({ member_id: "m1", amount: 1200 }),
    claim({ member_id: "m2", amount: 3000 }),
  ];
  const cards = pettyUserCards(claims, members);

  it("balance is funds minus expenses, per person", () => {
    const m1 = cards.find((c) => c.memberId === "m1")!;
    expect(m1.fund).toBe(20000);
    expect(m1.expense).toBe(6600);
    expect(m1.balance).toBe(13400);
    expect(m1.count).toBe(3);
  });

  it("somebody who spent with no fund is overdrawn, not merely negative", () => {
    const m2 = cards.find((c) => c.memberId === "m2")!;
    expect(m2.balance).toBe(-3000);
  });

  it("a member with nothing this month still gets a card", () => {
    const m3 = cards.find((c) => c.memberId === "m3")!;
    expect(m3.count).toBe(0);
    expect(m3.balance).toBe(0);
  });

  it("a claim from somebody no longer on the team is not dropped", () => {
    const withGhost = pettyUserCards([...claims, claim({ member_id: "gone", amount: 900 })], members);
    const ghost = withGhost.find((c) => c.memberId === "gone")!;
    expect(ghost.name).toBe("Former member");
    expect(ghost.expense).toBe(900);
  });

  it("Overdrawn Balance sums only the negative balances, and carries its count", () => {
    const s = pettySummary(cards);
    expect(s.fund).toBe(20000);
    expect(s.expense).toBe(9600);
    expect(s.balance).toBe(10400);
    // m1 is +13,400 and m2 is −3,000. Netting them would report 0 overdrawn,
    // which is the least useful true statement available.
    expect(s.overdrawn).toBe(3000);
    expect(s.overdrawnMembers).toBe(1);
    expect(s.members).toBe(3);
  });

  it("reversed pairs never reach a user card", () => {
    const spent = claim({ member_id: "m3", amount: 7000 });
    const undo = claim({ member_id: "m3", amount: -7000, reversal_of: spent.id });
    const c = pettyUserCards([...claims, spent, undo], members).find((x) => x.memberId === "m3")!;
    expect(c.expense).toBe(0);
    expect(c.count).toBe(0);
  });
});

describe("the month stepper", () => {
  it("rolls the year over in both directions", () => {
    expect(stepMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(stepMonth({ year: 2026, month: 8 }, 1)).toEqual({ year: 2026, month: 9 });
  });

  it("labels and prefixes the month", () => {
    expect(monthLabel({ year: 2026, month: 8 })).toBe("August 2026");
    expect(monthPrefix({ year: 2026, month: 8 })).toBe("2026-08");
    expect(monthPrefix({ year: 2026, month: 12 })).toBe("2026-12");
  });

  it("resolves from the URL, falling back to the supplied today", () => {
    const today = new Date("2026-09-04T00:00:00Z");
    expect(resolveMonth({ y: "2026", m: "8" }, today)).toEqual({ year: 2026, month: 8 });
    expect(resolveMonth({}, today)).toEqual({ year: 2026, month: 9 });
    // Junk falls back rather than rendering month 13 or year 0.
    expect(resolveMonth({ y: "2026", m: "13" }, today)).toEqual({ year: 2026, month: 9 });
    expect(resolveMonth({ y: "nope", m: "3" }, today)).toEqual({ year: 2026, month: 9 });
  });
});

describe("filtering", () => {
  const rows = [
    claim({ spent_on: "2026-08-31", member_id: "m1" }),
    claim({ spent_on: "2026-09-01", member_id: "m1" }),
    claim({ spent_on: "2026-08-02", member_id: "m2" }),
  ];

  it("narrows on the transaction date, not the recorded date", () => {
    // Every row above was RECORDED on 2026-08-12; only two were SPENT in August.
    const aug = filterClaims(rows, { month: { year: 2026, month: 8 } });
    expect(aug).toHaveLength(2);
    expect(aug.map((r) => r.spent_on).sort()).toEqual(["2026-08-02", "2026-08-31"]);
  });

  it("scopes the whole page to one person", () => {
    const scoped = filterClaims(rows, { month: { year: 2026, month: 8 }, memberId: "m2" });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].member_id).toBe("m2");
  });

  it("the user search matches a name case-insensitively", () => {
    expect(matchesUserSearch("Meghana Rao", "megh")).toBe(true);
    expect(matchesUserSearch("Meghana Rao", "  RAO ")).toBe(true);
    expect(matchesUserSearch("Meghana Rao", "")).toBe(true);
    expect(matchesUserSearch("Meghana Rao", "verma")).toBe(false);
  });
});

describe("writing", () => {
  it("a reversal is the same row with the opposite sign, pointing back", () => {
    const c = claim({ amount: 2750, project_label: "DLF Greens", category: "materials", kind: "fund" });
    const r = pettyReversalOf(c);
    expect(r.amount).toBe(-2750);
    expect(r.reversal_of).toBe(c.id);
    expect(r.kind).toBe("fund");
    expect(r.category).toBe("materials");
    expect(r.project_label).toBe("DLF Greens");
    // It corrects a transaction that happened when it happened.
    expect(r.spent_on).toBe(c.spent_on);
    expect(r.remark).toBe(`Reversal of ${shortId(c.id)}`);
  });

  it("rejects an entry nobody could act on", () => {
    expect(validatePettyEntry({ amount: 0, spent_on: "2026-08-01", kind: "expense" }).ok).toBe(false);
    expect(validatePettyEntry({ amount: -5, spent_on: "2026-08-01", kind: "expense" }).ok).toBe(false);
    expect(validatePettyEntry({ amount: 10, spent_on: "01/08/2026", kind: "expense" }).ok).toBe(false);
    expect(validatePettyEntry({ amount: 10, spent_on: "2026-08-01", kind: "loan" }).ok).toBe(false);
  });

  it("accepts a real one and rounds to the paisa", () => {
    const r = validatePettyEntry({ amount: "1200.005", spent_on: "2026-08-01", kind: "fund" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.amount).toBe(1200.01);
      expect(r.kind).toBe("fund");
    }
  });
});
