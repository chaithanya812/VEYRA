"use client";

import { useActionState, useMemo, useState } from "react";
import {
  BarChart3,
  Eye,
  EyeOff,
  IndianRupee,
  List,
  Plus,
  RotateCcw,
  Undo2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/patterns";
import { BarList } from "@/components/ui/charts";
import {
  StatTile,
  TileGrid,
  FormError,
  SubmitButton,
} from "../../../dashboard/workspace-ui";
import {
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABELS,
  PAYMENT_MODES,
  PAYMENT_MODE_LABELS,
  buildLedger,
  byMonth,
  groupBy,
  type LedgerEntry,
  type LedgerSide,
  type Slice,
} from "@/lib/payments-ledger-model";
import { seriesColor } from "@/lib/palette";
import type { ProjectLedger } from "@/lib/data/finance";
import { addEntryAction, reverseEntryAction, type PayState } from "./actions";
import { cn, fmtDate, inr } from "@/lib/utils";

/**
 * Project Payments (PLAN-V4 §9.4, frames `105403` / `105429` / `105444`).
 *
 * Three things the frame gets right and this screen keeps:
 *
 * 1. **Transaction Date and Recorded Date are separate columns** — when it
 *    happened, and when somebody typed it in. They differ constantly on a real
 *    site, and only one of them can be edited.
 * 2. **Reversed transactions are a checkbox, not a delete.** The money moved.
 * 3. **Funds must have a contract; expenses need not.** Money in is always
 *    against something the client agreed to pay; money out is sometimes just
 *    money out.
 *
 * Both Listing and Analytics exist for both sides — the owner was explicit that
 * both must be there, and every analytic carries a Chart | Table toggle so a
 * chart is never shown without the numbers behind it.
 */
const initial: PayState = undefined;

export function PaymentsView({
  projectId,
  ledger,
  initialSide,
}: {
  projectId: string;
  ledger: ProjectLedger;
  initialSide: string;
}) {
  const [side, setSide] = useState<LedgerSide>(
    initialSide === "funds" ? "funds" : "expenses",
  );
  const [mode, setMode] = useState<"listing" | "analytics">("listing");
  const [showReversed, setShowReversed] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);

  const entries = side === "funds" ? ledger.funds : ledger.expenses;
  const view = useMemo(() => buildLedger(entries, showReversed), [entries, showReversed]);

  const nameOf = useMemo(
    () => ({
      vendor: new Map(ledger.vendors.map((v) => [v.id, v.name])),
      member: new Map(ledger.members.map((m) => [m.id, m.name])),
      contract: new Map(ledger.contracts.map((c) => [c.id, c.name])),
    }),
    [ledger],
  );

  const s = ledger.summary;

  return (
    <>
      {/* ── Financial summary, with the 👁 hide the frame has ── */}
      <Card className="mb-5 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Financial summary
          </h2>
          <button
            type="button"
            onClick={() => setHideMoney((h) => !h)}
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
          >
            {hideMoney ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {hideMoney ? "Show figures" : "Hide figures"}
          </button>
        </div>

        {hideMoney ? (
          <p className="rounded-md bg-[var(--color-surface-sunken)] px-3 py-6 text-center text-[12px] text-[var(--color-ink-secondary)]">
            Figures hidden. Useful when this screen is on a projector or a site
            tablet.
          </p>
        ) : (
          <>
            {/* `Committed` (agreed less disbursed) and `Billed` (work signed
                off) were one label, "Total payables", meaning two things.
                Settled 2026-09-04: both ship, both say what they are. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Figure label="Funds received" value={s.funds} tone="green" />
              <Figure label="Disbursed" value={s.disbursed} />
              <Figure
                label="Receivable dues"
                value={s.receivableDues}
                tone="amber"
                hint="Billed less received"
              />
              <Figure
                label="Committed"
                value={s.committed}
                hint="Agreed less disbursed"
              />
              <Figure label="Billed" value={s.billed} hint="Work signed off" />
              <Figure
                label="Dues"
                value={s.payableDues}
                tone="amber"
                hint="Billed less disbursed"
              />
            </div>
            <div className="mt-4">
              <TileGrid>
                <StatTile
                  hero
                  label="Cash flow"
                  value={inr(s.cashFlow)}
                  hint="Received less disbursed"
                  tone={s.cashFlow < 0 ? "negative" : "positive"}
                  icon={<Wallet className="size-4" />}
                />
                <StatTile
                  label="Expected P&L"
                  value={inr(s.expectedPnl)}
                  hint="Project value less estimated expenses"
                  tone={s.expectedPnl < 0 ? "negative" : "info"}
                  icon={<IndianRupee className="size-4" />}
                />
              </TileGrid>
            </div>
          </>
        )}
      </Card>

      {/* ── Which side, and how you want to look at it ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Ledger side"
            value={side}
            onChange={(v) => setSide(v)}
            options={[
              { value: "expenses", label: "Expenses", badge: ledger.expenses.length },
              { value: "funds", label: "Funds", badge: ledger.funds.length },
            ]}
          />
          <SegmentedControl
            label="View"
            size="sm"
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: "listing", label: "Listing", icon: <List className="size-3.5" /> },
              { value: "analytics", label: "Analytics", icon: <BarChart3 className="size-3.5" /> },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "tabular text-[13px] font-medium",
              side === "funds" ? "text-[var(--color-green)]" : "text-[var(--color-ink)]",
            )}
          >
            {side === "funds" ? "Total funds" : "Total expenses"}:{" "}
            {side === "funds" ? "+" : "−"}
            {inr(view.total)}
          </span>
          <AddEntryDialog projectId={projectId} side={side} ledger={ledger} />
        </div>
      </div>

      {mode === "listing" ? (
        <>
          <label className="mb-2 flex w-fit items-center gap-2 text-[12px] text-[var(--color-ink-secondary)]">
            <input
              type="checkbox"
              checked={showReversed}
              onChange={(e) => setShowReversed(e.target.checked)}
              className="size-4 accent-[var(--color-red)]"
            />
            View reversed transactions
            {view.hiddenCount > 0 && !showReversed && (
              <span className="tabular">({view.hiddenCount} hidden)</span>
            )}
          </label>

          <Listing
            projectId={projectId}
            view={view}
            side={side}
            names={nameOf}
          />
        </>
      ) : (
        <Analytics
          entries={buildLedger(entries, false).rows}
          side={side}
          names={nameOf}
        />
      )}
    </>
  );
}

/* ── Figures ──────────────────────────────────────────────────────────────── */

function Figure({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber";
  /** The two numbers a difference came from, printed beside it (§11). */
  hint?: string;
}) {
  const negative = value < 0;
  return (
    <div>
      <p className="text-[11px] text-[var(--color-ink-secondary)]">{label}</p>
      <p
        className={cn(
          "tabular text-[15px] font-semibold",
          negative
            ? "text-[var(--color-red)]"
            : tone === "green"
              ? "text-[var(--color-green)]"
              : tone === "amber"
                ? "text-[var(--color-amber)]"
                : "text-[var(--color-ink)]",
        )}
      >
        {inr(value)}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-tight text-[var(--color-ink-secondary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ── Listing ──────────────────────────────────────────────────────────────── */

interface Names {
  vendor: Map<string, string>;
  member: Map<string, string>;
  contract: Map<string, string>;
}

function Listing({
  projectId,
  view,
  side,
  names,
}: {
  projectId: string;
  view: ReturnType<typeof buildLedger>;
  side: LedgerSide;
  names: Names;
}) {
  const [state, reverse] = useActionState(reverseEntryAction, initial);

  if (view.rows.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-ink)]">
          {side === "funds" ? "No funds collected yet" : "No expenses recorded yet"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-ink-secondary)]">
          {side === "funds"
            ? "A fund is money in against a client contract — that is what makes it a receipt rather than an unexplained credit."
            : "Record what the project has actually spent. An expense does not need a contract; site spend often has none."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {state?.error && (
        <p className="border-b border-[var(--color-border)] bg-[var(--color-red-tint)] px-4 py-2 text-[12px] text-[var(--color-red-hover)]">
          {state.error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
              <th className="px-4 py-2 font-medium">ID</th>
              {/* Two dates, on purpose: when it happened, and when it was typed. */}
              <th className="px-4 py-2 font-medium">Transaction date</th>
              <th className="px-4 py-2 font-medium">Recorded date</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">{side === "funds" ? "Collected by" : "Expense by"}</th>
              {side === "expenses" && <th className="px-4 py-2 font-medium">Vendor</th>}
              <th className="px-4 py-2 font-medium">Contract</th>
              <th className="px-4 py-2 font-medium">Source</th>
              {side === "expenses" && <th className="px-4 py-2 font-medium">Type</th>}
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Remarks</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {view.rows.map((e) => {
              const reversed = view.reversedIds.has(e.id);
              const isReversal = view.reversalIds.has(e.id);
              return (
                <tr
                  key={e.id}
                  className={cn(
                    "border-b border-[var(--color-border)] last:border-0",
                    (reversed || isReversal) && "bg-[var(--color-surface-sunken)]",
                  )}
                >
                  <td className="px-4 py-2.5 font-mono text-[11px] uppercase text-[var(--color-ink-secondary)]">
                    {e.id.slice(0, 7)}
                    {/* Never colour alone — the state is spelled out. */}
                    {reversed && (
                      <span className="ml-1.5 rounded-full bg-[var(--color-border)] px-1.5 py-px text-[10px] font-medium text-[var(--color-ink-secondary)]">
                        Reversed
                      </span>
                    )}
                    {isReversal && (
                      <span className="ml-1.5 rounded-full bg-[var(--color-border)] px-1.5 py-px text-[10px] font-medium text-[var(--color-ink-secondary)]">
                        Reversal
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular">{fmtDate(e.paid_on)}</td>
                  <td className="px-4 py-2.5 tabular text-[var(--color-ink-secondary)]">
                    {fmtDate(e.created_at)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular font-medium",
                      side === "funds"
                        ? "text-[var(--color-green)]"
                        : "text-[var(--color-ink)]",
                      Number(e.amount) < 0 && "text-[var(--color-ink-secondary)]",
                    )}
                  >
                    {side === "funds" && Number(e.amount) > 0 ? "+" : ""}
                    {inr(e.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {e.member_id ? (names.member.get(e.member_id) ?? "—") : "—"}
                  </td>
                  {side === "expenses" && (
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {e.vendor_id ? (names.vendor.get(e.vendor_id) ?? "—") : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {e.contract_id ? (names.contract.get(e.contract_id) ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {e.mode
                      ? (PAYMENT_MODE_LABELS[e.mode as keyof typeof PAYMENT_MODE_LABELS] ?? e.mode)
                      : "—"}
                  </td>
                  {side === "expenses" && (
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {e.expense_type
                        ? (EXPENSE_TYPE_LABELS[e.expense_type as keyof typeof EXPENSE_TYPE_LABELS] ??
                          e.expense_type)
                        : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {e.category ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                    {e.note ?? e.reference ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {!reversed && !isReversal && (
                      <form action={reverse}>
                        <input type="hidden" name="project_id" value={projectId} />
                        <input type="hidden" name="id" value={e.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Reverse — appends a correcting entry, deletes nothing"
                        >
                          <Undo2 className="size-3.5" />
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Analytics ────────────────────────────────────────────────────────────── */

function Analytics({
  entries,
  side,
  names,
}: {
  entries: LedgerEntry[];
  side: LedgerSide;
  names: Names;
}) {
  const byCategory = useMemo(() => groupBy(entries, (e) => e.category, (k) => k, "No category"), [entries]);
  const byVendor = useMemo(
    () => groupBy(entries, (e) => e.vendor_id, (k) => names.vendor.get(k) ?? "Removed vendor", "No vendor"),
    [entries, names],
  );
  const byContract = useMemo(
    () => groupBy(entries, (e) => e.contract_id, (k) => names.contract.get(k) ?? "Removed contract", "No contract"),
    [entries, names],
  );
  const months = useMemo(() => byMonth(entries), [entries]);

  if (entries.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <BarChart3 className="mx-auto size-5 text-[var(--color-ink-disabled)]" />
        <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
          Nothing to analyse yet
        </p>
        <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">
          Record a few {side === "funds" ? "receipts" : "expenses"} and the
          breakdowns fill in.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnalyticCard title="By month" slices={months} />
      <AnalyticCard title="By category" slices={byCategory} />
      {side === "expenses" && <AnalyticCard title="By vendor" slices={byVendor} />}
      <AnalyticCard title="By contract" slices={byContract} />
    </div>
  );
}

/**
 * Every analytic gets a **Chart | Table** toggle (`105716`, and the owner's
 * rule): a chart without the numbers behind it is a picture, not a report.
 */
function AnalyticCard({
  title,
  slices,
}: {
  title: string;
  slices: Slice[];
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
        <SegmentedControl
          label={`${title} view`}
          size="sm"
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      {slices.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-[var(--color-ink-secondary)]">
          Nothing in this breakdown yet.
        </p>
      ) : view === "chart" ? (
        /* Bars, not a donut. The frames use donuts for these breakdowns, but a
           donut sizes segments by share and hides the amount — and the amount
           is the thing anyone reading a spend breakdown actually wants. Ranked
           bars carry the rupee figure at the end of each row. */
        <BarList
          rows={slices.map((sl, i) => ({
            key: sl.key,
            label: sl.label,
            value: sl.value,
            display: `${inr(sl.value)} · ${sl.count}`,
            color: seriesColor(i),
          }))}
        />
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
              <th className="py-1.5 font-medium">{title.replace("By ", "")}</th>
              <th className="py-1.5 text-right font-medium">Entries</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
              <th className="py-1.5 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr key={s.key} className="border-t border-[var(--color-border)]">
                <td className="py-1.5 text-[var(--color-ink)]">{s.label}</td>
                <td className="py-1.5 text-right tabular text-[var(--color-ink-secondary)]">
                  {s.count}
                </td>
                <td className="py-1.5 text-right tabular text-[var(--color-ink)]">
                  {inr(s.value)}
                </td>
                {/* The share always travels with its denominator. */}
                <td className="py-1.5 text-right tabular text-[var(--color-ink-secondary)]">
                  {s.pct}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border-strong)] font-semibold">
              <td className="py-1.5 text-[var(--color-ink)]">Total</td>
              <td className="py-1.5 text-right tabular">
                {slices.reduce((a, s) => a + s.count, 0)}
              </td>
              <td className="py-1.5 text-right tabular">{inr(total)}</td>
              <td className="py-1.5 text-right tabular">100%</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  );
}

/* ── Add ──────────────────────────────────────────────────────────────────── */

function AddEntryDialog({
  projectId,
  side,
  ledger,
}: {
  projectId: string;
  side: LedgerSide;
  ledger: ProjectLedger;
}) {
  const [open, setOpen] = useState(false);
  const [state, add] = useActionState(addEntryAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  const fund = side === "funds";
  // Money in must be against a CLIENT contract; money out may sit against any
  // contract, or none at all.
  const contracts = fund
    ? ledger.contracts.filter((c) => c.source === "client")
    : ledger.contracts;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="size-4" /> {fund ? "Add fund" : "Add expense"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fund ? "Record a fund" : "Record an expense"}</DialogTitle>
          <DialogDescription>
            {fund
              ? "Money received against a client contract. The contract is required — that is what makes this a receipt rather than an unexplained credit."
              : "Money the project spent. A contract is optional; site spend often has none."}
          </DialogDescription>
        </DialogHeader>

        <form action={add} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="side" value={side} />
          <FormError error={state?.error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor="pe_amount" required>
              <Input
                id="pe_amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                className="tabular"
              />
            </Field>
            <Field
              label="Transaction date"
              htmlFor="pe_date"
              required
              hint="When it happened — the recorded date is stamped automatically."
            >
              <Input
                id="pe_date"
                name="paid_on"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          </div>

          <Field
            label={fund ? "Contract" : "Contract"}
            htmlFor="pe_contract"
            required={fund}
            hint={fund ? undefined : "Optional — leave blank for miscellaneous spend."}
          >
            <Select id="pe_contract" name="contract_id" defaultValue="" required={fund}>
              <option value="">{fund ? "Select a contract" : "No contract"}</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" htmlFor="pe_mode" required>
              <Select id="pe_mode" name="mode" defaultValue="company_account" required>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_MODE_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={fund ? "Collected by" : "Expense by"} htmlFor="pe_member">
              <Select id="pe_member" name="member_id" defaultValue="">
                <option value="">Me</option>
                {ledger.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {!fund && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vendor" htmlFor="pe_vendor">
                  <Select id="pe_vendor" name="vendor_id" defaultValue="">
                    <option value="">No vendor</option>
                    {ledger.vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Expense type" htmlFor="pe_type">
                  <Select id="pe_type" name="expense_type" defaultValue="">
                    <option value="">Not set</option>
                    {EXPENSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {EXPENSE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Category" htmlFor="pe_category">
                <Select id="pe_category" name="category" defaultValue="">
                  <option value="">No category</option>
                  {ledger.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>

              <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
                <input
                  type="checkbox"
                  name="stock_in_requested"
                  className="mt-0.5 size-4 accent-[var(--color-red)]"
                />
                <span>
                  Raise a stock-in request
                  <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                    Flags this expense as material arriving on site. It feeds
                    Inventory&apos;s Expense StockIn queue.
                  </span>
                </span>
              </label>
            </>
          )}

          <Field label="Reference" htmlFor="pe_ref">
            <Input id="pe_ref" name="reference" placeholder="Bill / UTR number" />
          </Field>

          <Field label="Remarks" htmlFor="pe_note">
            <Textarea id="pe_note" name="note" rows={2} maxLength={250} />
          </Field>

          <div>
            <SubmitButton pendingLabel="Recording…">
              {fund ? "Add fund" : "Add expense"}
            </SubmitButton>
          </div>
        </form>

        <p className="border-t border-[var(--color-border)] pt-3 text-[11px] text-[var(--color-ink-secondary)]">
          <RotateCcw className="mr-1 inline size-3" />
          Entries are never deleted. A mistake is corrected with a reversing
          entry that stays in the ledger beside it.
        </p>
      </DialogContent>
    </Dialog>
  );
}
