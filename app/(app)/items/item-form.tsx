"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "./actions";
import {
  ITEM_TYPES,
  UOMS,
  GST_RATES,
  SUGGESTED_CATEGORIES,
  SUGGESTED_GOOD_TYPES,
  type Item,
} from "@/lib/items-model";
import { typeLabel, uomLabel } from "@/lib/items-ui";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ItemForm({
  action,
  mode,
  item,
}: {
  action: Action;
  mode: "create" | "edit";
  item?: Item;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-5">
        {mode === "edit" && item && (
          <input type="hidden" name="id" value={item.id} />
        )}

        {/* Identity */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Item name" htmlFor="name" required hint="Deduped — one item per name">
            <Input
              id="name"
              name="name"
              defaultValue={item?.name}
              placeholder="e.g. 18mm BWP Plywood"
            />
          </Field>
          <Field label="Item code (SKU)" htmlFor="code" hint="Optional; unique when set">
            <Input id="code" name="code" defaultValue={item?.code ?? ""} placeholder="e.g. PLY-18-BWP" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="type" required>
            <Select id="type" name="type" defaultValue={item?.type ?? "material"}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="category" hint="Product grouping — type or pick">
            <Input
              id="category"
              name="category"
              list="item-categories"
              defaultValue={item?.category ?? ""}
              placeholder="e.g. Plywood"
            />
            <datalist id="item-categories">
              {SUGGESTED_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Good type"
            htmlFor="good_type"
            hint="Merchandising class — not the Type enum"
          >
            <Input
              id="good_type"
              name="good_type"
              list="item-good-types"
              defaultValue={item?.good_type ?? ""}
              placeholder="e.g. Raw Material"
            />
            <datalist id="item-good-types">
              {SUGGESTED_GOOD_TYPES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Brand" htmlFor="brand">
            <Input id="brand" name="brand" defaultValue={item?.brand ?? ""} placeholder="e.g. Century" />
          </Field>
        </div>

        {/* Units & conversion (VEYRA delta: multi-UOM) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Base unit (stock/consume)" htmlFor="base_uom" required>
            <Select id="base_uom" name="base_uom" defaultValue={item?.base_uom ?? "nos"}>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {uomLabel[u]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Purchase unit" htmlFor="purchase_uom" hint="If bought in a different unit">
            <Select id="purchase_uom" name="purchase_uom" defaultValue={item?.purchase_uom ?? ""}>
              <option value="">— Same as base —</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {uomLabel[u]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Base units per purchase unit"
            htmlFor="purchase_to_base_factor"
            hint="e.g. 1 sheet = 32 sq.ft"
          >
            <Input
              id="purchase_to_base_factor"
              name="purchase_to_base_factor"
              type="number"
              min="0"
              step="0.0001"
              defaultValue={item?.purchase_to_base_factor ?? 1}
            />
          </Field>
        </div>

        {/* Rate & tax */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Default rate (₹ per base unit)" htmlFor="base_rate" hint="Config — not AI-produced">
            <Input
              id="base_rate"
              name="base_rate"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item?.base_rate ?? ""}
              placeholder="e.g. 95"
            />
          </Field>
          <Field label="HSN / SAC" htmlFor="hsn_sac">
            <Input id="hsn_sac" name="hsn_sac" defaultValue={item?.hsn_sac ?? ""} placeholder="e.g. 4412" />
          </Field>
          <Field label="GST %" htmlFor="tax_rate" required>
            <Select id="tax_rate" name="tax_rate" defaultValue={String(item?.tax_rate ?? 18)}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            defaultValue={item?.description ?? ""}
            placeholder="Specs, finish, notes…"
          />
        </Field>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button asChild type="button" variant="ghost">
            <Link href={mode === "edit" && item ? `/items/${item.id}` : "/items"}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "edit"
                ? "Save changes"
                : "Create item"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
