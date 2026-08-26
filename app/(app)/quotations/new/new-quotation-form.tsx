"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FolderKanban, Users } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import { cn, inr } from "@/lib/utils";
import { INDIAN_STATES } from "@/lib/quotations-model";
import { createQuotationAction, type FormState } from "../actions";
import { FormError, FormGrid, SubmitButton } from "../../dashboard/workspace-ui";

/**
 * Create a quotation.
 *
 * The important control is Source. A quote raised from a LEAD carries that
 * lead's brief into the AI generator and links the two records; one raised
 * against a PROJECT joins to the project instead. Standalone exists for the
 * genuine one-off, but it is the last option, not the default — a quote with
 * nothing behind it is how a CRM loses its own history.
 */

type Source = "lead" | "project" | "standalone";

export interface PickerOption {
  id: string;
  label: string;
  sub?: string | null;
  value?: number | null;
}

export function NewQuotationForm({
  leads,
  projects,
  defaultLeadId,
}: {
  leads: PickerOption[];
  projects: PickerOption[];
  defaultLeadId?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(createQuotationAction, undefined);
  const [source, setSource] = useState<Source>(
    defaultLeadId ? "lead" : leads.length > 0 ? "lead" : projects.length > 0 ? "project" : "standalone",
  );
  const [leadId, setLeadId] = useState(defaultLeadId ?? leads[0]?.id ?? "");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");

  const picked = useMemo(() => {
    if (source === "lead") return leads.find((l) => l.id === leadId) ?? null;
    if (source === "project") return projects.find((p) => p.id === projectId) ?? null;
    return null;
  }, [source, leadId, projectId, leads, projects]);

  const sources: { id: Source; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: "lead", label: "Lead", icon: <Users className="size-3.5" />, disabled: leads.length === 0 },
    { id: "project", label: "Project", icon: <FolderKanban className="size-3.5" />, disabled: projects.length === 0 },
    { id: "standalone", label: "Standalone", icon: null },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/quotations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to quotations
      </Link>
      <h1 className="mb-1 text-2xl font-semibold text-[var(--color-ink)]">New quotation</h1>
      <p className="mb-6 text-sm text-[var(--color-ink-secondary)]">
        Creates a draft with an FY-numbered reference, your default terms and GST rate.
        Add the BOQ next — by hand, from a template, or with AI.
      </p>

      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="source" value={source} />
        <FormError error={state?.error} />

        <Card className="p-5">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Source
          </p>
          <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1">
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={s.disabled}
                onClick={() => setSource(s.id)}
                aria-pressed={source === s.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
                  source === s.id
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
                )}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {source === "lead" && (
              <Field label="Which lead?" htmlFor="leadId" required>
                <Select
                  id="leadId"
                  name="leadId"
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                      {l.sub ? ` — ${l.sub}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {source === "project" && (
              <Field label="Which project?" htmlFor="projectId" required>
                <Select
                  id="projectId"
                  name="projectId"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.sub ? ` — ${p.sub}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {source === "standalone" && (
              <p className="text-[13px] text-[var(--color-ink-secondary)]">
                Not linked to anything — you will need to enter the customer details yourself below.
              </p>
            )}

            {picked && (
              <p className="mt-2 text-xs text-[var(--color-ink-secondary)]">
                Customer details and the project brief are carried across automatically.
                {picked.value ? ` Estimated value ${inr(picked.value)}.` : ""}
              </p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Document
          </p>
          <FormGrid>
            <Field label="Quotation name" htmlFor="title" hint="Shown at the top of the PDF.">
              <Input
                id="title"
                name="title"
                placeholder={picked?.label ? `${picked.label} — Interiors` : "3BHK Interiors"}
              />
            </Field>
            <Field label="Type" htmlFor="doc_type">
              <Select id="doc_type" name="doc_type" defaultValue="regular">
                <option value="regular">Regular</option>
                <option value="modular">Modular</option>
                <option value="budget">Budget estimate</option>
                <option value="revision">Revision</option>
              </Select>
            </Field>
            <Field
              label="Reference number"
              htmlFor="ref_no"
              hint="Leave blank to use the auto FY series."
            >
              <Input id="ref_no" name="ref_no" placeholder="Auto" />
            </Field>
            <Field label="Place of supply" htmlFor="place_of_supply" hint="Indian state — drives CGST/SGST vs IGST.">
              <Select id="place_of_supply" name="place_of_supply" defaultValue="">
                <option value="">—</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </Card>

        {source === "standalone" && (
          <Card className="p-5">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
              Customer
            </p>
            <FormGrid>
              <Field label="Customer name" htmlFor="customer_name">
                <Input id="customer_name" name="customer_name" placeholder="Mr Suresh" />
              </Field>
              <Field label="Phone" htmlFor="customer_phone">
                <Input id="customer_phone" name="customer_phone" />
              </Field>
              <Field label="Email" htmlFor="customer_email">
                <Input id="customer_email" name="customer_email" type="email" />
              </Field>
            </FormGrid>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Creating…">Create quotation</SubmitButton>
          <Link
            href="/quotations"
            className="text-[13px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
