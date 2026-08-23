"use client";

import { useRef, useState, useTransition } from "react";
import { addProjectNoteAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

export function AddNoteForm({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="mb-5 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const note = String(new FormData(e.currentTarget).get("note") ?? "");
        setError(undefined);
        startTransition(async () => {
          const res = await addProjectNoteAction(projectId, note);
          if (res?.error) {
            setError(res.error);
          } else {
            formRef.current?.reset();
          }
        });
      }}
    >
      <Textarea
        name="note"
        placeholder="Add a site update — progress, delay, material arrival…"
      />
      {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
