"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Search } from "lucide-react";
import { addStockInAction, searchItemsAction, type FormState } from "../actions";
import type { CatalogueItemRef } from "@/lib/inventory-model";
import { UOMS, GST_RATES } from "@/lib/items-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import { cn, inr } from "@/lib/utils";
import { stockValue } from "@/lib/inventory-model";

/**
 * Stock-in line grid (FEATURE-REGISTER PROC-WH-002). Catalogue-first like the
 * MR grid, but an unmatched name is a TRUE ALERT here: the cell gets a red
 * border + an "unlisted" tag so the item gets promoted into the catalogue —
 * one of the few reserved red jobs (§Design). Unit rates + GST% are
 * user-entered CONFIG; every total is a pure computation (stockValue), never AI.
 */

interface WarehouseOption {
  id: string;
  name: string;
  project_label: string | null;
}

interface VendorOption {
  id: string;
  name: string;
}

/**
 * What the caller already knows. `Deliveries StockIn` and `Expense StockIn`
 * both arrive here from a row that names its vendor, its order or its payment
 * — re-typing that is how the link between the two records gets lost.
 */
export interface StockInPrefill {
  warehouseId?: string;
  vendorId?: string;
  poId?: string;
  paymentId?: string;
  reference?: string;
  direction?: "in" | "out";
}

interface Row {
  key: string;
  item_id: string | null;
  item_name: string;
  hsn: string;
  uom: string;
  qty: string;
  rate: string;
  gst: string;
}

let rowSeq = 0;
const newRow = (): Row => ({
  key: `r${++rowSeq}`,
  item_id: null,
  item_name: "",
  hsn: "",
  uom: "",
  qty: "",
  rate: "",
  gst: "18",
});

const GRID =
  "grid grid-cols-[minmax(0,1.6fr)_96px_84px_84px_110px_84px_110px_28px] items-start gap-2";

export function StockInForm({
  warehouses,
  vendors = [],
  prefill,
}: {
  warehouses: WarehouseOption[];
  vendors?: VendorOption[];
  prefill?: StockInPrefill;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addStockInAction,
    undefined,
  );

  const [warehouseId, setWarehouseId] = useState(prefill?.warehouseId ?? "");
  const [vendorId, setVendorId] = useState(prefill?.vendorId ?? "");
  const [direction, setDirection] = useState<"in" | "out">(
    prefill?.direction ?? "in",
  );
  const [rows, setRows] = useState<Row[]>([newRow()]);

  // Autocomplete state — one open dropdown at a time (the focused row).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CatalogueItemRef[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!openKey) return;
    const q = rows.find((r) => r.key === openKey)?.item_name.trim() ?? "";
    if (!q) {
      setSuggestions([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchItemsAction(q);
      if (id === seq.current) setSuggestions(res);
    }, 180);
    return () => clearTimeout(t);
  }, [openKey, rows]);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickItem = (key: string, m: CatalogueItemRef) => {
    setRows((rs) =>
      rs.map((r) =>
        r.key === key
          ? {
              ...r,
              item_id: m.id,
              item_name: m.name,
              uom: r.uom || m.base_uom || "",
              hsn: r.hsn || m.hsn_sac || "",
              gst: r.gst || (m.tax_rate != null ? String(m.tax_rate) : ""),
              rate: r.rate || (m.base_rate != null ? String(m.base_rate) : ""),
            }
          : r,
      ),
    );
    setOpenKey(null);
    setSuggestions([]);
  };

  const itemNameInvalid = (r: Row) => r.item_name.trim().length === 0;
  const qtyInvalid = (r: Row) => {
    const n = Number(r.qty);
    return !r.qty.trim() || Number.isNaN(n) || n <= 0;
  };
  const rateInvalid = (r: Row) => {
    const n = Number(r.rate);
    return !r.rate.trim() || Number.isNaN(n) || n < 0;
  };
  const linesValid =
    rows.length > 0 && rows.every((r) => !itemNameInvalid(r) && !qtyInvalid(r) && !rateInvalid(r));
  const canSubmit = warehouseId !== "" && linesValid;

  // Footer totals — pure computations over user-entered config.
  const subtotal = rows.reduce(
    (sum, r) => sum + stockValue(Number(r.qty) || 0, Number(r.rate) || 0),
    0,
  );
  const gstAmount = rows.reduce(
    (sum, r) =>
      sum + (stockValue(Number(r.qty) || 0, Number(r.rate) || 0) * (Number(r.gst) || 0)) / 100,
    0,
  );
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* ── Header fields ───────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Warehouse" htmlFor="warehouse_id" required>
              <Select
                id="warehouse_id"
                name="warehouse_id"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">— Select warehouse —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.project_label ? ` (${w.project_label})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Source doc / invoice ref"
              htmlFor="source_doc"
              hint="Invoice, PO or challan reference"
            >
              <Input
                id="source_doc"
                name="source_doc"
                defaultValue={prefill?.reference ?? ""}
                placeholder="e.g. INV-2043"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Direction"
              htmlFor="direction"
              required
              hint="Inward becomes a GRN; outward becomes an issue note"
            >
              <Select
                id="direction"
                name="direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as "in" | "out")}
              >
                <option value="in">Stock in — goods received</option>
                <option value="out">Stock out — issued from store</option>
              </Select>
            </Field>
            <Field label="Vendor" htmlFor="vendor_id" hint="Optional">
              <Select
                id="vendor_id"
                name="vendor_id"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">— No vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* A document is created either way and takes the next number from
              the tenant's series — a movement with no document is a row
              Transaction History cannot name (0033). */}
          <p className="text-xs text-[var(--color-ink-secondary)]">
            This posts one numbered{" "}
            {direction === "in" ? "goods receipt note" : "issue note"} and one
            ledger line per item. Both are append-only.
          </p>

          <input type="hidden" name="po_id" value={prefill?.poId ?? ""} />
          <input type="hidden" name="payment_id" value={prefill?.paymentId ?? ""} />
        </div>
      </Card>

      {/* ── Line grid ───────────────────────────────────────────────────── */}
      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Lines</h2>

        <div className="overflow-x-auto">
          <div className="min-w-[840px]">
            <div className={cn(GRID, "mb-2 px-0.5 text-xs font-medium text-[var(--color-ink-secondary)]")}>
              <span>Item</span>
              <span>HSN/SAC</span>
              <span>UOM</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit rate ₹</span>
              <span>GST %</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.key} className={cn(GRID)}>
                  {/* Item — catalogue autocomplete; unmatched = flagged unlisted */}
                  <div className="relative">
                    <div className="relative">
                      <input
                        value={r.item_name}
                        onChange={(e) =>
                          patchRow(r.key, { item_name: e.target.value, item_id: null })
                        }
                        onFocus={() => setOpenKey(r.key)}
                        onBlur={() => setOpenKey((k) => (k === r.key ? null : k))}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setOpenKey(null);
                        }}
                        placeholder="Search the catalogue…"
                        autoComplete="off"
                        aria-label="Item"
                        className={cn(
                          "w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-disabled)] focus:border-[var(--color-red)]",
                          itemNameInvalid(r) || (r.item_name.trim() && !r.item_id)
                            ? "border-[var(--color-red)]"
                            : "border-[var(--color-border-strong)]",
                        )}
                      />
                      {r.item_name.trim() && (
                        <span
                          className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1"
                          title={
                            r.item_id
                              ? "Catalogue item"
                              : "Not in catalogue — flagged unlisted, promote it in Items"
                          }
                        >
                          {!r.item_id ? (
                            <span className="rounded-full border border-[color-mix(in_srgb,var(--color-red)_25%,white)] bg-[var(--color-red-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-red-hover)]">
                              unlisted
                            </span>
                          ) : (
                            <Search className="size-3.5 text-[var(--color-green)]" />
                          )}
                        </span>
                      )}
                    </div>
                    {openKey === r.key && r.item_name.trim() && (
                      <div
                        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-lg"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {suggestions.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-[var(--color-ink-secondary)]">
                            No catalogue match — the line is flagged{" "}
                            <span className="font-medium text-[var(--color-red)]">unlisted</span>{" "}
                            so it can be promoted later.
                          </p>
                        ) : (
                          suggestions.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => pickItem(r.key, m)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)]"
                            >
                              <span className="truncate font-medium text-[var(--color-ink)]">
                                {m.name}
                              </span>
                              <span className="shrink-0 text-xs tabular text-[var(--color-ink-secondary)]">
                                {m.base_uom ?? "—"}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* HSN/SAC */}
                  <input
                    value={r.hsn}
                    onChange={(e) => patchRow(r.key, { hsn: e.target.value })}
                    placeholder="4412"
                    aria-label="HSN/SAC"
                    className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm tabular text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]"
                  />

                  {/* UOM */}
                  <select
                    value={r.uom}
                    onChange={(e) => patchRow(r.key, { uom: e.target.value })}
                    aria-label="UOM"
                    className="h-[38px] w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-red)]"
                  >
                    <option value="">—</option>
                    {UOMS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>

                  {/* Qty */}
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

                  {/* Unit rate */}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={r.rate}
                    onChange={(e) => patchRow(r.key, { rate: e.target.value })}
                    placeholder="Config"
                    aria-label="Unit rate"
                    className={cn(
                      "w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-right text-sm tabular text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-disabled)] focus:border-[var(--color-red)]",
                      rateInvalid(r)
                        ? "border-[var(--color-red)]"
                        : "border-[var(--color-border-strong)]",
                    )}
                  />

                  {/* GST % */}
                  <select
                    value={r.gst}
                    onChange={(e) => patchRow(r.key, { gst: e.target.value })}
                    aria-label="GST %"
                    className="h-[38px] w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-sm tabular text-[var(--color-ink)] outline-none focus:border-[var(--color-red)]"
                  >
                    {GST_RATES.map((g) => (
                      <option key={g} value={String(g)}>
                        {g}%
                      </option>
                    ))}
                  </select>

                  {/* Total (computed) */}
                  <div
                    className="px-3 py-2 text-right text-sm tabular font-medium text-[var(--color-ink)]"
                    title="Qty × unit rate — computed, never AI"
                  >
                    {inr(stockValue(Number(r.qty) || 0, Number(r.rate) || 0))}
                  </div>

                  {/* Remove */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Remove line"
                    onClick={() =>
                      setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))
                    }
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setRows((rs) => [...rs, newRow()])}
        >
          <Plus className="size-4" /> Add line
        </Button>

        {/* Serialised grid → action */}
        <input
          type="hidden"
          name="lines"
          value={JSON.stringify(
            rows.map((r) => ({
              item_id: r.item_id,
              item_name: r.item_name.trim(),
              uom: r.uom || null,
              qty: Number(r.qty) || 0,
              unit_rate: Number(r.rate) || 0,
              gst_pct: Number(r.gst) || 18,
              hsn_sac: r.hsn.trim() || null,
            })),
          )}
        />
      </Card>

      {state?.error && (
        <p className="text-sm text-[var(--color-red)]">{state.error}</p>
      )}

      {/* ── Sticky footer: totals + confirm ──────────────────────────────── */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular text-[var(--color-ink-secondary)]">
          <div className="flex items-center gap-1.5">
            <dt>Total qty</dt>
            <dd className="font-medium text-[var(--color-ink)]">{totalQty}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Subtotal</dt>
            <dd className="font-medium text-[var(--color-ink)]">{inr(subtotal)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>GST</dt>
            <dd className="font-medium text-[var(--color-ink)]">{inr(gstAmount)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Grand total</dt>
            <dd className="text-base font-semibold text-[var(--color-ink)]">
              {inr(subtotal + gstAmount)}
            </dd>
          </div>
        </dl>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/inventory">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button type="submit" variant="primary" disabled={pending || !canSubmit}>
            {pending ? "Posting…" : "Confirm stock-in"}
          </Button>
        </div>
      </div>
    </form>
  );
}
