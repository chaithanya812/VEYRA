"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fmtDate } from "@/lib/utils";
import type {
  AiRequestRow,
  PromptTemplate,
  QuotationSettings,
  TermsClause,
} from "@/lib/data/quotation-studio";
import {
  deleteTermsAction,
  saveQuotationSettingsAction,
  saveTermsAction,
  type FormState,
} from "./actions";
import { deletePromptAction, savePromptAction } from "../../quotations/ai-boq-actions";
import {
  Chip,
  Disclosure,
  Empty,
  FormError,
  FormGrid,
  List,
  Row,
  RowAction,
  Section,
  StatTile,
  SubmitButton,
  TileGrid,
} from "../../dashboard/workspace-ui";

/**
 * Quotation configuration: the numbers a quote starts from, the clause library,
 * the AI prompt library, and the log of what the AI has been asked.
 *
 * The defaults here are inputs to the pricing engine, never outputs of a model.
 * Changing the default GST rate changes what a NEW line starts at; it never
 * rewrites a quotation already sent.
 */

const initial: FormState = undefined;

export function QuotationSettingsView({
  settings,
  terms,
  prompts,
  requests,
  ai,
}: {
  settings: QuotationSettings;
  terms: TermsClause[];
  prompts: PromptTemplate[];
  requests: AiRequestRow[];
  ai: { configured: boolean; provider: string; model: string };
}) {
  const [defaultsState, saveDefaults] = useActionState(saveQuotationSettingsAction, initial);
  const [termsState, addTerms] = useActionState(saveTermsAction, initial);
  const [promptState, addPrompt] = useActionState(savePromptAction, initial);

  const ok = requests.filter((r) => r.status === "ok").length;
  const linesMade = requests.reduce((s, r) => s + (r.lines_created ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to settings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold text-[var(--color-ink)]">Quotations</h1>
      <p className="mb-6 text-sm text-[var(--color-ink-secondary)]">
        What every new quotation starts from, and the libraries it draws on.
      </p>

      <Section
        title="Defaults"
        description="Applied to new quotations and new BOQ lines. Existing documents are never rewritten."
      >
        <form action={saveDefaults} className="flex flex-col gap-4">
          <FormError error={defaultsState?.error} />
          <FormGrid>
            <Field label="Default GST rate (%)" htmlFor="default_gst_pct" required>
              <Input
                id="default_gst_pct"
                name="default_gst_pct"
                type="number"
                min="0"
                max="100"
                step="0.5"
                defaultValue={settings.default_gst_pct}
              />
            </Field>
            <Field label="Default margin (%)" htmlFor="default_margin_pct">
              <Input
                id="default_margin_pct"
                name="default_margin_pct"
                type="number"
                min="0"
                max="100"
                step="0.5"
                defaultValue={settings.default_margin_pct}
              />
            </Field>
            <Field label="Validity (days)" htmlFor="default_validity_days">
              <Input
                id="default_validity_days"
                name="default_validity_days"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.default_validity_days}
              />
            </Field>
            <Field
              label="Show cost column on the PDF"
              htmlFor="show_cost_column"
              hint="Internal cost roll-up. Off means clients never see it."
            >
              <Select
                id="show_cost_column"
                name="show_cost_column"
                defaultValue={settings.show_cost_column ? "on" : "off"}
              >
                <option value="off">Hidden from clients</option>
                <option value="on">Shown</option>
              </Select>
            </Field>
          </FormGrid>
          <Field label="Footer note" htmlFor="footer_note">
            <Textarea
              id="footer_note"
              name="footer_note"
              rows={2}
              defaultValue={settings.footer_note ?? ""}
              placeholder="Thank you for the opportunity. All queries to accounts@yourfirm.in"
            />
          </Field>
          <div className="flex items-center gap-2">
            <SubmitButton pendingLabel="Saving…">Save defaults</SubmitButton>
            {defaultsState?.ok && (
              <span className="text-[13px] text-[var(--color-green)]">Saved.</span>
            )}
          </div>
        </form>
      </Section>

      <Section
        title="Terms & conditions"
        description="Clauses marked as default are attached to every new quotation."
      >
        <Disclosure label="Add a clause">
          <form action={addTerms} className="flex flex-col gap-4">
            <FormError error={termsState?.error} />
            <Field label="Title" htmlFor="terms_title" required>
              <Input id="terms_title" name="title" placeholder="Cancellation" />
            </Field>
            <Field label="Clause" htmlFor="terms_body" required>
              <Textarea id="terms_body" name="body" rows={4} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                name="is_default"
                className="size-4 rounded border-[var(--color-border-strong)] accent-[var(--color-ink)]"
              />
              Attach to every new quotation
            </label>
            <div>
              <SubmitButton pendingLabel="Adding…">Add clause</SubmitButton>
            </div>
          </form>
        </Disclosure>

        <div className="mt-3">
          {terms.length === 0 ? (
            <Empty
              message="No clauses yet"
              hint="Use “Add clause” above. Clauses you mark auto-attach to every new quotation."
            />
          ) : (
            <List>
              {terms.map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  chips={t.is_default ? <Chip tone="green" label="Auto-attached" /> : undefined}
                  meta={t.body}
                  right={
                    <form action={deleteTermsAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <RowAction variant="danger" title="Delete clause">
                        Delete
                      </RowAction>
                    </form>
                  }
                />
              ))}
            </List>
          )}
        </div>
      </Section>

      <Section
        title="AI prompt library"
        description="Saved briefs your team starts from in the AI generator."
      >
        <div className="mb-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <Sparkles className="size-4 text-[var(--color-ink-secondary)]" />
            {ai.configured ? (
              <>
                <span className="text-[var(--color-ink)]">AI is live</span>
                <Chip tone="green" label={`${ai.provider} · ${ai.model}`} />
              </>
            ) : (
              <>
                <span className="text-[var(--color-ink)]">AI is not configured</span>
                <Chip tone="amber" label="Set the provider key" />
              </>
            )}
          </p>
          <p className="mt-1.5 text-xs text-[var(--color-ink-secondary)]">
            The AI structures scope — rooms, items, quantities. It never produces a
            price; every rate comes from your catalogue or from you.
          </p>
        </div>

        <Disclosure label="Add a prompt">
          <form action={addPrompt} className="flex flex-col gap-4">
            <FormError error={promptState?.error} />
            <Field label="Name" htmlFor="prompt_name" required>
              <Input id="prompt_name" name="name" placeholder="Villa — full interiors" />
            </Field>
            <Field label="Prompt" htmlFor="prompt_body" required>
              <Textarea
                id="prompt_body"
                name="prompt"
                rows={4}
                placeholder="Describe the kind of project this prompt covers, with the level of detail you want back."
              />
            </Field>
            <div>
              <SubmitButton pendingLabel="Adding…">Add prompt</SubmitButton>
            </div>
          </form>
        </Disclosure>

        <div className="mt-3">
          {prompts.length === 0 ? (
            <Empty
              message="No prompts saved"
              hint="Use “Add prompt” above to save a brief the BOQ generator can reuse."
            />
          ) : (
            <List>
              {prompts.map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  chips={p.is_system ? <Chip tone="neutral" label="Example" /> : undefined}
                  meta={p.prompt}
                  right={
                    <form action={deletePromptAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <RowAction variant="danger" title="Remove prompt">
                        Remove
                      </RowAction>
                    </form>
                  }
                />
              ))}
            </List>
          )}
        </div>
      </Section>

      <Section
        title="AI activity"
        description="Every generation is logged — what was asked, which model answered, how many lines came back."
      >
        <TileGrid>
          <StatTile label="Generations" value={requests.length} />
          <StatTile label="Succeeded" value={ok} tone={ok > 0 ? "green" : "neutral"} />
          <StatTile
            label="Failed"
            value={requests.length - ok}
            tone={requests.length - ok > 0 ? "amber" : "neutral"}
          />
          <StatTile label="Lines drafted" value={linesMade} />
        </TileGrid>

        <div className="mt-3">
          {requests.length === 0 ? (
            <Empty
              message="Nothing generated yet"
              hint="Open a quotation and use Generate with AI."
            />
          ) : (
            <List>
              {requests.map((r) => (
                <Row
                  key={r.id}
                  title={r.prompt.slice(0, 90) + (r.prompt.length > 90 ? "…" : "")}
                  chips={
                    <Chip
                      tone={r.status === "ok" ? "green" : "amber"}
                      label={r.status === "ok" ? `${r.lines_created} lines` : "Failed"}
                    />
                  }
                  meta={[
                    fmtDate(r.created_at),
                    `${r.provider} · ${r.model}`,
                    r.attachments > 0 ? `${r.attachments} attachment(s)` : null,
                    r.error_message,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </List>
          )}
        </div>
      </Section>
    </div>
  );
}
