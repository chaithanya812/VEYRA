"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { createPurchaseOrderAction, type FormState } from "../actions";
import { poAmount } from "@/lib/po-model";
import { UOMS } from "@/lib/items-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import { Explainer } from "@/components/ui/explainer";
import { cn, inr } from "@/lib/utils";

/**
 * Create a standalone PO: header fields + a priced line grid. Rates/tax are
 * USER-ENTERED CONFIG; the live amount is the pure SUM of line totals via
 * poAmount() — no number here is ever invented (PLAN §8). Empty required
 * cells (Name, Vendor, Item, Qty) get a red validation border.
 */

interface Row {
  key: string;
  item_name: string;
  uom: string;
  qty: string;
  unit_rate: string;
  tax_pct: string;
}

let rowSeq = 0;
const newRow = (): Row => ({
  key: `r${++rowSeq}`,
  item_name: "",
  uom: "",
  qty: "",
  unit_rate: "",
  tax_pct: "18",
});

const GRID =
  "grid grid-cols-[minmax(0,1.4fr)_92px_88px_110px_84px_28px] items-start gap-2";

export function NewPurchaseOrderForm({
  vendors,
  plans,
  terms,
}: {
  vendors: { id: string; name: string }[];
  plans: { id: string; name: string }[];
  terms: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createPurchaseOrderAction,
    undefined,
  );
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const itemNameInvalid = (r: Row) => r.item_name.trim().length === 0;
  const qtyInvalid = (r: Row) => {
    const v = r.qty.trim();
    if (!v) return true;
    const n = Number(v);
    return Number.isNaN(n) || n < 0;
  };
  const rateInvalid = (r: Row) => {
    const v = r.unit_rate.trim();
    if (!v) return true;
    const n = Number(v);
    return Number.isNaN(n) || n < 0;
  };
  const linesValid = rows.every(
    (r) => !itemNameInvalid(r) && !qtyInvalid(r) && !rateInvalid(r),
  );
  const canSubmit = name.trim().length > 0 && vendorId !== "" && linesValid;

  // Live total — pure arithmetic over the user's config.
  const amount = poAmount(
    rows.map((r) => ({ qty: Number(r.qty) || 0, unit_rate: Number(r.unit_rate) || 0 })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* ── Header fields ─────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <Field
            label="Order name"
            htmlFor="name"
            required
            error={nameTouched && !name.trim() ? "Order name is required" : undefined}
          >
            <Input
              id="name"
              name="name"
              placeholder="e.g. Malviya Nagar — plywood supply"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              className={cn(nameTouched && !name.trim() && "border-[var(--color-red)]")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Vendor" htmlFor="vendor_id" required>
              <Select
                id="vendor_id"
                name="vendor_id"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className={cn(vendorId === "" && "text-[var(--color-ink-disabled)]")}
              >
                <option value="">Select a vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" htmlFor="type">
              <Select id="type" name="type" defaultValue="purchase_order">
                <option value="purchase_order">Purchase order</option>
                <option value="work_order">Work order</option>
              </Select>
              <Explainer k="po_vs_wo" className="mt-1" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Payment plan"
              htmlFor="payment_plan_id"
              hint="Optional — how this order is paid"
            >
              <Select id="payment_plan_id" name="payment_plan_id" defaultValue="">
                <option value="">None</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Terms & conditions"
              htmlFor="po_terms_id"
              hint="Optional — attached as written"
            >
              <Select id="po_terms_id" name="po_terms_id" defaultValue="">
                <option value="">None</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Project" htmlFor="project_label" hint="Free label — no project module needed">
              <Input id="project_label" name="project_label" placeholder="e.g. Malviya Nagar site" />
            </Field>
            <Field label="Order date" htmlFor="order_date">
              <Input id="order_date" name="order_date" type="date" />
            </Field>
            <Field label="Delivery date" htmlFor="delivery_date">
              <Input id="delivery_date" name="delivery_date" type="date" />
            </Field>
          </div>
        </div>
      </Card>

      {/* ── Line grid ─────────────────────────────────────────────────── */}
      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Lines</h2>

        <div className={cn(GRID, "mb-2 px-0.5 text-xs font-medium text-[var(--color-ink-secondary)]")}>
          <span>Item</span>
          <span>UOM</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate ₹</span>
          <span className="text-right">Tax %</span>
          <span />
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.key} className={cn(GRID)}>
              <input
                value={r.item_name}
                onChange={(e) => patchRow(r.key, { item_name: e.target.value })}
                placeholder="Item name…"
                autoComplete="off"
                aria-label="Item name"
                className={cn(
                  "w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]",
                  itemNameInvalid(r)
                    ? "border-[var(--color-red)]"
                    : "border-[var(--color-border-strong)]",
                )}
              />

              <Select
                value={r.uom}
                onChange={(e) => patchRow(r.key, { uom: e.target.value })}
                aria-label="UOM"
                className="h-[38px]"
              >
                <option value="">—</option>
                {UOMS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>

              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={r.qty}
                onChange={(e) => patchRow(r.key, { qty: e.target.value })}
                aria-label="Quantity"
                className={cn(
                  "w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-right text-sm tabular text-[var(--color-ink)] outline-none focus:border-[var(--color-red)]",
                  qtyInvalid(r)
                    ? "border-[var(--color-red)]"
                    : "border-[var(--color-border-strong)]",
                )}
              />

              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={r.unit_rate}
                onChange={(e) => patchRow(r.key, { unit_rate: e.target.value })}
                placeholder="0.00"
                aria-label="Unit rate"
                className={cn(
                  "w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-right text-sm tabular text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]",
                  rateInvalid(r)
                    ? "border-[var(--color-red)]"
                    : "border-[var(--color-border-strong)]",
                )}
              />

              <input
                type="number"
                min="0"
                max="100"
                step="any"
                inputMode="decimal"
                value={r.tax_pct}
                onChange={(e) => patchRow(r.key, { tax_pct: e.target.value })}
                aria-label="Tax %"
                className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-right text-sm tabular text-[var(--color-ink)] outline-none focus:border-[var(--color-red)]"
              />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove line"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
                className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRows((rs) => [...rs, newRow()])}
          >
            <Plus className="size-4" /> Add line
          </Button>
          <p className="text-sm text-[var(--color-ink-secondary)]">
            Amount{" "}
            <span className="ml-1 font-semibold tabular text-[var(--color-ink)]">
              {inr(amount)}
            </span>
          </p>
        </div>

        {/* Serialised grid → action */}
        <input
          type="hidden"
          name="lines"
          value={JSON.stringify(
            rows.map((r) => ({
              item_id: null,
              item_name: r.item_name.trim(),
              uom: r.uom || null,
              qty: Number(r.qty) || 0,
              unit_rate: Number(r.unit_rate) || 0,
              tax_pct: r.tax_pct.trim() === "" ? null : Number(r.tax_pct),
            })),
          )}
        />
      </Card>

      {state?.error && (
        <p className="text-sm text-[var(--color-red)]">{state.error}</p>
      )}

      {/* ── Sticky footer ─────────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
        <Button asChild type="button" variant="ghost">
          <Link href="/orders">Cancel</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            name="intent"
            value="draft"
            variant="secondary"
            disabled={pending || !canSubmit}
          >
            {pending ? "Saving…" : "Create as draft"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="create"
            variant="primary"
            disabled={pending || !canSubmit}
          >
            {pending ? "Creating…" : "Create Order"}
          </Button>
        </div>
      </div>
    </form>
  );
}
