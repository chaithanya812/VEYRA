"use client";

import { useRef, useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { addCommentAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

/** Pin-comment form — x/y are optional percentages of the asset (v1: text, no image overlay). */
export function CommentForm({ assetId }: { assetId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="mb-5 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(undefined);
        startTransition(async () => {
          const res = await addCommentAction(
            assetId,
            String(fd.get("body") ?? ""),
            String(fd.get("x_pct") ?? ""),
            String(fd.get("y_pct") ?? ""),
          );
          if (res?.error) {
            setError(res.error);
          } else {
            formRef.current?.reset();
          }
        });
      }}
    >
      <Textarea name="body" placeholder="Leave a review comment — or pin it to a spot below…" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pin X (%)" htmlFor="x_pct" hint="Optional — horizontal position on the asset">
          <Input id="x_pct" name="x_pct" type="number" min="0" max="100" step="0.01" inputMode="decimal" />
        </Field>
        <Field label="Pin Y (%)" htmlFor="y_pct" hint="Optional — vertical position on the asset">
          <Input id="y_pct" name="y_pct" type="number" min="0" max="100" step="0.01" inputMode="decimal" />
        </Field>
      </div>
      {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-secondary)]">
          <MapPin className="size-3.5" /> Pins show as “pin @ X%,Y%” next to the comment.
        </span>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add comment"}
        </Button>
      </div>
    </form>
  );
}
