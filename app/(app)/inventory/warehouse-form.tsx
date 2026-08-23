"use client";

import { useActionState } from "react";
import { createWarehouseAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/** Inline create-warehouse form on the Warehouses tab. The submit stays
 *  secondary — the view's one red primary is "Record stock-in". */
export function WarehouseForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createWarehouseAction,
    undefined,
  );

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Add warehouse
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="wh_name" required>
            <Input
              id="wh_name"
              name="name"
              placeholder='e.g. Main godown'
            />
          </Field>
          <Field label="Project" htmlFor="wh_project" hint="Optional free label">
            <Input
              id="wh_project"
              name="project_label"
              placeholder="e.g. Malviya Nagar site"
            />
          </Field>
          <Field label="Address" htmlFor="wh_address">
            <Input
              id="wh_address"
              name="address"
              placeholder="Optional"
            />
          </Field>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Adding…" : "Add warehouse"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
