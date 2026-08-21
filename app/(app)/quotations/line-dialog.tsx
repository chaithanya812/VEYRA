"use client";

import { useState, useTransition, type ReactNode } from "react";
import { addLineAction, updateLineAction } from "./actions";
import {
  computeLine,
  DISCOUNT_TYPES,
  type DiscountType,
  type QuotationSection,
  type QuotationLine,
} from "@/lib/quotations-model";
import { UOMS, GST_RATES, type Uom, type ItemRef } from "@/lib/items-model";
import { uomLabel } from "@/lib/items-ui";
import { inr } from "@/lib/utils";
import { ItemCombobox } from "./item-combobox";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

type LineState = {
  item_id: string;
  title: string;
  section_id: string;
  area: string;
  category: string;
  description: string;
  hsn_sac: string;
  qty: string;
  uom: Uom;
  unit_price: string;
  discount_type: DiscountType;
  discount_value: string;
  tax_rate: string;
  cost_rate: string;
};

function initial(line?: QuotationLine, defaultSectionId?: string): LineState {
  return {
    item_id: line?.item_id ?? "",
    title: line?.title ?? "",
    section_id: line?.section_id ?? defaultSectionId ?? "",
    area: line?.area ?? "",
    category: line?.category ?? "",
    description: line?.description ?? "",
    hsn_sac: line?.hsn_sac ?? "",
    qty: String(line?.qty ?? 1),
    uom: (line?.uom as Uom) ?? "nos",
    unit_price: String(line?.unit_price ?? 0),
    discount_type: line?.discount_type ?? "amount",
    discount_value: String(line?.discount_value ?? 0),
    tax_rate: String(line?.tax_rate ?? 18),
    cost_rate: String(line?.cost_rate ?? 0),
  };
}

export function LineDialog({
  quotationId,
  sections,
  line,
  defaultSectionId,
  trigger,
}: {
  quotationId: string;
  sections: QuotationSection[];
  line?: QuotationLine;
  defaultSectionId?: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<LineState>(() => initial(line, defaultSectionId));
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const set = <K extends keyof LineState>(k: K, v: LineState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function onPickItem(it: ItemRef) {
    setF((prev) => ({
      ...prev,
      item_id: it.id,
      title: prev.title.trim() || it.name,
      uom: it.base_uom,
      unit_price: it.base_rate != null ? String(it.base_rate) : prev.unit_price,
      tax_rate: String(it.tax_rate),
      hsn_sac: it.hsn_sac ?? prev.hsn_sac,
    }));
  }

  const preview = computeLine({
    qty: Number(f.qty) || 0,
    unit_price: Number(f.unit_price) || 0,
    discount_type: f.discount_type,
    discount_value: Number(f.discount_value) || 0,
    tax_rate: Number(f.tax_rate) || 0,
    cost_rate: Number(f.cost_rate) || 0,
  });

  function submit() {
    setError(undefined);
    const fd = new FormData();
    fd.set("quotationId", quotationId);
    if (line) fd.set("id", line.id);
    fd.set("item_id", f.item_id);
    fd.set("title", f.title);
    fd.set("section_id", f.section_id);
    fd.set("area", f.area);
    fd.set("category", f.category);
    fd.set("description", f.description);
    fd.set("hsn_sac", f.hsn_sac);
    fd.set("qty", f.qty);
    fd.set("uom", f.uom);
    fd.set("unit_price", f.unit_price);
    fd.set("discount_type", f.discount_type);
    fd.set("discount_value", f.discount_value);
    fd.set("tax_rate", f.tax_rate);
    fd.set("cost_rate", f.cost_rate);

    start(async () => {
      const res = await (line ? updateLineAction : addLineAction)(undefined, fd);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        if (!line) setF(initial(undefined, defaultSectionId));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !line) setF(initial(undefined, defaultSectionId));
        if (o && line) setF(initial(line));
        setError(undefined);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{line ? "Edit line" : "Add line"}</DialogTitle>
          <DialogDescription>
            Pick a catalogue item to autofill rate, UOM, GST and HSN — or enter an ad-hoc line.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Catalogue item" hint="Optional — autofills from the item master">
            <ItemCombobox onSelect={onPickItem} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Line title" required>
                <Input
                  value={f.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. 01 Wooden Partition"
                />
              </Field>
            </div>
            <Field label="Section">
              <Select value={f.section_id} onChange={(e) => set("section_id", e.target.value)}>
                <option value="">Ungrouped</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Area / room" hint="e.g. Bedroom, All Area">
              <Input value={f.area} onChange={(e) => set("area", e.target.value)} />
            </Field>
            <Field label="Category" hint="e.g. Wood Work / Partitions">
              <Input value={f.category} onChange={(e) => set("category", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Qty" required>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={f.qty}
                onChange={(e) => set("qty", e.target.value)}
              />
            </Field>
            <Field label="UOM">
              <Select value={f.uom} onChange={(e) => set("uom", e.target.value as Uom)}>
                {UOMS.map((u) => (
                  <option key={u} value={u}>
                    {uomLabel[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit price (₹)" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={f.unit_price}
                onChange={(e) => set("unit_price", e.target.value)}
              />
            </Field>
            <Field label="GST %">
              <Select value={f.tax_rate} onChange={(e) => set("tax_rate", e.target.value)}>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Discount type">
              <Select
                value={f.discount_type}
                onChange={(e) => set("discount_type", e.target.value as DiscountType)}
              >
                {DISCOUNT_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d === "amount" ? "₹ Amount" : "% Percent"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Discount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={f.discount_value}
                onChange={(e) => set("discount_value", e.target.value)}
              />
            </Field>
            <Field label="HSN / SAC">
              <Input value={f.hsn_sac} onChange={(e) => set("hsn_sac", e.target.value)} />
            </Field>
            <Field label="Cost/unit (₹)" hint="Internal — not printed">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={f.cost_rate}
                onChange={(e) => set("cost_rate", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Description / spec">
            <Textarea
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Providing and installation of…"
            />
          </Field>

          {/* Live engine preview — same computeLine the server uses. */}
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3 text-sm tabular">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[var(--color-ink-secondary)]">
              <span>Subtotal {inr(preview.line_subtotal)}</span>
              <span>− Disc {inr(preview.discount_amount)}</span>
              <span>Taxable {inr(preview.taxable)}</span>
              <span>+ GST {inr(preview.tax_amount)}</span>
              <span className="font-semibold text-[var(--color-ink)]">
                = {inr(preview.line_total)}
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : line ? "Save line" : "Add line"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
