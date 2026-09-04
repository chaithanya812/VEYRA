import { describe, it, expect } from "vitest";
import { isCapability } from "./can-model";
import { MATRIX_COLUMNS } from "./payments-dashboard-model";
import {
  SAVED_VIEW_SCREENS,
  activeView,
  buildCsv,
  canonicalQuery,
  canonicalQueryFromString,
  columnChoices,
  columnsParam,
  csvCell,
  csvFilename,
  describeColumns,
  describeExport,
  findSavedViewScreen,
  parseColumns,
  replacesExisting,
  validateViewName,
  viewHref,
  viewsForScreen,
  VIEW_NAME_MAX,
  type SavedView,
} from "./saved-views-model";

const payments = findSavedViewScreen("finance.payments")!;
const receivables = findSavedViewScreen("finance.receivables")!;

describe("the screen registry", () => {
  it("declares a capability the permission registry actually knows", () => {
    // A capability that is not in CAPABILITIES fails CLOSED and refuses
    // everyone, owner included — and only shows up when somebody tries to save
    // a view. The registry is the one place this can be checked cheaply.
    for (const s of SAVED_VIEW_SCREENS) {
      expect(isCapability(s.capability), `${s.key} → ${s.capability}`).toBe(true);
    }
  });

  it("every screen is gated on the ONE capability the actions guard on", () => {
    // The guard in app/(app)/finance/actions.ts is a literal, because it has
    // to be the first statement — it cannot read the form to look a capability
    // up. This assertion is what keeps that honest: a screen registered under
    // a different capability fails here loudly rather than shipping
    // under-gated on billing.payment.view.
    for (const s of SAVED_VIEW_SCREENS) {
      expect(s.capability, `${s.key} needs its own guard`).toBe(
        "billing.payment.view",
      );
    }
  });

  it("reads the payments columns from MATRIX_COLUMNS rather than a second list", () => {
    expect(payments.columns.map((c) => c.key)).toEqual(
      MATRIX_COLUMNS.map((c) => c.key),
    );
    expect(payments.columns.map((c) => c.label)).toEqual(
      MATRIX_COLUMNS.map((c) => c.label),
    );
  });

  it("defaults to every column, so a chooser never hides data on first load", () => {
    for (const s of SAVED_VIEW_SCREENS) {
      expect(s.defaultColumns).toEqual(s.columns.map((c) => c.key));
    }
  });

  it("returns null for a screen key nobody registered", () => {
    expect(findSavedViewScreen("finance.nonesuch")).toBeNull();
  });
});

describe("canonicalQuery", () => {
  it("keeps only the params the screen actually resolves", () => {
    const q = canonicalQuery(payments, [
      ["stage", "execution"],
      ["evil", "1"],
      ["q", "Malviya"],
    ]);
    expect(q).toBe("stage=execution&q=Malviya");
    expect(q).not.toContain("evil");
  });

  it("is order-independent, so the same filter is always the same string", () => {
    const a = canonicalQueryFromString(payments, "?q=Malviya&dues=1&stage=execution");
    const b = canonicalQueryFromString(payments, "dues=1&stage=execution&q=Malviya");
    expect(a).toBe(b);
  });

  it("sorts repeated values, so two stage orders are one view", () => {
    const a = canonicalQueryFromString(payments, "stage=execution&stage=design");
    const b = canonicalQueryFromString(payments, "stage=design&stage=execution");
    expect(a).toBe(b);
    expect(a).toBe("stage=design&stage=execution");
  });

  it("drops empty values rather than saving q=", () => {
    expect(canonicalQueryFromString(payments, "q=&dues=")).toBe("");
  });

  it("keeps a non-default column selection and drops a default one", () => {
    const chosen = canonicalQuery(payments, [["cols", "contracted,dues"]]);
    expect(chosen).toBe("cols=contracted%2Cdues");
    const all = canonicalQuery(payments, [
      ["cols", payments.defaultColumns.join(",")],
    ]);
    expect(all).toBe("");
  });

  it("builds an href with and without a query", () => {
    expect(viewHref(payments, "dues=1")).toBe("/finance/payments?dues=1");
    expect(viewHref(payments, "")).toBe("/finance/payments");
  });
});

describe("parseColumns", () => {
  it("falls back to the defaults when the URL says nothing", () => {
    expect(parseColumns(payments, undefined)).toEqual([...payments.defaultColumns]);
  });

  it("drops a column key the registry does not know", () => {
    expect(parseColumns(payments, "dues,not_a_column")).toEqual(["dues"]);
  });

  it("falls back to the defaults when EVERY key is unknown", () => {
    // A stale saved view naming only renamed columns must not render an empty
    // table — that is a broken screen, not a filtered one.
    expect(parseColumns(payments, "gone,alsogone")).toEqual([
      ...payments.defaultColumns,
    ]);
  });

  it("uses the registry's order, never the URL's", () => {
    expect(parseColumns(payments, "dues,contracted")).toEqual([
      "contracted",
      "dues",
    ]);
  });

  it("accepts repeated params as well as a comma list", () => {
    expect(parseColumns(payments, ["contracted", "dues"])).toEqual([
      "contracted",
      "dues",
    ]);
  });

  it("columnsParam returns null for the default set and a list otherwise", () => {
    expect(columnsParam(payments, payments.defaultColumns)).toBeNull();
    expect(columnsParam(payments, ["dues", "contracted"])).toBe("contracted,dues");
    expect(columnsParam(payments, [])).toBeNull();
  });

  it("describes the selection with its denominator", () => {
    expect(describeColumns(payments, payments.defaultColumns)).toBe(
      `All ${payments.columns.length} columns`,
    );
    expect(describeColumns(payments, ["dues"])).toBe(
      `1 of ${payments.columns.length} columns`,
    );
  });

  it("columnChoices marks exactly the visible ones", () => {
    const choices = columnChoices(payments, ["contracted", "dues"]);
    expect(choices.length).toBe(payments.columns.length);
    expect(choices.filter((c) => c.checked).map((c) => c.key)).toEqual([
      "contracted",
      "dues",
    ]);
  });

  it("a screen with no chooser resolves to no columns at all", () => {
    // `/finance/receivables` declares an empty registry on purpose — its table
    // is hand-written. `ColumnChooser` renders nothing for it, and parsing must
    // not invent a default set the screen cannot honour.
    expect(receivables.columns).toEqual([]);
    expect(parseColumns(receivables, "anything")).toEqual([]);
    expect(columnsParam(receivables, ["anything"])).toBeNull();
  });
});

describe("validateViewName", () => {
  it("refuses an empty or whitespace name", () => {
    expect(validateViewName("   ").ok).toBe(false);
    expect(validateViewName(null).ok).toBe(false);
  });

  it("trims and collapses inner whitespace", () => {
    const r = validateViewName("  Overdue   only  ");
    expect(r).toEqual({ ok: true, name: "Overdue only" });
  });

  it("refuses a name over the column's CHECK limit, and says by how much", () => {
    const r = validateViewName("x".repeat(VIEW_NAME_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(VIEW_NAME_MAX + 1));
  });

  it("accepts exactly the limit", () => {
    expect(validateViewName("x".repeat(VIEW_NAME_MAX)).ok).toBe(true);
  });
});

describe("saved view matching", () => {
  const views: SavedView[] = [
    { id: "1", screen: "finance.payments", name: "Zeta", query: "dues=1" },
    { id: "2", screen: "finance.payments", name: "alpha", query: "stage=design" },
    { id: "3", screen: "finance.receivables", name: "Overdue", query: "bucket=90" },
  ];

  it("lists only this screen's views, alphabetically, case-insensitively", () => {
    expect(viewsForScreen(views, "finance.payments").map((v) => v.name)).toEqual([
      "alpha",
      "Zeta",
    ]);
  });

  it("finds the view whose query IS the current one", () => {
    expect(activeView(views, "dues=1")?.name).toBe("Zeta");
    expect(activeView(views, "stage=handover")).toBeNull();
  });

  it("spots a name collision the same way the unique index does", () => {
    expect(replacesExisting(views, "finance.payments", "  ZETA ")?.id).toBe("1");
    expect(replacesExisting(views, "finance.payments", "Overdue")).toBeNull();
  });
});

describe("CSV", () => {
  it("quotes only what needs quoting, and doubles inner quotes", () => {
    expect(csvCell("Malviya Nagar")).toBe("Malviya Nagar");
    expect(csvCell("Nagar, 3BHK")).toBe('"Nagar, 3BHK"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("line\r\nbreak")).toBe('"line\r\nbreak"');
  });

  it("leaves ₹ grouping and the em dash exactly as the screen shows them", () => {
    // The export must never be a second, more confident answer than the
    // screen — an open figure stays an em dash, not a zero.
    const csv = buildCsv(["Project", "Dues"], [["Malviya Nagar 3BHK", "₹7,00,000"], ["Aerocity", "—"]]);
    expect(csv).toContain("₹7,00,000");
    expect(csv).toContain("—");
  });

  it("joins with CRLF so Excel opens it as rows", () => {
    expect(buildCsv(["A"], [["1"], ["2"]])).toBe("A\r\n1\r\n2");
  });

  it("says how many rows and columns it wrote, with the filter", () => {
    expect(describeExport(14, 8)).toBe("14 rows × 8 columns");
    expect(describeExport(1, 1, "Stage: Execution")).toBe(
      "1 row × 1 column · Stage: Execution",
    );
    expect(describeExport(0, 12)).toBe("0 rows × 12 columns");
  });

  it("marks a filtered file in its own name", () => {
    expect(csvFilename(payments, "2026-09-04", false)).toBe(
      "finance-payments-2026-09-04.csv",
    );
    expect(csvFilename(payments, "2026-09-04", true)).toBe(
      "finance-payments-2026-09-04-filtered.csv",
    );
  });
});
