"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Search } from "lucide-react";
import { createMaterialRequestAction, searchItemsAction, type FormState } from "../actions";
import type { CatalogueMatch } from "@/lib/material-requests-model";
import { UOMS } from "@/lib/items-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Raise a Material Request (PROC-MR-001): header fields + a line-item grid.
 * The grid is catalogue-first — picking from the autocomplete links the line
 * to an Item (item_id); typing something unmatched keeps it as a flagged
 * ad-hoc line ("ad-hoc" grey tag), never a silent free string. Empty required
 * cells (Item, Qty) get a red validation border.
 */

interface Row {
  key: string;
  item_id: string | null;
  item_name: string;
  uom: string;
  qty: string;
  remarks: string;
}

let rowSeq = 0;
const newRow = (): Row => ({
  key: `r${++rowSeq}`,
  item_id: null,
  item_name: "",
  uom: "",
  qty: "",
  remarks: "",
});

const GRID =
  "grid grid-cols-[minmax(0,1fr)_92px_88px_minmax(0,1fr)_28px] items-start gap-2";

export default function NewMaterialRequestPage() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createMaterialRequestAction,
    undefined,
  );
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [rows, setRows] = useState<Row[]>([newRow()]);

  // Autocomplete state — one open dropdown at a time (the focused row).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CatalogueMatch[]>([]);
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

  const pickItem = (key: string, match: CatalogueMatch) => {
    setRows((rs) =>
      rs.map((r) =>
        r.key === key
          ? {
              ...r,
              item_id: match.id,
              item_name: match.name,
              uom: r.uom || match.base_uom || "",
            }
          : r,
      ),
    );
    setOpenKey(null);
    setSuggestions([]);
  };

  const itemNameInvalid = (r: Row) => r.item_name.trim().length === 0;
  const qtyInvalid = (r: Row) => {
    const v = r.qty.trim();
    if (!v) return true;
    const n = Number(v);
    return Number.isNaN(n) || n < 0;
  };
  const linesValid = rows.every((r) => !itemNameInvalid(r) && !qtyInvalid(r));
  const canSubmit = title.trim().length > 0 && linesValid;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/procurement"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to material requests
      </Link>
      <PageHeader
        title="Raise material request"
        subtitle="Line items reference your catalogue — anything uncatalogued is flagged ad-hoc."
      />

      <form action={formAction} className="flex flex-col gap-6">
        {/* ── Header fields ─────────────────────────────────────────────── */}
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <Field
              label="Title"
              htmlFor="title"
              required
              error={
                titleTouched && !title.trim() ? "Title is required" : undefined
              }
            >
              <Input
                id="title"
                name="title"
                placeholder="e.g. Malviya Nagar site — plywood + hardware"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTitleTouched(true)}
                className={cn(
                  titleTouched && !title.trim() &&
                    "border-[var(--color-red)]",
                )}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Project" htmlFor="project_label" hint="Free label — no project module needed">
                <Input id="project_label" name="project_label" placeholder="e.g. Malviya Nagar site" />
              </Field>
              <Field label="Expected delivery" htmlFor="expected_delivery">
                <Input id="expected_delivery" name="expected_delivery" type="date" />
              </Field>
            </div>

            <Field label="Remarks" htmlFor="remarks">
              <Textarea id="remarks" name="remarks" placeholder="Anything the purchase team should know…" />
            </Field>

            <input type="hidden" name="source" value="manual" />
          </div>
        </Card>

        {/* ── Line-item grid ────────────────────────────────────────────── */}
        <Card className="p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
            Line items
          </h2>

          <div className={cn(GRID, "mb-2 px-0.5 text-xs font-medium text-[var(--color-ink-secondary)]")}>
            <span>Item</span>
            <span>UOM</span>
            <span className="text-right">Qty</span>
            <span>Remarks</span>
            <span />
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.key} className={cn(GRID)}>
                {/* Item — catalogue autocomplete; unmatched typing = ad-hoc */}
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
                      aria-label="Item"
                      placeholder="Search the catalogue…"
                      autoComplete="off"
                      className={cn(
                        "w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]",
                        itemNameInvalid(r)
                          ? "border-[var(--color-red)]"
                          : "border-[var(--color-border-strong)]",
                      )}
                    />
                    {r.item_name.trim() && (
                      <span
                        className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1"
                        title={r.item_id ? "Catalogue item" : "Not in catalogue — ad-hoc line"}
                      >
                        {!r.item_id ? (
                          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-secondary)]">
                            ad-hoc
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
                          No catalogue match — stays flagged ad-hoc.
                        </p>
                      ) : (
                        suggestions.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => pickItem(r.key, m)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)]"
                          >
                            <span className="truncate font-medium text-[var(--color-ink)]">{m.name}</span>
                            <span className="shrink-0 text-xs text-[var(--color-ink-secondary)]">
                              {m.base_uom ?? "—"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* UOM */}
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

                {/* Remarks */}
                <input
                  value={r.remarks}
                  onChange={(e) => patchRow(r.key, { remarks: e.target.value })}
                  aria-label="Remarks"
                  placeholder="Optional"
                  className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]"
                />

                {/* Remove */}
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

          {/* Serialised grid → action */}
          <input
            type="hidden"
            name="items"
            value={JSON.stringify(
              rows.map((r) => ({
                item_id: r.item_id,
                item_name: r.item_name.trim(),
                is_adhoc: !r.item_id,
                uom: r.uom || null,
                qty: Number(r.qty) || 0,
                remarks: r.remarks.trim() || null,
              })),
            )}
          />
        </Card>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        {/* ── Sticky footer ─────────────────────────────────────────────── */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
          <Link href="/procurement">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
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
              value="raise"
              variant="primary"
              disabled={pending || !canSubmit}
            >
              {pending ? "Raising…" : "Raise"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
