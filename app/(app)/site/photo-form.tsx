"use client";

import { useActionState } from "react";
import { addPhotoAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/** Add-photo form on the Photos tab. Photos are pasted links in v1 — no
 *  uploads; the submit is secondary (this tab has no red primary). */
export function AddPhotoForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addPhotoAction,
    undefined,
  );

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Add photo
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Project" htmlFor="photo_project" hint="Optional label">
            <Input
              id="photo_project"
              name="project_label"
              placeholder="e.g. Malviya Nagar site"
            />
          </Field>
          <Field label="Caption" htmlFor="photo_caption">
            <Input
              id="photo_caption"
              name="caption"
              placeholder="e.g. False ceiling, north wing"
            />
          </Field>
          <Field label="Image URL" htmlFor="photo_url" required>
            <Input
              id="photo_url"
              name="url"
              type="url"
              placeholder="https://…"
            />
          </Field>
        </div>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Adding…" : "Add photo"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
