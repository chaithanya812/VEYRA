"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, Plus, Trash2 } from "lucide-react";
import { createContractAction } from "../actions";
import {
  CONTRACT_SOURCES,
  SOURCE_LABELS,
  milestonesFoot,
} from "@/lib/finance-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface MsRow {
  key: number;
  name: string;
  pct: string;
  amount: string;
  tentative_due: string;
}

let nextKey = 1;
const emptyRow = (): MsRow => ({
  key: nextKey++,
  name: "",
  pct: "",
  amount: "",
  tentative_due: "",
});

export default function NewContractPage() {
  const [state, formAction, pending] = useActionState<
    { error?: string } | undefined,
    FormData
  >(createContractAction, undefined);

  const [rows, setRows] = useState<MsRow[]>([emptyRow()]);

  const update = (key: number, patch: Partial<MsRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) =>
    setRows((rs) =>
      rs.length > 1 ? rs.filter((r) => r.key !== key) : [emptyRow()],
    );

  // Live Σpct footer — pure helper, same rule the action enforces server-side.
  const foot = useMemo(
    () => milestonesFoot(rows.map((r) => ({ pct: Number(r.pct) || 0 }))),
    [rows],
  );

  // Only rows the user actually touched are submitted.
  const serialized = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => r.name || r.pct || r.amount || r.tentative_due)
          .map((r, i) => ({
            seq: i + 1,
            name: r.name,
            pct: Number(r.pct) || 0,
            amount: Number(r.amount) || 0,
            tentative_due: r.tentative_due || undefined,
          })),
      ),
    [rows],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/finance"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to finance
      </Link>
      <PageHeader
        title="New contract"
        subtitle="A money agreement on a project — from a client (inflow) or a vendor (outflow)"
      />

      <Card className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="milestones" value={serialized} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <Input
                id="name"
                name="name"
                placeholder="e.g. Mehta Residence — main contract"
              />
            </Field>
            <Field
              label="Project label"
              htmlFor="project_label"
              hint="Free-text reference to a project"
            >
              <Input
                id="project_label"
                name="project_label"
                placeholder="e.g. Mehta Residence Fitout"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Source" htmlFor="source" required>
              <Select id="source" name="source" defaultValue="client">
                {CONTRACT_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contract value (₹)" htmlFor="amount">
              <Input
                id="amount"
                name="amount"
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 2500000"
              />
            </Field>
          </div>

          {/* Milestone billing schedule */}
          <div className="mt-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Billing milestones
              </h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRows((rs) => [...rs, emptyRow()])}
              >
                <Plus className="size-4" /> Add milestone
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Milestone</th>
                    <th className="px-3 py-2.5 font-medium text-right">%</th>
                    <th className="px-3 py-2.5 font-medium text-right">
                      Amount ₹
                    </th>
                    <th className="px-3 py-2.5 font-medium">Tentative due</th>
                    <th className="w-10 px-3 py-2.5" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.key}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="px-3 py-2 tabular text-[var(--color-ink-secondary)]">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label={`Milestone ${i + 1} name`}
                          value={r.name}
                          onChange={(e) =>
                            update(r.key, { name: e.target.value })
                          }
                          placeholder="e.g. Advance"
                          className="h-9"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label={`Milestone ${i + 1} percent`}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={r.pct}
                          onChange={(e) => update(r.key, { pct: e.target.value })}
                          className="h-9 text-right tabular"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label={`Milestone ${i + 1} amount`}
                          type="number"
                          min="0"
                          step="1000"
                          value={r.amount}
                          onChange={(e) =>
                            update(r.key, { amount: e.target.value })
                          }
                          className="h-9 text-right tabular"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label={`Milestone ${i + 1} tentative due date`}
                          type="date"
                          value={r.tentative_due}
                          onChange={(e) =>
                            update(r.key, { tentative_due: e.target.value })
                          }
                          className="h-9"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          aria-label={`Remove milestone ${i + 1}`}
                          onClick={() => remove(r.key)}
                          className="rounded p-1.5 text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-red)]"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Live Σpct footer — red warning while ≠ 100% */}
                <tfoot>
                  <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[13px]">
                    <td colSpan={2} className="px-3 py-2.5 font-medium">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          foot.ok
                            ? "text-[var(--color-green)]"
                            : foot.total > 0
                              ? "text-[var(--color-red)]"
                              : "text-[var(--color-ink-secondary)]",
                        )}
                      >
                        {foot.ok && (
                          <CircleCheck className="size-4 text-[var(--color-green)]" />
                        )}
                        Σ {foot.total}%
                      </span>
                      {!foot.ok && (
                        <span
                          className={cn(
                            "ml-3 font-normal",
                            foot.total > 0
                              ? "text-[var(--color-red)]"
                              : "text-[var(--color-ink-secondary)]",
                          )}
                        >
                          {foot.total > 0
                            ? "Milestone percentages must total 100%"
                            : "Schedule milestones that total 100%"}
                        </span>
                      )}
                    </td>
                    <td colSpan={4} className="px-3 py-2.5 text-right text-[var(--color-ink-secondary)]">
                      Percentages are checked live before the contract saves
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {state?.error && (
            <p className="text-sm text-[var(--color-red)]">{state.error}</p>
          )}

          {/* Sticky footer action bar (DESIGN-DIRECTION §5): Cancel ghost-left, primary red-right. */}
          <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
            <Button asChild type="button" variant="ghost">
              <Link href="/finance">
                Cancel
              </Link>
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create contract"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
