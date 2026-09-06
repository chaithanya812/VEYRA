"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createDesignPromptAction } from "./actions";
import { extractVariables } from "@/lib/prompt-library-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/**
 * Add your firm's own prompt.
 *
 * Variables are written as `{{name}}` and detected as you type, so the writer
 * can see immediately whether the blank they meant will actually become a
 * field. That feedback is the whole reason this is a client component; the
 * detection itself is the model's `extractVariables`, shared with the composer
 * so the two can never disagree about what a variable is.
 */
export function NewPromptForm() {
  const [state, formAction, pending] = useActionState<
    { error?: string } | undefined,
    FormData
  >(createDesignPromptAction, undefined);
  const [body, setBody] = useState("");

  const detected = extractVariables(body);

  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
        <Plus className="size-4 text-[var(--color-red)]" /> Add your own prompt
      </h2>
      <p className="mb-4 text-xs text-[var(--color-ink-secondary)]">
        Write <code className="font-mono">{"{{room}}"}</code> anywhere you want a
        blank — it becomes a field in the composer above.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Name" htmlFor="prompt_name" required>
          <Input id="prompt_name" name="name" placeholder="e.g. Balcony makeover" />
        </Field>

        <Field label="Template" htmlFor="prompt_body" required>
          <Textarea
            id="prompt_body"
            name="prompt"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Using the attached photo of the {{room}}, replace the {{surface}} with {{material}}."
          />
        </Field>

        {detected.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-ink-secondary)]">
            Detected:
            {detected.map((v) => (
              <span
                key={v}
                className="rounded-full border border-[color-mix(in_srgb,var(--color-chart-3)_35%,white)] bg-[var(--color-chart-3-tint)] px-2 py-px font-mono text-[10.5px] text-[var(--color-chart-3)]"
              >
                {v}
              </span>
            ))}
          </p>
        )}

        {state?.error && (
          <p role="alert" className="text-sm text-[var(--color-red)]">
            {state.error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add to library"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
