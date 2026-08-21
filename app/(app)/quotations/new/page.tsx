"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createQuotationAction, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, PageHeader } from "@/components/ui/primitives";

export default function NewQuotationPage() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createQuotationAction,
    undefined,
  );

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/quotations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to quotations
      </Link>
      <PageHeader
        title="New quotation"
        subtitle="Creates a draft with an auto FY-numbered ref; add the BOQ next."
      />

      <Card className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Title" htmlFor="title" hint="e.g. 3BHK Interiors — Mr Suresh">
            <Input id="title" name="title" placeholder="Quotation" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer name" htmlFor="customer_name">
              <Input id="customer_name" name="customer_name" placeholder="e.g. Mr Suresh" />
            </Field>
            <Field label="Customer phone" htmlFor="customer_phone">
              <Input id="customer_phone" name="customer_phone" placeholder="+91 …" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer email" htmlFor="customer_email">
              <Input id="customer_email" name="customer_email" type="email" />
            </Field>
            <Field label="Place of supply" htmlFor="place_of_supply" hint="Indian state — for GST">
              <Input id="place_of_supply" name="place_of_supply" placeholder="e.g. Telangana" />
            </Field>
          </div>

          {state?.error && (
            <p className="text-sm text-[var(--color-red)]">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/quotations">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create & add items"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
