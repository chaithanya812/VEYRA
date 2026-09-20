"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createRfqAction, type FormState } from "../actions";
import { UOMS } from "@/lib/items-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import { Explainer } from "@/components/ui/explainer";
import { cn, nameKey } from "@/lib/utils";

/**
 * New-RFQ form: header fields, a vendor multi-select (checkbox list — one
 * invitation per vendor), and an items grid the bids will quote against.
 * Optionally pre-filled from a Material Request (convert-an-MR flow).
 */

export interface RfqPrefill {
  mrId: string;
  title: string;
  projectLabel: string;
  items: { item_id: string | null; item_name: string; uom: string; qty: string }[];
}

interface VendorOption {
  id: string;
  name: string;
  category: string | null;
}

interface Row {
  key: string;
  item_id: string | null;
  item_name: string;
  uom: string;
  qty: string;
}

let rowSeq = 0;
const newRow = (): Row => ({
  key: `r${++rowSeq}`,
  item_id: null,
  item_name: "",
  uom: "",
  qty: "",
});

const GRID = "grid grid-cols-[minmax(0,1fr)_110px_110px_28px] items-start gap-2";

export function NewRfqForm({
  vendors,
  prefill,
}: {
  vendors: VendorOption[];
  prefill: RfqPrefill | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createRfqAction,
    undefined,
  );
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [rows, setRows] = useState<Row[]>(
    prefill && prefill.items.length > 0
      ? prefill.items.map((it) => ({
          key: `r${++rowSeq}`,
          item_id: it.item_id,
          item_name: it.item_name,
          uom: it.uom,
          qty: it.qty,
        }))
      : [newRow()],
  );
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [vendorQuery, setVendorQuery] = useState("");

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const toggleVendor = (id: string) =>
    setSelectedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const itemNameInvalid = (r: Row) => r.item_name.trim().length === 0;
  const qtyInvalid = (r: Row) => {
    const v = r.qty.trim();
    if (!v) return true;
    const n = Number(v);
    return Number.isNaN(n) || n < 0;
  };
  const linesValid = rows.every((r) => !itemNameInvalid(r) && !qtyInvalid(r));
  const canSubmit = title.trim().length > 0 && linesValid;

  const q = nameKey(vendorQuery);
  const filteredVendors = q
    ? vendors.filter((v) => nameKey(v.name).includes(q))
    : vendors;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* ── Header fields ─────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="title" required
            hint={prefill ? `Pre-filled from material request ${prefill.mrId.slice(0, 8)}` : undefined}
          >
            <Input
              id="title"
              name="title"
              placeholder="e.g. Plywood + hardware supply — Malviya Nagar"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={cn(
                title.trim().length === 0 && "border-[var(--color-border-strong)]",
              )}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Project" htmlFor="project_label" hint="Free label — no project module needed">
              <Input
                id="project_label"
                name="project_label"
                defaultValue={prefill?.projectLabel}
                placeholder="e.g. Malviya Nagar site"
              />
            </Field>
            <Field label="Place of supply" htmlFor="place_of_supply">
              <Input id="place_of_supply" name="place_of_supply" placeholder="e.g. Jaipur, RJ" />
              <Explainer k="place_of_supply" className="mt-1" />
            </Field>
            <Field label="Bid deadline" htmlFor="bid_deadline">
              <Input id="bid_deadline" name="bid_deadline" type="date" />
            </Field>
          </div>

          <Field label="Remarks" htmlFor="remarks">
            <Textarea id="remarks" name="remarks" placeholder="Terms, notes to vendors…" />
          </Field>

          {prefill && <input type="hidden" name="mr_id" value={prefill.mrId} />}
        </div>
      </Card>

      {/* ── Vendors multi-select ──────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Invite vendors{" "}
            <span className="font-normal text-[var(--color-ink-secondary)]">
              ({selectedVendors.size} selected)
            </span>
          </h2>
          <input
            value={vendorQuery}
            onChange={(e) => setVendorQuery(e.target.value)}
            aria-label="Filter vendors"
            placeholder="Filter vendors…"
            autoComplete="off"
            className="h-8 w-48 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]"
          />
        </div>
        {vendors.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-secondary)]">
            No active vendors yet — you can create the RFQ now and invite vendors later.
          </p>
        ) : (
          <div className="grid max-h-56 grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {filteredVendors.map((v) => (
              <label
                key={v.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-sunken)]"
              >
                <input
                  type="checkbox"
                  checked={selectedVendors.has(v.id)}
                  onChange={() => toggleVendor(v.id)}
                  className="size-4 accent-[var(--color-ink)]"
                />
                <span className="truncate font-medium text-[var(--color-ink)]">{v.name}</span>
                {v.category && (
                  <span className="shrink-0 text-xs text-[var(--color-ink-secondary)]">
                    {v.category}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
        <input
          type="hidden"
          name="vendors"
          value={JSON.stringify([...selectedVendors])}
        />
      </Card>

      {/* ── Items grid ────────────────────────────────────────────────── */}
      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Line items</h2>

        <div className={cn(GRID, "mb-2 px-0.5 text-xs font-medium text-[var(--color-ink-secondary)]")}>
          <span>Item</span>
          <span>UOM</span>
          <span className="text-right">Qty</span>
          <span />
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.key} className={GRID}>
              <input
                value={r.item_name}
                onChange={(e) => patchRow(r.key, { item_name: e.target.value })}
                placeholder="e.g. 18mm plywood sheet"
                aria-label="Item name"
                autoComplete="off"
                className={cn(
                  "w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]",
                  itemNameInvalid(r)
                    ? "border-[var(--color-red)]"
                    : "border-[var(--color-border-strong)]",
                )}
              />

              <select
                value={r.uom}
                onChange={(e) => patchRow(r.key, { uom: e.target.value })}
                aria-label="UOM"
                className="h-[38px] w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-red)]"
              >
                <option value="">—</option>
                {UOMS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>

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

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setRows((rs) => [...rs, newRow()])}
        >
          <Plus className="size-4" /> Add item
        </Button>

        <input
          type="hidden"
          name="items"
          value={JSON.stringify(
            rows.map((r) => ({
              item_id: r.item_id,
              item_name: r.item_name.trim(),
              uom: r.uom || null,
              qty: Number(r.qty) || 0,
            })),
          )}
        />
      </Card>

      {state?.error && (
        <p className="text-sm text-[var(--color-red)]">{state.error}</p>
      )}

      {/* ── Sticky footer ─────────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
        <p className="text-xs text-[var(--color-ink-secondary)]">
          Vendors can be added later; items are what bids quote against.
        </p>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={pending || !canSubmit}>
            {pending ? "Creating…" : "Create RFQ"}
          </Button>
        </div>
      </div>
    </form>
  );
}
