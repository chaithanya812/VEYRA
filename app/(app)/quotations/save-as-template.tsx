"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { saveAsTemplateAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SaveAsTemplateButton({ quotationId }: { quotationId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveAsTemplateAction,
    undefined,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Save className="size-4" /> Save as template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Captures this quotation&apos;s sections and line items as a reusable
            preset. Pricing is re-derived from scratch when you instantiate it.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="quotationId" value={quotationId} />
          <Field label="Template name" htmlFor="name" hint="e.g. 3BHK Premium">
            <Input id="name" name="name" placeholder="3BHK Premium" required />
          </Field>
          <Field label="Description" htmlFor="description">
            <Input id="description" name="description" placeholder="Optional" />
          </Field>

          {state?.error && (
            <p className="text-sm text-[var(--color-red)]">{state.error}</p>
          )}

          <DialogFooter>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogTrigger>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
