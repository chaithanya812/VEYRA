"use client";

import { useActionState } from "react";
import {
  advancePanelAction,
  generateTagsAction,
  type FormState,
} from "./nesting-actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/** Generate-QR-tags form — the Panel traceability section's one red primary
 *  (§Design). One tag per PHYSICAL panel; tokens are minted server-side. */
export function GenerateTagsForm({
  cutlists,
}: {
  cutlists: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    generateTagsAction,
    undefined,
  );

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Generate panel QR tags
      </h2>
      <form
        action={formAction}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Field label="Cutlist" htmlFor="tags_cutlist" required>
            <Select id="tags_cutlist" name="cutlist_id" required>
              <option value="">Pick a cutlist…</option>
              {cutlists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Generating…" : "Generate tags"}
        </Button>
      </form>
      {state?.error && (
        <p className="mt-3 text-sm text-[var(--color-red)]">{state.error}</p>
      )}
    </Card>
  );
}

/** Per-panel Advance control — secondary (black), never a second red primary.
 *  Moves the tag one step along cut → … → installed and appends an event. */
export function AdvancePanelButton({ tagId }: { tagId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    advancePanelAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="tag_id" value={tagId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "…" : "Advance"}
      </Button>
      {state?.error && (
        <span className="text-xs text-[var(--color-red)]">{state.error}</span>
      )}
    </form>
  );
}
