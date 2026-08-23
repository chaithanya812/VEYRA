"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createStageAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function AddStageForm() {
  const [state, formAction, pending] = useActionState(createStageAction, undefined);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="w-64">
        <Field label="New stage name" htmlFor="name">
          <Input
            id="name"
            name="name"
            placeholder="e.g. Site Measurement"
            maxLength={60}
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={pending}>
        <Plus className="size-4" />
        {pending ? "Adding…" : "Add stage"}
      </Button>
      {state?.error && (
        <p className="pb-3 text-xs text-[var(--color-red)]" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
