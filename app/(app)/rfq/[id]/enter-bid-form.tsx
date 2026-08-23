"use client";

import { useActionState } from "react";
import { enterBidAction, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Proxy bid entry (PROC-RFQ-004): the purchase team types a vendor's quote on
 * their behalf. Rates are human-entered CONFIG — landed totals are computed by
 * the engine (lib/rfq-model.ts landedLineTotal), never here and never by an
 * LLM. Unquoted items are simply left blank.
 */

export interface BidFormItem {
  id: string;
  item_name: string;
  uom: string | null;
  qty: number;
}

const LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_120px_88px_110px] items-start gap-2";

const cellInput =
  "w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]";

export function EnterBidForm({
  rfqId,
  vendorId,
  vendorName,
  items,
  defaultOpen = false,
}: {
  rfqId: string;
  vendorId: string;
  vendorName: string;
  items: BidFormItem[];
  defaultOpen?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    enterBidAction,
    undefined,
  );

  return (
    <details className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]" open={defaultOpen}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
        Enter bid — {vendorName}
      </summary>
      <form action={formAction} className="border-t border-[var(--color-border)] p-4">
        <input type="hidden" name="rfqId" value={rfqId} />
        <input type="hidden" name="vendorId" value={vendorId} />
        <input type="hidden" name="item_ids" value={JSON.stringify(items.map((i) => i.id))} />

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Delivery date" htmlFor={`delivery-${vendorId}`}>
            <Input id={`delivery-${vendorId}`} name="delivery_date" type="date" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Remark" htmlFor={`remark-${vendorId}`} hint="Payment terms, exclusions…">
              <Textarea id={`remark-${vendorId}`} name="remark" rows={1} />
            </Field>
          </div>
        </div>

        <div className={cn(LINE_GRID, "mb-2 text-xs font-medium text-[var(--color-ink-secondary)]")}>
          <span>Item</span>
          <span className="text-right">Unit rate ₹</span>
          <span className="text-right">Tax %</span>
          <span className="text-right">Freight ₹</span>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <div key={it.id} className={LINE_GRID}>
              <div className="px-0.5 py-2 text-sm">
                <span className="font-medium text-[var(--color-ink)]">{it.item_name}</span>{" "}
                <span className="text-xs text-[var(--color-ink-secondary)]">
                  · {Number(it.qty)} {it.uom ?? ""}
                </span>
              </div>
              <input
                name={`unit_rate:${it.id}`}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="—"
                aria-label={`Unit rate for ${it.item_name}`}
                className={cn(cellInput, "text-right tabular")}
              />
              <input
                name={`tax_pct:${it.id}`}
                type="number"
                min="0"
                max="100"
                step="any"
                inputMode="decimal"
                defaultValue={18}
                aria-label={`Tax % for ${it.item_name}`}
                className={cn(cellInput, "text-right tabular")}
              />
              <input
                name={`freight:${it.id}`}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                aria-label={`Freight for ${it.item_name}`}
                className={cn(cellInput, "text-right tabular")}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save bid"}
          </Button>
          {state?.error && (
            <p className="text-xs text-[var(--color-red)]">{state.error}</p>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">
          Saving marks the vendor “submitted”. Re-entering a bid adds a newer version — history is kept.
        </p>
      </form>
    </details>
  );
}
