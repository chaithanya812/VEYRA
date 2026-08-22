import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2, Copy, GitBranch } from "lucide-react";
import { getQuotation, listVersions } from "@/lib/data/quotations";
import { getViewer } from "@/lib/data/context";
import { QUOTE_STATUSES } from "@/lib/quotations-model";
import { statusTone, statusLabel } from "@/lib/quotations-ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { PageHeader, StatusChip, Card } from "@/components/ui/primitives";
import { DownloadQuoteButton } from "@/components/download-quote-button";
import type { QuotationPdfData } from "@/lib/quotations-pdf";
import { fmtDate } from "@/lib/utils";
import { QuoteBuilder } from "../quote-builder";
import { setStatusAction, setShareAction, newVersionAction } from "../actions";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getQuotation(id);
  if (!data) notFound();
  const { quotation, sections, lines } = data;
  const [versions, viewer] = await Promise.all([
    listVersions(quotation.version_group),
    getViewer(),
  ]);

  // Customer-facing PDF payload — cost/margin are intentionally excluded.
  const pdfData: QuotationPdfData = {
    quotation: {
      number: quotation.number,
      version: quotation.version,
      title: quotation.title,
      customer_name: quotation.customer_name,
      customer_phone: quotation.customer_phone,
      customer_email: quotation.customer_email,
      site_address: quotation.site_address,
      place_of_supply: quotation.place_of_supply,
      seller_state: quotation.seller_state,
      gst_treatment: quotation.gst_treatment,
      works_contract: quotation.works_contract,
      subtotal: quotation.subtotal,
      discount_total: quotation.discount_total,
      taxable_total: quotation.taxable_total,
      tax_total: quotation.tax_total,
      cgst_total: quotation.cgst_total,
      sgst_total: quotation.sgst_total,
      igst_total: quotation.igst_total,
      grand_total: quotation.grand_total,
      terms: quotation.terms,
      valid_until: quotation.valid_until,
      created_at: quotation.created_at,
    },
    sections: sections.map((s) => ({ id: s.id, title: s.title, sort_order: s.sort_order })),
    lines: lines.map((l) => ({
      id: l.id,
      section_id: l.section_id,
      title: l.title,
      area: l.area,
      category: l.category,
      description: l.description,
      hsn_sac: l.hsn_sac,
      qty: l.qty,
      uom: l.uom,
      unit_price: l.unit_price,
      discount_amount: l.discount_amount,
      tax_rate: l.tax_rate,
      taxable: l.taxable,
      tax_amount: l.tax_amount,
      line_total: l.line_total,
    })),
    seller: viewer ? { name: viewer.orgName, gstin: null } : null,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/quotations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to quotations
      </Link>

      <PageHeader
        title={quotation.title}
        subtitle={`${quotation.number}${quotation.version > 1 ? ` · v${quotation.version}` : ""} · Updated ${fmtDate(quotation.updated_at)}`}
        actions={<StatusChip tone={statusTone[quotation.status]} label={statusLabel[quotation.status]} />}
      />

      {/* Action bar */}
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <form action={setStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={quotation.id} />
          <span className="text-sm text-[var(--color-ink-secondary)]">Status</span>
          <Select name="status" defaultValue={quotation.status} className="h-9 w-36">
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm">Set</Button>
        </form>

        <div className="h-6 w-px bg-[var(--color-border)]" />

        <form action={setShareAction}>
          <input type="hidden" name="id" value={quotation.id} />
          <input type="hidden" name="enabled" value={String(!quotation.share_enabled)} />
          <Button type="submit" variant={quotation.share_enabled ? "danger" : "secondary"} size="sm">
            <Link2 className="size-4" />
            {quotation.share_enabled ? "Disable link" : "Create share link"}
          </Button>
        </form>

        {quotation.share_enabled && quotation.share_token && (
          <a
            href={`/q/${quotation.share_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-red)] hover:underline"
          >
            <Copy className="size-3.5" /> /q/{quotation.share_token.slice(0, 10)}…
          </a>
        )}

        <div className="h-6 w-px bg-[var(--color-border)]" />

        <DownloadQuoteButton data={pdfData} />

        <form action={newVersionAction}>
          <input type="hidden" name="id" value={quotation.id} />
          <Button type="submit" variant="ghost" size="sm">
            <GitBranch className="size-4" /> New version
          </Button>
        </form>

        {versions.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-ink-secondary)]">
            <span>Versions:</span>
            {versions.map((v) => (
              <Link
                key={v.id}
                href={`/quotations/${v.id}`}
                className={
                  v.id === quotation.id
                    ? "font-semibold text-[var(--color-ink)]"
                    : "text-[var(--color-red)] hover:underline"
                }
              >
                v{v.version}
              </Link>
            ))}
            {versions
              .filter((v) => v.id !== quotation.id)
              .map((v) => (
                <Link
                  key={`cmp-${v.id}`}
                  href={`/quotations/${quotation.id}/compare/${v.id}`}
                  className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-ink-secondary)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
                >
                  Compare with v{v.version}
                </Link>
              ))}
          </div>
        )}
      </Card>

      <QuoteBuilder quotation={quotation} sections={sections} lines={lines} />
    </div>
  );
}
