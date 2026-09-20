"use client";

import { useActionState, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { importQuotationToPoAction, type FormState } from "../actions";
import {
  parseMarginPct,
  quoteLinesToPoLines,
  type QuoteLineForPo,
} from "@/lib/quote-to-po-model";
import { poAmount } from "@/lib/po-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { inr } from "@/lib/utils";

/**
 * Approved-quote → draft PO. The only new number is a typed margin % that
 * strips markup off the quoted sell rate. Live preview uses the same
 * buyRate / poAmount the server will write.
 */
export function ImportToPoDialog({
  quotationId,
  quoteNumber,
  quoteTitle,
  lines,
  vendors,
}: {
  quotationId: string;
  quoteNumber: string;
  quoteTitle: string;
  lines: QuoteLineForPo[];
  vendors: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    importQuotationToPoAction,
    undefined,
  );
  const [marginRaw, setMarginRaw] = useState("");
  const [vendorId, setVendorId] = useState("");

  const parsed = parseMarginPct(marginRaw);
  const preview = useMemo(
    () => (parsed.ok ? quoteLinesToPoLines(lines, parsed.pct) : []),
    [lines, parsed],
  );
  const amount = parsed.ok ? poAmount(preview) : 0;
  const canSubmit = vendors.length > 0 && vendorId !== "" && parsed.ok && !pending;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <ClipboardList className="size-4" /> Import to purchase order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import to purchase order</DialogTitle>
          <DialogDescription>
            Drafts a PO from {quoteNumber}
            {quoteTitle ? ` · ${quoteTitle}` : ""}. 0% (or blank) buys at the
            quoted sell rate; a margin % strips that markup. The draft stays
            editable.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="quotationId" value={quotationId} />

          <Field
            label="Vendor"
            htmlFor="vendor_id"
            required
            hint={
              vendors.length === 0
                ? "Add a vendor in Procurement before importing."
                : undefined
            }
          >
            <Select
              id="vendor_id"
              name="vendor_id"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">Select a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Order name"
            htmlFor="name"
            hint="Defaults to the quotation number"
          >
            <Input
              id="name"
              name="name"
              placeholder={`PO — ${quoteNumber}`}
            />
          </Field>

          <Field
            label="Negative margin %"
            htmlFor="margin_pct"
            hint="0 or blank = buy at the quoted rate. 100% would be a free PO."
            error={!parsed.ok ? parsed.error : undefined}
          >
            <Input
              id="margin_pct"
              name="margin_pct"
              type="number"
              step="any"
              inputMode="decimal"
              value={marginRaw}
              onChange={(e) => setMarginRaw(e.target.value)}
              placeholder="0"
            />
          </Field>

          {parsed.ok && preview.length > 0 && (
            <div className="rounded-md border border-[var(--color-border)]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Buy rate</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((l, i) => (
                    <tr
                      key={`${l.item_name}-${i}`}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="px-3 py-1.5 text-[var(--color-ink)]">
                        {l.item_name}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular text-[var(--color-ink-secondary)]">
                        {l.qty}
                        {l.uom ? ` ${l.uom}` : ""}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular text-[var(--color-ink)]">
                        {inr(l.unit_rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-[var(--color-border)] px-3 py-2 text-right text-sm text-[var(--color-ink-secondary)]">
                Amount{" "}
                <span className="font-semibold tabular text-[var(--color-ink)]">
                  {inr(amount)}
                </span>
              </p>
            </div>
          )}

          {state?.error && (
            <p role="alert" className="text-sm text-[var(--color-red)]">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogTrigger>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {pending ? "Importing…" : "Create draft PO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
