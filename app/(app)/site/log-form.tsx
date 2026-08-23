"use client";

import { useActionState } from "react";
import { addSiteLogAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

const today = () => new Date().toISOString().slice(0, 10);

/** Add-log form on the Daily logs tab — the tab's one red primary (§Design). */
export function AddLogForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addSiteLogAction,
    undefined,
  );

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Add daily log
      </h2>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Project" htmlFor="log_project" hint="Optional label">
            <Input
              id="log_project"
              name="project_label"
              placeholder="e.g. Malviya Nagar site"
            />
          </Field>
          <Field label="Date" htmlFor="log_date">
            <Input
              id="log_date"
              name="log_date"
              type="date"
              defaultValue={today()}
            />
          </Field>
          <Field
            label="Photo URL"
            htmlFor="log_photo_url"
            hint="Optional pasted link (v1)"
          >
            <Input
              id="log_photo_url"
              name="photo_url"
              placeholder="https://…"
              type="url"
            />
          </Field>
        </div>
        <Field label="Work summary" htmlFor="log_summary" required>
          <Textarea
            id="log_summary"
            name="work_summary"
            placeholder="What was done on site today — progress, blockers, material status…"
          />
        </Field>
        <Field label="Photo caption" htmlFor="log_photo_caption">
          <Input
            id="log_photo_caption"
            name="photo_caption"
            placeholder="Optional caption for the photo above"
          />
        </Field>

        {state?.error && (
          <p className="text-sm text-[var(--color-red)]">{state.error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add log"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
