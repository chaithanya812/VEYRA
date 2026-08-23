"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createProjectAction } from "../actions";
import { PROJECT_STAGES, STAGE_LABELS } from "@/lib/projects-model";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, PageHeader } from "@/components/ui/primitives";

export default function NewProjectPage() {
  const [state, formAction, pending] = useActionState<
    { error?: string } | undefined,
    FormData
  >(createProjectAction, undefined);

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to projects
      </Link>
      <PageHeader title="New project" />

      <Card className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="name" required>
            <Input id="name" name="name" placeholder="e.g. Mehta Residence Fitout" />
          </Field>

          <Field label="Client name" htmlFor="client_name">
            <Input id="client_name" name="client_name" placeholder="e.g. Mr Mehta" />
          </Field>

          <Field label="Stage" htmlFor="stage" required>
            <Select id="stage" name="stage" defaultValue="planning">
              {PROJECT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Project value (₹)"
            htmlFor="project_value"
            hint="Total contract value — you can refine it later in Finance"
          >
            <Input
              id="project_value"
              name="project_value"
              type="number"
              min="0"
              step="1000"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" htmlFor="start_date">
              <Input id="start_date" name="start_date" type="date" />
            </Field>
            <Field label="Handover date" htmlFor="handover_date">
              <Input id="handover_date" name="handover_date" type="date" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" />
            </Field>
            <Field label="State" htmlFor="state">
              <Input id="state" name="state" />
            </Field>
          </div>

          <Field label="Pincode" htmlFor="pincode">
            <Input id="pincode" name="pincode" inputMode="numeric" />
          </Field>

          <Field label="Address" htmlFor="address">
            <Textarea id="address" name="address" placeholder="Site address…" />
          </Field>

          {state?.error && (
            <p className="text-sm text-[var(--color-red)]">{state.error}</p>
          )}

          {/* Sticky footer action bar (DESIGN-DIRECTION §5): Cancel ghost-left, primary red-right. */}
          <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
            <Link href="/projects">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
