"use client";

import { useActionState } from "react";
import { addWorkCenterAction, type FormState } from "./nesting-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/** Add-work-center form — the Work centers section's one red primary (§Design). */
export function WorkCenterForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addWorkCenterAction,
    undefined,
  );

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Add work center
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" htmlFor="wc_name" required>
            <Input
              id="wc_name"
              name="name"
              placeholder="e.g. Beam saw — panel sizing"
            />
          </Field>
          <Field label="Kind" htmlFor="wc_kind" hint="Optional station type">
            <Input
              id="wc_kind"
              name="kind"
              placeholder="e.g. cutting / edgebanding / drilling / qc"
            />
          </Field>
          <Field
            label="Capacity / day"
            htmlFor="wc_capacity"
            hint="Optional — panels per day"
          >
            <Input
              id="wc_capacity"
              name="capacity_per_day"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
            />
          </Field>
          <Field label="Notes" htmlFor="wc_notes">
            <Input id="wc_notes" name="notes" placeholder="Optional" />
          </Field>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add work center"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
