import { num, round2 } from "./finance-model";
import {
  buildLedger,
  type LedgerEntry,
  type LedgerView,
} from "./payments-ledger-model";
import type { ExpenseClaim } from "./workspace-model";

/**
 * Petty Finance — PLAN-V4 §12.2, frame `110521`.
 *
 * The owner: *"imagine I click a person's name… I get petty finance, my
 * dashboard, my expense, my fund."* So this module reads the SAME expense
 * ledger the workspace already writes, sliced per person instead of per
 * project, and adds exactly one idea to it: a claim is either money somebody
 * **spent** (an expense) or petty cash somebody **received** (a fund), and the
 * difference between the two is their balance.
 *
 * Three things this file refuses to do, each of them deliberate.
 *
 * 1. **It does not re-implement reversals.** `buildLedger` in
 *    `payments-ledger-model.ts` already hides BOTH halves of a reversed pair
 *    and excludes them from the total in either mode. Petty rows are adapted
 *    into its shape and handed over. A second reversal implementation is a
 *    second set of totals that will eventually disagree with the first.
 *
 * 2. **It never derives one date from the other.** `spent_on` is typed by a
 *    person and `created_at` is stamped by the database; `110521` shows both
 *    columns because on a real site they differ, and a screen that showed one
 *    twice would be quietly lying about when money moved.
 *
 * 3. **It stores no balance.** HARD RULE 6 — a balance is funds minus
 *    expenses, recomputed every render from rows that cannot disagree with it.
 */

/* ── Vocabulary ───────────────────────────────────────────────────────────── */

export const PETTY_KINDS = ["expense", "fund"] as const;
export type PettyKind = (typeof PETTY_KINDS)[number];

/** The frame's centre toggle, in its own words. */
export const PETTY_KIND_LABELS: Record<PettyKind, string> = {
  expense: "All Expenses",
  fund: "All Funds",
};

/** The same two words where a toggle is not what is being labelled. */
export const PETTY_KIND_NOUNS: Record<PettyKind, string> = {
  expense: "Expense",
  fund: "Fund",
};

export const PETTY_TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "my-expense", label: "My Expense" },
  { key: "my-fund", label: "My Fund" },
] as const;
export type PettyTab = (typeof PETTY_TABS)[number]["key"];

export function isPettyTab(v: string | undefined | null): v is PettyTab {
  return PETTY_TABS.some((t) => t.key === v);
}

/** Which side of the ledger a tab writes, so no screen types the string. */
export function kindForTab(tab: PettyTab): PettyKind {
  return tab === "my-fund" ? "fund" : "expense";
}

export function isPettyKind(v: string | undefined | null): v is PettyKind {
  return v === "expense" || v === "fund";
}

/**
 * `110521` renders a project that no longer resolves as `Deleted Project`, and
 * that is right: the money really was spent, and blanking the cell would make
 * a real row look like a data-entry mistake.
 */
export const DELETED_PROJECT = "Deleted Project";

/* ── The row ──────────────────────────────────────────────────────────────── */

/**
 * An `expense_claims` row as Petty Finance sees it.
 *
 * The three 0041 columns are OPTIONAL on purpose: reads use `select("*")`, so
 * before the migration is applied they simply arrive undefined and every row
 * behaves as the plain expense it has always been. A read that named them
 * explicitly would empty the whole table instead (HANDOFF-V8 §11).
 */
export interface PettyClaim extends ExpenseClaim {
  /** 0041. Absent = 'expense', which is what every pre-0041 row is. */
  kind?: string | null;
  /** 0041. Set on the correcting row, pointing at the row it cancels. */
  reversal_of?: string | null;
  /** 0041. `110521`'s Vendor column; null for most petty spend. */
  vendor_id?: string | null;
}

export function kindOf(claim: PettyClaim): PettyKind {
  return claim.kind === "fund" ? "fund" : "expense";
}

/** The date a person typed. Never the stamp. */
export function transactionDateOf(claim: PettyClaim): string {
  return claim.spent_on;
}

/** The moment the row was written. Never typeable, never the transaction date. */
export function recordedAtOf(claim: PettyClaim): string {
  return claim.created_at;
}

/** `110521`'s short ID column — the row's own id, not a second number. */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * The project name a ledger row shows.
 *
 * Resolves the FK first, falls back to the label the row carried when it was
 * written, and only then says `Deleted Project`. All three states are real:
 * a live project, a project referenced by name before 0028's backfill, and a
 * project that has since gone.
 */
export function projectNameFor(
  claim: PettyClaim,
  names: Record<string, string>,
): string {
  const byId = claim.project_id ? names[claim.project_id] : undefined;
  if (byId && byId.trim()) return byId;
  const label = claim.project_label?.trim();
  if (label) return label;
  return DELETED_PROJECT;
}

/* ── Adapting to the shared ledger ────────────────────────────────────────── */

/**
 * A petty claim in `buildLedger`'s shape.
 *
 * `paid_on` takes `spent_on` because that is what the shared model means by
 * "the transaction date" — the same mapping project payments use. The direction
 * follows the kind: a fund is money in, an expense is money out.
 */
export function toLedgerEntry(claim: PettyClaim): LedgerEntry {
  return {
    id: claim.id,
    contract_id: null,
    milestone_id: null,
    project_id: claim.project_id ?? null,
    project_label: claim.project_label ?? null,
    direction: kindOf(claim) === "fund" ? "inflow" : "outflow",
    amount: num(claim.amount),
    mode: null,
    paid_on: claim.spent_on,
    reference: shortId(claim.id),
    note: claim.remark ?? null,
    created_at: claim.created_at,
    member_id: claim.member_id,
    category: claim.category ?? null,
    reversal_of: claim.reversal_of ?? null,
  };
}

export interface PettyLedgers {
  expense: LedgerView;
  fund: LedgerView;
}

/**
 * Both sides of the ledger, built independently.
 *
 * Split by kind BEFORE `buildLedger` runs so a reversal always sits beside the
 * row it cancels: a reversal carries the kind of its original, so the pair can
 * never land on opposite sides and half-cancel.
 */
export function pettyLedgers(
  claims: PettyClaim[],
  showReversed: boolean,
): PettyLedgers {
  const of = (k: PettyKind) =>
    buildLedger(
      claims.filter((c) => kindOf(c) === k).map(toLedgerEntry),
      showReversed,
    );
  return { expense: of("expense"), fund: of("fund") };
}

/* ── Per-user cards ───────────────────────────────────────────────────────── */

export interface PettyUserCard {
  memberId: string;
  name: string;
  expense: number;
  fund: number;
  /** Funds received minus money spent. Negative means overdrawn. */
  balance: number;
  /** Rows still standing for this person — reversed pairs already removed. */
  count: number;
}

/**
 * One card per member, in the frame's left rail.
 *
 * Every member with a card OR a claim appears, including members whose month is
 * empty: a rail that hid people with nothing this month would make an absent
 * person indistinguishable from a person who has not been paid.
 */
export function pettyUserCards(
  claims: PettyClaim[],
  members: { id: string; name: string }[],
): PettyUserCard[] {
  const totals = new Map<string, { expense: number; fund: number; count: number }>();

  // Reversed pairs are dropped on BOTH sides before anybody is totalled, which
  // is why this reads through buildLedger rather than summing `claims`.
  const { expense, fund } = pettyLedgers(claims, false);
  for (const [k, view] of [["expense", expense], ["fund", fund]] as const) {
    for (const row of view.rows) {
      const id = row.member_id ?? "";
      const cur = totals.get(id) ?? { expense: 0, fund: 0, count: 0 };
      cur[k] += num(row.amount);
      cur.count += 1;
      totals.set(id, cur);
    }
  }

  const named = new Map(members.map((m) => [m.id, m.name]));
  const ids = new Set<string>([...named.keys(), ...totals.keys()]);

  return [...ids]
    .map((id) => {
      const t = totals.get(id) ?? { expense: 0, fund: 0, count: 0 };
      return {
        memberId: id,
        name: named.get(id) ?? "Former member",
        expense: round2(t.expense),
        fund: round2(t.fund),
        balance: round2(t.fund - t.expense),
        count: t.count,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface PettySummary {
  balance: number;
  expense: number;
  fund: number;
  /**
   * Σ of the balances that are negative, as a POSITIVE magnitude — the frame's
   * `Overdrawn Balance`. Kept apart from `balance` because one person ₹5,000
   * overdrawn and another ₹5,000 in credit net to zero, and the zero is the
   * least useful thing anybody could be told.
   */
  overdrawn: number;
  /** The denominator `overdrawn` came from: how many people are overdrawn. */
  overdrawnMembers: number;
  /** How many people the tiles are summed over. */
  members: number;
}

export function pettySummary(cards: PettyUserCard[]): PettySummary {
  let expense = 0;
  let fund = 0;
  let overdrawn = 0;
  let overdrawnMembers = 0;

  for (const c of cards) {
    expense += c.expense;
    fund += c.fund;
    if (c.balance < 0) {
      overdrawn += -c.balance;
      overdrawnMembers += 1;
    }
  }

  return {
    balance: round2(fund - expense),
    expense: round2(expense),
    fund: round2(fund),
    overdrawn: round2(overdrawn),
    overdrawnMembers,
    members: cards.length,
  };
}

/* ── The month stepper ────────────────────────────────────────────────────── */

export interface PettyMonth {
  year: number;
  month: number; // 1-12
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel({ year, month }: PettyMonth): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/** `[Month) (Year]` — one step either way, rolling the year over correctly. */
export function stepMonth({ year, month }: PettyMonth, delta: number): PettyMonth {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 };
}

/**
 * Resolve the stepper from URL parameters, falling back to a given "today".
 * Taking today as an argument is what makes this testable — a model that read
 * the clock could only be tested in the month it was written.
 */
export function resolveMonth(
  raw: { y?: string | null; m?: string | null },
  today: Date,
): PettyMonth {
  const y = Number(raw.y);
  const m = Number(raw.m);
  const okY = Number.isInteger(y) && y >= 2000 && y <= 2100;
  const okM = Number.isInteger(m) && m >= 1 && m <= 12;
  if (okY && okM) return { year: y, month: m };
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/** `YYYY-MM` for the month, the prefix `spent_on` is matched against. */
export function monthPrefix({ year, month }: PettyMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/* ── Filtering ────────────────────────────────────────────────────────────── */

export interface PettyFilter {
  month: PettyMonth;
  /** Scope the whole page to one person, per the frame's clickable user card. */
  memberId?: string | null;
}

/**
 * Narrow to a month, and optionally to one person.
 *
 * The month is matched on the TRANSACTION date. A receipt typed up in October
 * for petty cash spent in September belongs to September — that is what the
 * person who spent it will look for, and it is the only reading under which the
 * per-user balances mean anything.
 */
export function filterClaims(
  claims: PettyClaim[],
  filter: PettyFilter,
): PettyClaim[] {
  const prefix = monthPrefix(filter.month);
  return claims.filter((c) => {
    if (transactionDateOf(c).slice(0, 7) !== prefix) return false;
    if (filter.memberId && c.member_id !== filter.memberId) return false;
    return true;
  });
}

/** The frame's user search — matches a card by name, case-insensitively. */
export function matchesUserSearch(name: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return name.toLowerCase().includes(needle);
}

/* ── Writing ──────────────────────────────────────────────────────────────── */

/**
 * The row that reverses a petty claim: same person, same project, same
 * category, opposite sign, pointing back at what it cancels.
 *
 * Returned as a plain object for the caller to write — this file computes, it
 * does not touch the database. Mirrors `reversalOf` in the payments ledger
 * rather than inventing a second shape for the same idea.
 */
export function pettyReversalOf(claim: PettyClaim): {
  member_id: string;
  project_id: string | null;
  project_label: string | null;
  spent_on: string;
  amount: number;
  category: string;
  kind: PettyKind;
  vendor_id: string | null;
  reversal_of: string;
  status: string;
  remark: string;
} {
  return {
    member_id: claim.member_id,
    project_id: claim.project_id ?? null,
    project_label: claim.project_label ?? null,
    // The reversal happened when the mistake was found, but it corrects a
    // transaction that happened when it happened — so it carries the original
    // date. `created_at` is what says when the correction was made.
    spent_on: claim.spent_on,
    // Negative, so the ledger foots without anybody subtracting by hand.
    amount: round2(-num(claim.amount)),
    category: claim.category,
    kind: kindOf(claim),
    vendor_id: claim.vendor_id ?? null,
    reversal_of: claim.id,
    status: claim.status,
    remark: `Reversal of ${shortId(claim.id)}`,
  };
}

/**
 * Validate what a person typed into `110521`'s expense/fund form.
 *
 * Amounts are CONFIG — a person types them and this checks them; nothing here
 * invents one (HARD RULE 2).
 */
export function validatePettyEntry(input: {
  amount: unknown;
  spent_on: unknown;
  kind: unknown;
}): { ok: true; amount: number; spent_on: string; kind: PettyKind } | { ok: false; error: string } {
  const raw = input.amount;
  const amount = num(typeof raw === "string" || typeof raw === "number" ? raw : 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  const spent_on = String(input.spent_on ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spent_on)) {
    return { ok: false, error: "Pick the date the money moved." };
  }
  const kind = String(input.kind ?? "expense");
  if (!isPettyKind(kind)) {
    return { ok: false, error: "A petty entry is either an expense or a fund." };
  }
  return { ok: true, amount: round2(amount), spent_on, kind };
}
