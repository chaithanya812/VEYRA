"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createFollowUpAction } from "../pipeline/actions";

/**
 * New follow-up — the one primary action per view (red, DESIGN-DIRECTION §2).
 * Picks a lead (read-only) and a due date/time.
 */
export function NewFollowUpDialog({
  leads,
}: {
  leads: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  async function handleAction(formData: FormData) {
    setError(undefined);
    const result = await createFollowUpAction(formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="size-4" /> New follow-up
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New follow-up</DialogTitle>
          <DialogDescription>
            Schedule the next touchpoint against a lead.
          </DialogDescription>
        </DialogHeader>

        <form action={handleAction} className="flex flex-col gap-4">
          <Field label="Lead" htmlFor="lead_id" required>
            <Select id="lead_id" name="lead_id" defaultValue="">
              <option value="" disabled>
                Pick a lead…
              </option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due date & time" htmlFor="due_at" required>
            <Input id="due_at" name="due_at" type="datetime-local" />
          </Field>

          <Field label="Note" htmlFor="note">
            <Textarea name="note" placeholder="What is this call about…" />
          </Field>

          {error && (
            <p className="text-xs text-[var(--color-red)]" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" variant="primary">
              Schedule follow-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
