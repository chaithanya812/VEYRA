"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import type { FormState } from "../actions";
import { UOMS } from "@/lib/items-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Inline "Add rate contract" form on the vendor detail page. Rate is CONFIG
 *  the user types — never an LLM output. */
export function AddRateContractForm({
  vendorId,
  action,
}: {
  vendorId: string;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4 border-t border-[var(--color-border)] pt-4">
      <input type="hidden" name="vendor_id" value={vendorId} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <Field label="Item" htmlFor="item_name" required>
          <Input id="item_name" name="item_name" placeholder="e.g. 18mm BWP Plywood" />
        </Field>
        <Field label="UOM" htmlFor="uom">
          <Select id="uom" name="uom" defaultValue="">
            <option value="">—</option>
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate ₹" htmlFor="rate" required>
          <Input
            id="rate"
            name="rate"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 95"
          />
        </Field>
        <Field label="MOQ" htmlFor="moq">
          <Input id="moq" name="moq" type="number" min="0" step="0.01" placeholder="e.g. 50" />
        </Field>
        <Field label="Lead time (days)" htmlFor="lead_time_days">
          <Input
            id="lead_time_days"
            name="lead_time_days"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 7"
          />
        </Field>
        <Field label="Valid from" htmlFor="valid_from">
          <Input id="valid_from" name="valid_from" type="date" />
        </Field>
        <Field label="Valid to" htmlFor="valid_to">
          <Input id="valid_to" name="valid_to" type="date" />
        </Field>
      </div>

      {state?.error && (
        <p className="text-sm text-[var(--color-red)]">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Plus className="size-4" /> Add rate contract
        </Button>
      </div>
    </form>
  );
}
