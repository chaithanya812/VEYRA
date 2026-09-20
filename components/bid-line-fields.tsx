"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Shared bid line grid. Both hosts (internal proxy entry and the public
 * vendor portal) render these inputs — the `unit_rate:<id>` / `tax_pct:<id>` /
 * `freight:<id>` field-name contract lives in exactly this file.
 *
 * Rates are human-entered CONFIG. Landed totals are computed by the engine
 * (lib/rfq-model.ts landedLineTotal), never here and never by an LLM.
 */

export interface BidFormItem {
  id: string;
  item_name: string;
  uom: string | null;
  qty: number;
}

export type BidLineDefaults = {
  delivery_date?: string | null;
  remark?: string | null;
  lines?: Record<
    string,
    { unit_rate?: number | null; tax_pct?: number | null; freight?: number | null }
  >;
};

export type BidFormState = { error?: string } | undefined;

export type BidFormAction = (
  prev: BidFormState,
  formData: FormData,
) => Promise<BidFormState>;

const LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_120px_88px_110px] items-start gap-2";

const cellInput =
  "w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]";

export function BidLineFields({
  items,
  idPrefix,
  defaults,
}: {
  items: BidFormItem[];
  idPrefix: string;
  defaults?: BidLineDefaults;
}) {
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Delivery date" htmlFor={`delivery-${idPrefix}`}>
          <Input
            id={`delivery-${idPrefix}`}
            name="delivery_date"
            type="date"
            defaultValue={defaults?.delivery_date?.slice(0, 10) ?? undefined}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Remark"
            htmlFor={`remark-${idPrefix}`}
            hint="Payment terms, exclusions…"
          >
            <Textarea
              id={`remark-${idPrefix}`}
              name="remark"
              rows={1}
              defaultValue={defaults?.remark ?? undefined}
            />
          </Field>
        </div>
      </div>

      <div
        className={cn(
          LINE_GRID,
          "mb-2 text-xs font-medium text-[var(--color-ink-secondary)]",
        )}
      >
        <span>Item</span>
        <span className="text-right">Unit rate ₹</span>
        <span className="text-right">Tax %</span>
        <span className="text-right">Freight ₹</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => {
          const line = defaults?.lines?.[it.id];
          return (
            <div key={it.id} className={LINE_GRID}>
              <div className="px-0.5 py-2 text-sm">
                <span className="font-medium text-[var(--color-ink)]">
                  {it.item_name}
                </span>{" "}
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
                defaultValue={line?.unit_rate ?? undefined}
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
                defaultValue={line?.tax_pct ?? 18}
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
                defaultValue={line?.freight ?? undefined}
                aria-label={`Freight for ${it.item_name}`}
                className={cn(cellInput, "text-right tabular")}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

export function BidForm({
  action,
  hidden,
  items,
  idPrefix,
  defaults,
  submitLabel,
  footnote,
}: {
  action: BidFormAction;
  hidden: Record<string, string>;
  items: BidFormItem[];
  idPrefix: string;
  defaults?: BidLineDefaults;
  submitLabel: string;
  footnote?: string;
}) {
  const [state, formAction, pending] = useActionState<BidFormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input
        type="hidden"
        name="item_ids"
        value={JSON.stringify(items.map((i) => i.id))}
      />

      <BidLineFields items={items} idPrefix={idPrefix} defaults={defaults} />

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {state?.error && (
          <p className="text-xs text-[var(--color-red)]">{state.error}</p>
        )}
      </div>
      {footnote && (
        <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">{footnote}</p>
      )}
    </form>
  );
}
