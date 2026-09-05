"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createAssetAction } from "./actions";
import { ASSET_KINDS, KIND_LABELS } from "@/lib/design-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/** Add-asset form — the one primary (red) action of the gallery view. */
export function AddAssetForm() {
  const [state, formAction, pending] = useActionState<
    { error?: string } | undefined,
    FormData
  >(createAssetAction, undefined);

  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
        <Plus className="size-4 text-[var(--color-red)]" /> Add asset
      </h2>
      <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" placeholder="e.g. Living room 3D v2" />
        </Field>

        <Field label="Kind" htmlFor="kind" required>
          <Select id="kind" name="kind" defaultValue="2d">
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Project label" htmlFor="project_label" hint="Tag the asset to a project, e.g. Mehta Residence">
          <Input id="project_label" name="project_label" />
        </Field>

        <Field label="Link (URL)" htmlFor="url" hint="Paste the link to the drawing/render — file storage is not wired in v1">
          <Input id="url" name="url" type="url" placeholder="https://…" />
        </Field>

        <div className="md:col-span-2">
          <Field label="Note" htmlFor="note">
            {/* The Field already said htmlFor="note"; the control had no id,
                so the label pointed at nothing. */}
            <Textarea id="note" name="note" placeholder="Revision, scope, anything reviewers should know…" />
          </Field>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)] md:col-span-2">{state.error}</p>
        )}

        <div className="flex items-center justify-end md:col-span-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add asset"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
