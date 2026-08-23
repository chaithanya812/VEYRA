"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addMRItemAction, type FormState } from "../actions";
import { UOMS } from "@/lib/items-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

/**
 * Inline add-item form on the MR detail page. Uncontrolled inputs (name attrs)
 * so React 19 clears them after a successful action; errors surface in red
 * below the grid (DESIGN-DIRECTION §5).
 */
export function AddItemForm({ mrId }: { mrId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addMRItemAction,
    undefined,
  );

  return (
    <form action={formAction} className="mt-4 border-t border-[var(--color-border)] pt-4">
      <input type="hidden" name="mrId" value={mrId} />
      <div className="grid grid-cols-[minmax(0,1fr)_92px_88px_minmax(0,1fr)_auto] items-start gap-2">
        <Field label="Item" htmlFor="add_item_name" required>
          <Input id="add_item_name" name="item_name" placeholder="Search or type an item…" autoComplete="off" />
        </Field>
        <Field label="UOM" htmlFor="add_item_uom">
          <Select id="add_item_uom" name="uom" className="h-10">
            <option value="">—</option>
            {UOMS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Qty" htmlFor="add_item_qty" required>
          <Input id="add_item_qty" name="qty" type="number" min="0" step="any" inputMode="decimal" className="text-right tabular" defaultValue="0" />
        </Field>
        <Field label="Remarks" htmlFor="add_item_remarks">
          <Input id="add_item_remarks" name="remarks" placeholder="Optional" />
        </Field>
        <div className="pt-[26px]">
          <Button type="submit" variant="secondary" size="md" disabled={pending}>
            <Plus className="size-4" /> {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
      {state?.error && (
        <p className="mt-2 text-xs text-[var(--color-red)]">{state.error}</p>
      )}
      <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">
        Typed names are matched against your catalogue first — unmatched lines stay flagged ad-hoc.
      </p>
    </form>
  );
}
