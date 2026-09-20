"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { DownloadPoButton } from "@/components/download-po-button";
import type { PoTemplate } from "@/lib/data/po-config";
import type { PoPdfTemplateConfig } from "@/lib/po-pdf";
import { savePoTemplateAction, type FormState } from "./actions";
import { FormError, FormGrid, Section, SubmitButton } from "../../dashboard/workspace-ui";

const initial: FormState = undefined;

function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-[var(--color-border-strong)] accent-[var(--color-ink)]"
      />
      <span>
        {label}
        {hint && (
          <span className="mt-0.5 block text-xs text-[var(--color-ink-secondary)]">{hint}</span>
        )}
      </span>
    </label>
  );
}

/**
 * Tenant-authored PO PDF template. Toggles must change the assembled PDF
 * (same generatePoPdf as a real order). Logo/signature are pasted URLs, not
 * an upload pipeline.
 */
export function PoTemplateCard({ template }: { template: PoTemplate }) {
  const [state, save] = useActionState(savePoTemplateAction, initial);
  const [footerNote, setFooterNote] = useState(template.footer_note ?? "");
  const [signatureLabel, setSignatureLabel] = useState(template.signature_label ?? "");
  const [logoUrl, setLogoUrl] = useState(template.logo_url ?? "");
  const [signatureUrl, setSignatureUrl] = useState(template.signature_url ?? "");
  const [showTax, setShowTax] = useState(template.show_tax_column);
  const [showUom, setShowUom] = useState(template.show_uom_column);
  const [showPlan, setShowPlan] = useState(template.show_payment_plan);
  const [showTerms, setShowTerms] = useState(template.show_terms);
  const [showBank, setShowBank] = useState(template.show_bank_details);
  const [bankDetails, setBankDetails] = useState(template.bank_details ?? "");

  const previewConfig: PoPdfTemplateConfig = useMemo(
    () => ({
      footer_note: footerNote.trim() || null,
      signature_label: signatureLabel.trim() || "Authorised signatory",
      logo_url: logoUrl.trim() || null,
      signature_url: signatureUrl.trim() || null,
      show_tax_column: showTax,
      show_uom_column: showUom,
      show_payment_plan: showPlan,
      show_terms: showTerms,
      show_bank_details: showBank,
      bank_details: bankDetails.trim() || null,
    }),
    [
      footerNote,
      signatureLabel,
      logoUrl,
      signatureUrl,
      showTax,
      showUom,
      showPlan,
      showTerms,
      showBank,
      bankDetails,
    ],
  );

  return (
    <Section
      title="Purchase-order PDF"
      description="What a vendor sees when you download a PO. Toggles change the document; preview uses the same renderer as a real order."
      action={<DownloadPoButton previewTemplate={previewConfig} label="Preview PDF" />}
    >
      <form action={save} className="flex flex-col gap-4">
        <FormError error={state?.error} />
        {state?.ok && (
          <p className="text-[13px] text-[var(--color-green)]">Saved.</p>
        )}
        <FormGrid>
          <Field label="Footer note" htmlFor="po_footer_note" hint="Printed at the bottom of every PO PDF.">
            <Textarea
              id="po_footer_note"
              name="footer_note"
              rows={3}
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              placeholder="Goods remain the vendor's risk until received at site."
            />
          </Field>
          <Field label="Signature label" htmlFor="po_signature_label">
            <Input
              id="po_signature_label"
              name="signature_label"
              value={signatureLabel}
              onChange={(e) => setSignatureLabel(e.target.value)}
              placeholder="Authorised signatory"
            />
          </Field>
          <Field
            label="Logo URL"
            htmlFor="po_logo_url"
            hint="A pasted image URL. This unit does not upload files."
          >
            <Input
              id="po_logo_url"
              name="logo_url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field
            label="Signature image URL"
            htmlFor="po_signature_url"
            hint="A pasted image URL. The signature label always prints."
          >
            <Input
              id="po_signature_url"
              name="signature_url"
              value={signatureUrl}
              onChange={(e) => setSignatureUrl(e.target.value)}
              placeholder="https://"
            />
          </Field>
        </FormGrid>

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            name="show_tax_column"
            label="Show tax column"
            hint="Tax % on each line."
            checked={showTax}
            onChange={setShowTax}
          />
          <Toggle
            name="show_uom_column"
            label="Show UOM column"
            checked={showUom}
            onChange={setShowUom}
          />
          <Toggle
            name="show_payment_plan"
            label="Show payment plan"
            hint="Milestone % and rupees, footing to the PO amount."
            checked={showPlan}
            onChange={setShowPlan}
          />
          <Toggle
            name="show_terms"
            label="Show terms"
            checked={showTerms}
            onChange={setShowTerms}
          />
          <Toggle
            name="show_bank_details"
            label="Show bank details"
            checked={showBank}
            onChange={setShowBank}
          />
        </div>

        <Field
          label="Bank details"
          htmlFor="po_bank_details"
          hint="Printed only when “Show bank details” is on."
        >
          <Textarea
            id="po_bank_details"
            name="bank_details"
            rows={3}
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            placeholder="Bank, account name, account number, IFSC"
          />
        </Field>

        <div>
          <SubmitButton pendingLabel="Saving…">Save PDF template</SubmitButton>
        </div>
      </form>
    </Section>
  );
}
