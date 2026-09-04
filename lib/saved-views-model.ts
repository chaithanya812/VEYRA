import { MATRIX_COLUMNS } from "./payments-dashboard-model";

/**
 * Saved views · column chooser · CSV export — HANDOFF-V8 Part 4 Unit 2.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE ONE IDEA THIS FILE IS BUILT ON: **a saved view is a saved URL.**
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every list screen shipped in Phase 11 already keeps its filter state in the
 * query string and resolves it on the SERVER from `searchParams` — never from
 * an effect (HANDOFF-V8 §11). So a saved view needs no filter model of its
 * own: it is a name plus the query string that screen already understands, and
 * applying one is a plain `<Link>`. That is why `saved_views` has ONE column
 * for the whole filter set instead of one column per filter, and why adding a
 * filter to a screen later needs no migration.
 *
 * The chosen columns ride in the SAME query string (`?cols=a,b,c`), which is
 * what "the column chooser persists alongside the saved view" means in
 * practice — one stored string, not two, so the two can never disagree.
 *
 * ⚠ THIS IS A PURE MODULE, NOT A CLIENT ONE, ON PURPOSE. The screen registry
 * below is vocabulary — labels, column lists, capability keys — and a
 * `"use client"` module's exported const is a client reference on the server:
 * `tsc` passes, `next build` passes, and every request throws (§11).
 *
 * NOTHING HERE READS THE DATABASE and nothing here formats money. `inr()` and
 * the row values arrive from the caller.
 */

/* ════════════════════════════════════════════════════════════════════════════
 * 1. THE SCREEN REGISTRY
 * ════════════════════════════════════════════════════════════════════════════ */

export type SavedViewScreenKey = "finance.payments" | "finance.receivables";

export interface SavedViewColumn {
  key: string;
  label: string;
  /** What the column counts — reused as the chooser's hover text. */
  note?: string;
}

export interface SavedViewScreen {
  key: SavedViewScreenKey;
  label: string;
  /** Where a saved view of this screen is applied. */
  path: string;
  /**
   * The capability that gates the SCREEN — reused verbatim to gate saving,
   * deleting and exporting.
   *
   * This is the answer to "CSV export must not become a second way to read
   * data that bypasses `can()`": the export button is rendered inside the same
   * `can()` branch as the table, serialises only rows already on the page, and
   * the metering action re-checks this exact key server-side. Whatever the
   * screen refuses to show, the export cannot write.
   */
  capability: string;
  /**
   * The filter params this screen resolves on the server. Anything else in a
   * URL is dropped before it is saved — a saved view must not be able to smuggle
   * an arbitrary query param past the screen that will replay it.
   */
  params: readonly string[];
  /** The chooser's registry. Empty when a screen has no chooser (yet). */
  columns: readonly SavedViewColumn[];
  /** Shown when `cols` is absent from the URL. */
  defaultColumns: readonly string[];
}

/**
 * `/finance/payments` reads its columns from `MATRIX_COLUMNS`, the registry
 * Part 3 Unit 1 already wrote — labels, notes and all. A second hardcoded list
 * here is exactly how the two would drift apart the first time a column is
 * renamed.
 */
const PAYMENT_COLUMNS: readonly SavedViewColumn[] = MATRIX_COLUMNS.map((c) => ({
  key: c.key,
  label: c.label,
  note: c.note,
}));

/**
 * The default set is every column — the screen shipped showing all twelve, and
 * a chooser that quietly hid columns on first load would look like data loss.
 */
const PAYMENT_DEFAULT = PAYMENT_COLUMNS.map((c) => c.key);

/**
 * `/finance/receivables` has NO chooser yet, and says so rather than pretending.
 *
 * Its table is milestone-level with hand-written headers (Project Name · Sales
 * Owner · Milestone (%) · Due Date · Amount · Pending · Received · Action) and
 * an Action cell that is a write control, not a figure. Turning that into a
 * registry is a rewrite of the table body, and doing it badly on a money screen
 * is worse than leaving the chooser off. An EMPTY column list is the honest
 * declaration: `ColumnChooser` renders nothing for it, and the screen still
 * gets saved views and an export that honours the filter.
 */
const RECEIVABLE_COLUMNS: readonly SavedViewColumn[] = [];

export const SAVED_VIEW_SCREENS: readonly SavedViewScreen[] = [
  {
    key: "finance.payments",
    label: "Payments Dashboard",
    path: "/finance/payments",
    capability: "billing.payment.view",
    params: ["stage", "q", "dues"],
    columns: PAYMENT_COLUMNS,
    defaultColumns: PAYMENT_DEFAULT,
  },
  {
    key: "finance.receivables",
    label: "Account Receivables",
    path: "/finance/receivables",
    capability: "billing.payment.view",
    params: ["bucket", "q"],
    columns: RECEIVABLE_COLUMNS,
    defaultColumns: [],
  },
];

export function findSavedViewScreen(key: string): SavedViewScreen | null {
  return SAVED_VIEW_SCREENS.find((s) => s.key === key) ?? null;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2. THE QUERY STRING — canonical, so two saves of one filter are one string
 * ════════════════════════════════════════════════════════════════════════════ */

/** The reserved param the column chooser writes. Never a screen filter. */
export const COLUMNS_PARAM = "cols";

export type QueryEntries = readonly (readonly [string, string])[];

/**
 * Reduce a URL's params to the ones this screen actually resolves, in a fixed
 * order, with empty values dropped.
 *
 * Order matters for a reason beyond tidiness: the chip that says "this is the
 * view you are looking at" compares strings, and `?q=a&dues=1` and
 * `?dues=1&q=a` are the same filter. Canonicalising here is what lets that
 * comparison be an equality rather than a parser.
 */
export function canonicalQuery(
  screen: SavedViewScreen,
  entries: QueryEntries,
): string {
  const out = new URLSearchParams();
  for (const param of screen.params) {
    const values = entries
      .filter(([k]) => k === param)
      .map(([, v]) => v.trim())
      .filter((v) => v !== "")
      .sort();
    for (const v of values) out.append(param, v);
  }
  // Columns last, and only when they differ from the default — a URL that
  // spells out the default set is noise, and two saves of the same screen
  // would then differ by whether the chooser had been opened.
  const cols = entries.filter(([k]) => k === COLUMNS_PARAM).map(([, v]) => v);
  if (cols.length) {
    const keys = parseColumns(screen, cols);
    const param = columnsParam(screen, keys);
    if (param) out.set(COLUMNS_PARAM, param);
  }
  return out.toString();
}

/** Canonicalise straight from a raw `?a=b&c=d` string (leading `?` optional). */
export function canonicalQueryFromString(
  screen: SavedViewScreen,
  raw: string,
): string {
  return canonicalQuery(screen, [
    ...new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw),
  ]);
}

/** `/finance/payments?stage=execution` — what a saved-view chip links to. */
export function viewHref(screen: SavedViewScreen, query: string): string {
  return query ? `${screen.path}?${query}` : screen.path;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. THE COLUMN CHOOSER
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve the visible columns from the URL.
 *
 * Three rules, each of which is a defect that would otherwise ship:
 *
 * - An UNKNOWN key is dropped, not rendered. A stale saved view naming a
 *   column that has since been renamed must not blow up the table.
 * - The order is the REGISTRY'S, never the URL's. Column order is a design
 *   decision (Inflow before Outflow before Result); letting a URL reorder it
 *   would let a saved view produce a table nobody designed.
 * - An EMPTY selection falls back to the defaults. A table of no columns is
 *   not a filtered table, it is a broken one.
 */
export function parseColumns(
  screen: SavedViewScreen,
  raw: string | readonly string[] | undefined | null,
): string[] {
  if (!screen.columns.length) return [];
  const values = raw == null ? [] : Array.isArray(raw) ? [...raw] : [String(raw)];
  const asked = new Set(
    values
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean),
  );
  if (!asked.size) return [...screen.defaultColumns];
  const known = screen.columns.filter((c) => asked.has(c.key)).map((c) => c.key);
  return known.length ? known : [...screen.defaultColumns];
}

/**
 * The `cols` value for a selection, or `null` when it IS the default set —
 * see `canonicalQuery`.
 */
export function columnsParam(
  screen: SavedViewScreen,
  keys: readonly string[],
): string | null {
  const chosen = screen.columns.filter((c) => keys.includes(c.key)).map((c) => c.key);
  if (!chosen.length) return null;
  const isDefault =
    chosen.length === screen.defaultColumns.length &&
    chosen.every((k) => screen.defaultColumns.includes(k));
  return isDefault ? null : chosen.join(",");
}

/** The chooser's checkbox list: every column, with whether it is on. */
export function columnChoices(
  screen: SavedViewScreen,
  visible: readonly string[],
): { key: string; label: string; note?: string; checked: boolean }[] {
  return screen.columns.map((c) => ({
    key: c.key,
    label: c.label,
    note: c.note,
    checked: visible.includes(c.key),
  }));
}

/** "8 of 12 columns" — the chooser's own denominator (§11). */
export function describeColumns(
  screen: SavedViewScreen,
  visible: readonly string[],
): string {
  const total = screen.columns.length;
  const n = visible.length;
  return n === total
    ? `All ${total} columns`
    : `${n} of ${total} columns`;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 4. SAVED VIEWS — naming, matching, ordering
 * ════════════════════════════════════════════════════════════════════════════ */

/** Matches the `saved_views_name_len` CHECK in migration 0043. */
export const VIEW_NAME_MAX = 40;

export interface SavedView {
  id: string;
  screen: string;
  name: string;
  /** The canonical query string, without a leading `?`. */
  query: string;
}

export type NameResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * A view name is trimmed, non-empty and at most 40 characters. The limit lives
 * here and in the CHECK constraint both, because a limit only the browser
 * knows is not a limit (the precedent 0040 set for `roles.description`).
 */
export function validateViewName(raw: string | null | undefined): NameResult {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give this view a name." };
  if (name.length > VIEW_NAME_MAX)
    return {
      ok: false,
      error: `A view name is at most ${VIEW_NAME_MAX} characters — this one is ${name.length}.`,
    };
  return { ok: true, name };
}

/** The view whose saved query IS the current one, if any. */
export function activeView(
  views: readonly SavedView[],
  currentQuery: string,
): SavedView | null {
  return views.find((v) => v.query === currentQuery) ?? null;
}

/**
 * Views for one screen, newest-name-order-independent: alphabetical, because
 * a chip row people scan is easier to scan sorted, and case-insensitively so
 * "ageing" and "Ageing" do not split the alphabet.
 */
export function viewsForScreen(
  views: readonly SavedView[],
  screen: SavedViewScreenKey,
): SavedView[] {
  return views
    .filter((v) => v.screen === screen)
    .slice()
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/**
 * Whether saving would REPLACE an existing view rather than add one. The
 * unique index is `(org_id, member_id, screen, lower(name))`, so this predicate
 * and the constraint have to agree about what "the same name" means.
 */
export function replacesExisting(
  views: readonly SavedView[],
  screen: SavedViewScreenKey,
  name: string,
): SavedView | null {
  const lower = name.trim().toLowerCase();
  return (
    viewsForScreen(views, screen).find((v) => v.name.toLowerCase() === lower) ?? null
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 5. CSV
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * One cell, escaped.
 *
 * This is the same rule `lib/hr-model.ts::attendanceCsv` applies, with `\r`
 * added to the trigger set: a value carrying a bare CR would otherwise break a
 * row in Excel. Matching that convention rather than inventing a second one is
 * the point — an em dash for "we do not know" stays an em dash, and ₹ figures
 * arrive already formatted in Indian grouping from `inr()`, so the CSV reads
 * exactly like the screen.
 */
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Headers plus rows, CRLF-joined. The BOM is added at download time. */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  return [headers, ...rows]
    .map((r) => r.map((c) => csvCell(c)).join(","))
    .join("\r\n");
}

/**
 * "14 rows × 8 columns · Stage: Execution".
 *
 * The brief's rule: an export that silently ignores the filter is worse than
 * no export, so the button SAYS what it is about to write — the row count, the
 * column count, and the filter chip in the same words the screen uses. A
 * figure without its denominator is not trustworthy (§11), and "how many rows"
 * is that denominator here.
 */
export function describeExport(
  rowCount: number,
  columnCount: number,
  filterChip?: string | null,
): string {
  const rows = `${rowCount} row${rowCount === 1 ? "" : "s"}`;
  const cols = `${columnCount} column${columnCount === 1 ? "" : "s"}`;
  return filterChip ? `${rows} × ${cols} · ${filterChip}` : `${rows} × ${cols}`;
}

/**
 * The download filename. Dated, so two exports a week apart do not overwrite
 * each other in a Downloads folder, and suffixed when the export is filtered
 * so nobody mails a partial extract believing it is the whole book.
 */
export function csvFilename(
  screen: SavedViewScreen,
  today: string,
  filtered: boolean,
): string {
  const slug = screen.key.replace(/\./g, "-");
  return `${slug}-${today}${filtered ? "-filtered" : ""}.csv`;
}
