"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createLeadAction, type FormState } from "../actions";
import { LEAD_SOURCES } from "@/lib/leads-model";
import { sourceLabel } from "@/lib/leads-ui";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, PageHeader } from "@/components/ui/primitives";

export default function NewLeadPage() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createLeadAction,
    undefined,
  );

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to leads
      </Link>
      <PageHeader title="New lead" />

      <Card className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="name" required>
            <Input id="name" name="name" placeholder="e.g. Mr Suresh" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Phone"
              htmlFor="phone"
              hint="Deduped — one lead per number"
            >
              <Input id="phone" name="phone" placeholder="+91 …" />
            </Field>
            <Field label="Estimated value (₹)" htmlFor="value">
              <Input id="value" name="value" type="number" min="0" step="1000" />
            </Field>
          </div>

          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" />
          </Field>

          <Field label="Source" htmlFor="source" required>
            <Select id="source" name="source" defaultValue="manual">
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel[s]}
                </option>
              ))}
            </Select>
          </Field>

          {state?.error && (
            <p className="text-sm text-[var(--color-red)]">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/leads">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create lead"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
