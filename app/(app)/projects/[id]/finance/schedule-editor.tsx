"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FormError, SubmitButton } from "../../../dashboard/workspace-ui";
import {
  amountFromPct,
  clampPct,
  pctFromAmount,
  round2,
  scheduleTotals,
  splitEvenly,
  type Milestone,
} from "@/lib/finance-model";
import { saveScheduleAction, type FinState } from "./actions";
import { cn, inr } from "@/lib/utils";

/**
 * The payment schedule (PLAN-V4 §9.3, frame `105238`).
 *
 * Three mechanics from the frame, and each one is here for a reason a person
 * would recognise:
 *
 * 1. **Percentage and Amount are two-way bound** — the ⟲ on the frame's column
 *    header. Type either and the other follows from the contract value, so a
 *    schedule can be built the way the conversation actually went ("40% on
 *    signing" or "eight lakhs on signing"), not the way the form prefers.
 * 2. **The total must be 100%.** Saving is blocked otherwise, in the browser
 *    AND on the server. A schedule billing 90% of a contract loses the last
 *    10% until the final invoice comes up short.
 * 3. **Actual Due appears only once Work Done is ticked** — ticking it is what
 *    makes a milestone billable, and that is the whole receivables engine.
 *
 * Nothing here is stored until Save: the running total is the point of the
 * screen, so it has to update as you type.
 */
const initial: FinState = undefined;

interface Row {
  id: string | null;
  name: string;
  pct: number;
  amount: number;
  tentative_due: string | null;
  work_done: boolean;
  actual_due: string | null;
}

function toRow(m: Milestone): Row {
  return {
    id: m.id,
    name: m.name,
    pct: Number(m.pct) || 0,
    amount: Number(m.amount) || 0,
    tentative_due: m.tentative_due,
    work_done: !!m.work_done,
    actual_due: m.actual_due,
  };
}

export function ScheduleEditor({
  projectId,
  contractId,
  contractAmount,
  milestones,
}: {
  projectId: string;
  contractId: string;
  contractAmount: number;
  milestones: Milestone[];
}) {
  const [rows, setRows] = useState<Row[]>(() => milestones.map(toRow));
  const [state, save] = useActionState(saveScheduleAction, initial);

  const totals = useMemo(() => scheduleTotals(rows, contractAmount), [rows, contractAmount]);

  function patch(i: number, next: Partial<Row>) {
    setRows((cur) => cur.map((r, j) => (i === j ? { ...r, ...next } : r)));
  }

  /** Editing the percentage moves the amount. */
  function setPct(i: number, pct: number) {
    const p = clampPct(pct);
    patch(i, { pct: p, amount: amountFromPct(p, contractAmount) });
  }

  /** Editing the amount moves the percentage. Same binding, other direction. */
  function setAmount(i: number, amount: number) {
    const a = round2(Number.isFinite(amount) ? amount : 0);
    patch(i, { amount: a, pct: pctFromAmount(a, contractAmount) });
  }

  function addRow() {
    setRows((cur) => [
      ...cur,
      {
        id: null,
        name: `Milestone ${cur.length + 1}`,
        // Prefill what is left to allocate — the next row is almost always
        // "the rest of it".
        pct: Math.max(0, totals.remainingPct),
        amount: Math.max(0, totals.remainingAmount),
        tentative_due: null,
        work_done: false,
        actual_due: null,
      },
    ]);
  }

  function even() {
    const n = Math.max(1, rows.length);
    const split = splitEvenly(contractAmount, n);
    setRows((cur) => cur.map((r, i) => ({ ...r, pct: split[i].pct, amount: split[i].amount })));
  }

  return (
    <div className="border-t border-[var(--color-border)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Payment schedule
        </h4>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={even} title="Split evenly">
            <RefreshCw className="size-3.5" /> Split evenly
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            <Plus className="size-3.5" /> Milestone
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border-strong)] px-3 py-6 text-center text-[12px] text-[var(--color-ink-secondary)]">
          No schedule yet. Add milestones until they total 100% of the contract.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                <th className="py-1.5 pr-3 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">Name</th>
                <th className="py-1.5 pr-3 font-medium">Percentage ⟲</th>
                <th className="py-1.5 pr-3 font-medium">Amount</th>
                <th className="py-1.5 pr-3 font-medium">Tentative due</th>
                <th className="py-1.5 pr-3 font-medium">Work done</th>
                <th className="py-1.5 pr-3 font-medium">Actual due</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? `new-${i}`} className="border-t border-[var(--color-border)]">
                  <td className="py-1.5 pr-3 tabular text-[var(--color-ink-secondary)]">{i + 1}</td>
                  <td className="py-1.5 pr-3">
                    <Input
                      value={r.name}
                      onChange={(e) => patch(i, { name: e.target.value })}
                      aria-label={`Name of milestone ${i + 1}`}
                      className="h-7 min-w-32 text-[12px]"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={r.pct}
                      onChange={(e) => setPct(i, Number(e.target.value))}
                      aria-label={`Percentage of milestone ${i + 1}`}
                      className="h-7 w-24 text-[12px] tabular"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.amount}
                      onChange={(e) => setAmount(i, Number(e.target.value))}
                      aria-label={`Amount of milestone ${i + 1}`}
                      className="h-7 w-32 text-[12px] tabular"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <Input
                      type="date"
                      value={r.tentative_due ?? ""}
                      onChange={(e) => patch(i, { tentative_due: e.target.value || null })}
                      aria-label={`Tentative due of milestone ${i + 1}`}
                      className="h-7 w-36 text-[12px]"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="checkbox"
                      checked={r.work_done}
                      onChange={(e) =>
                        patch(i, {
                          work_done: e.target.checked,
                          // Ticking it is what makes the milestone billable, so
                          // the due date materialises with it.
                          actual_due: e.target.checked
                            ? (r.actual_due ?? r.tentative_due)
                            : null,
                        })
                      }
                      aria-label={`Work done on milestone ${i + 1}`}
                      className="size-4 accent-[var(--color-red)]"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    {r.work_done ? (
                      <Input
                        type="date"
                        value={r.actual_due ?? ""}
                        onChange={(e) => patch(i, { actual_due: e.target.value || null })}
                        aria-label={`Actual due of milestone ${i + 1}`}
                        className="h-7 w-36 text-[12px]"
                      />
                    ) : (
                      <span
                        className="text-[var(--color-ink-disabled)]"
                        title="Appears once the work is ticked — that is what makes it billable"
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}
                      title={`Remove ${r.name}`}
                      className="rounded-md p-1 text-[var(--color-ink-disabled)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-red)]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border-strong)] font-semibold">
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-[var(--color-ink)]">Total</td>
                <td
                  className={cn(
                    "py-2 pr-3 tabular",
                    totals.isComplete
                      ? "text-[var(--color-green)]"
                      : "text-[var(--color-red)]",
                  )}
                >
                  {totals.pct}%
                </td>
                <td className="py-2 pr-3 tabular text-[var(--color-ink)]">
                  {inr(totals.amount)}
                </td>
                <td className="py-2 pr-3" colSpan={4}>
                  {!totals.isComplete && (
                    /* Red text AND the words — never colour alone. */
                    <span className="font-normal text-[var(--color-red)]">
                      ⚠{" "}
                      {totals.remainingPct > 0
                        ? `${totals.remainingPct}% (${inr(totals.remainingAmount)}) is still unallocated`
                        : `over by ${Math.abs(totals.remainingPct)}% (${inr(Math.abs(totals.remainingAmount))})`}
                    </span>
                  )}
                  {totals.isComplete && totals.drift !== 0 && (
                    <span className="font-normal text-[var(--color-ink-secondary)]">
                      Rounding leaves {inr(Math.abs(totals.drift))}{" "}
                      {totals.drift > 0 ? "over" : "under"} the contract value.
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <form action={save} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="contract_id" value={contractId} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />
        <SubmitButton pendingLabel="Saving…" disabled={!totals.isComplete}>
          Save schedule
        </SubmitButton>
        {!totals.isComplete && (
          <span className="text-[12px] text-[var(--color-ink-secondary)]">
            The schedule has to bill exactly 100% of the contract before it can be
            saved.
          </span>
        )}
        <FormError error={state?.error} />
      </form>
    </div>
  );
}
