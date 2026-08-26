"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import type { LeadStatusDef } from "@/lib/lead-management-model";
import type { WorkspaceOption } from "@/lib/workspace-model";
import type { Member } from "@/lib/data/team";
import { createLeadAction, type FormState } from "../actions";
import { FormError, FormGrid, SubmitButton } from "../../dashboard/workspace-ui";

/**
 * Capture a lead and its brief in one pass.
 *
 * Contact details are required-ish; everything under "Project brief" is
 * optional but worth asking while the client is still on the phone, because
 * these are the fields the quotation later reads instead of making someone
 * retype the whole scope.
 */
export function NewLeadForm({
  statuses,
  options,
  members,
}: {
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
  members: Member[];
}) {
  const [state, action] = useActionState<FormState, FormData>(createLeadAction, undefined);
  const opts = (kind: WorkspaceOption["kind"]) =>
    options.filter((o) => o.kind === kind && o.is_active);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to Lead Management
      </Link>
      <h1 className="mb-1 text-2xl font-semibold text-[var(--color-ink)]">New lead</h1>
      <p className="mb-6 text-sm text-[var(--color-ink-secondary)]">
        Capture the enquiry and as much of the brief as you have.
      </p>

      <form action={action} className="flex flex-col gap-5">
        <FormError error={state?.error} />

        <Card className="p-5">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Contact
          </p>
          <FormGrid>
            <Field label="Client name" htmlFor="name" required>
              <Input id="name" name="name" placeholder="Mr Suresh" autoFocus />
            </Field>
            <Field label="Phone" htmlFor="phone" hint="One lead per number — duplicates are refused.">
              <Input id="phone" name="phone" placeholder="+91 98765 43210" />
            </Field>
            <Field label="Alternate contact" htmlFor="alt_phone">
              <Input id="alt_phone" name="alt_phone" />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" />
            </Field>
            <Field label="Speaking to" htmlFor="contact_role">
              <Select id="contact_role" name="contact_role" defaultValue="owner">
                {opts("contact_role").map((o) => (
                  <option key={o.id} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Organisation" htmlFor="org_type">
              <Select id="org_type" name="org_type" defaultValue="residential">
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </Select>
            </Field>
          </FormGrid>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Project brief
          </p>
          <FormGrid>
            <Field label="Project name" htmlFor="project_name">
              <Input id="project_name" name="project_name" placeholder="Anil Residence" />
            </Field>
            <Field label="Property type" htmlFor="project_type">
              <Select id="project_type" name="project_type" defaultValue="">
                <option value="">—</option>
                {opts("project_type").map((o) => (
                  <option key={o.id} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Budget" htmlFor="budget_band">
              <Select id="budget_band" name="budget_band" defaultValue="">
                <option value="">—</option>
                {opts("budget_band").map((o) => (
                  <option key={o.id} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Scope of work" htmlFor="scope">
              <Select id="scope" name="scope" defaultValue="">
                <option value="">—</option>
                {opts("lead_scope").map((o) => (
                  <option key={o.id} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Layout size (sq ft)" htmlFor="layout_sqft">
              <Input id="layout_sqft" name="layout_sqft" type="number" min="0" step="1" />
            </Field>
            <Field label="Estimated value (₹)" htmlFor="value">
              <Input id="value" name="value" type="number" min="0" step="1000" />
            </Field>
            <Field label="Rooms in scope" htmlFor="rooms" hint="Comma separated.">
              <Input id="rooms" name="rooms" placeholder="Kitchen, Master bedroom, Living" />
            </Field>
            <Field label="Interior theme" htmlFor="theme">
              <Input id="theme" name="theme" placeholder="Modern minimal" />
            </Field>
          </FormGrid>
          <div className="mt-4">
            <Field label="What did they ask for?" htmlFor="description">
              <Textarea id="description" name="description" rows={3} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Where it came from
          </p>
          <FormGrid>
            <Field label="Source" htmlFor="source" required>
              <Select id="source" name="source" defaultValue="manual">
                {opts("lead_source").map((o) => (
                  <option key={o.id} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Starting status" htmlFor="status">
              <Select id="status" name="status" defaultValue="new">
                {statuses.filter((s) => s.is_active && !s.is_won && !s.is_lost).map((s) => (
                  <option key={s.id} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Sales owner" htmlFor="sales_owner_id">
              <Select id="sales_owner_id" name="sales_owner_id" defaultValue="">
                <option value="">Me</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" placeholder="Bengaluru" />
            </Field>
          </FormGrid>
        </Card>

        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Creating…">Create lead</SubmitButton>
          <Link
            href="/leads"
            className="text-[13px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
