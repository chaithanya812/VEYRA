import type { Metadata } from "next";
import { Fragment } from "react";
import { getSharedQuotation } from "@/lib/data/quotations";
import { gstRateSummary } from "@/lib/quotations-model";
import { uomLabel } from "@/lib/items-ui";
import { inr, fmtDate } from "@/lib/utils";
import { DownloadQuoteButton } from "@/components/download-quote-button";
import type { QuotationPdfData } from "@/lib/quotations-pdf";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Quotation",
};

export default async function SharedQuotationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getSharedQuotation(token);

  if (!data) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-semibold text-[var(--color-ink)]">Link unavailable</h1>
        <p className="text-sm text-[var(--color-ink-secondary)]">
          This quotation link is not active. Please ask the sender for a current link.
        </p>
      </div>
    );
  }

  const { quotation: q, sections, lines, seller } = data;
  const linesBySection = new Map<string | null, typeof lines>();
  for (const l of lines) {
    const key = l.section_id ?? null;
    if (!linesBySection.has(key)) linesBySection.set(key, []);
    linesBySection.get(key)!.push(l);
  }

  const inter = q.gst_treatment === "inter";
  const rateSummary = gstRateSummary(
    lines.map((l) => ({ tax_rate: l.tax_rate, taxable: l.taxable, tax_amount: l.tax_amount })),
    q.gst_treatment,
  );

  const pdfData: QuotationPdfData = {
    quotation: {
      number: q.number,
      version: q.version,
      title: q.title,
      customer_name: q.customer_name,
      customer_phone: q.customer_phone,
      customer_email: q.customer_email,
      site_address: q.site_address,
      place_of_supply: q.place_of_supply,
      seller_state: q.seller_state,
      gst_treatment: q.gst_treatment,
      works_contract: q.works_contract,
      subtotal: q.subtotal,
      discount_total: q.discount_total,
      taxable_total: q.taxable_total,
      tax_total: q.tax_total,
      cgst_total: q.cgst_total,
      sgst_total: q.sgst_total,
      igst_total: q.igst_total,
      grand_total: q.grand_total,
      terms: q.terms,
      valid_until: q.valid_until,
      created_at: q.created_at,
    },
    seller,
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
  };

  const renderRows = (rows: typeof lines, startNo: number) =>
    rows.map((l, i) => (
      <tr key={l.id} className="border-b border-[var(--color-border)] align-top last:border-0">
        <td className="px-3 py-3 text-[var(--color-ink-secondary)] tabular">{startNo + i}</td>
        <td className="px-3 py-3">
          <div className="font-medium text-[var(--color-ink)]">{l.title}</div>
          {(l.area || l.category) && (
            <div className="text-xs text-[var(--color-ink-secondary)]">
              {[l.area, l.category].filter(Boolean).join(" · ")}
            </div>
          )}
          {l.description && (
            <div className="mt-1 text-xs text-[var(--color-ink-secondary)]">{l.description}</div>
          )}
        </td>
        <td className="px-3 py-3 text-right tabular">{Number(l.qty)}</td>
        <td className="px-3 py-3 text-[var(--color-ink-secondary)]">
          {uomLabel[l.uom as keyof typeof uomLabel] ?? l.uom}
        </td>
        <td className="px-3 py-3 text-right tabular">{inr(l.unit_price)}</td>
        <td className="px-3 py-3 text-right tabular text-[var(--color-ink-secondary)]">
          {Number(l.discount_amount) > 0 ? inr(l.discount_amount) : "—"}
        </td>
        <td className="px-3 py-3 text-right tabular font-medium">{inr(l.line_total)}</td>
      </tr>
    ));

  let counter = 1;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-5">
          <div>
            {seller?.name && (
              <p className="text-sm font-semibold text-[var(--color-red)]">{seller.name}</p>
            )}
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">{q.title}</h1>
            <p className="mt-0.5 text-sm text-[var(--color-ink-secondary)] tabular">
              {q.number}
              {q.version > 1 ? ` · v${q.version}` : ""}
              {seller?.gstin ? ` · GSTIN ${seller.gstin}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DownloadQuoteButton data={pdfData} />
            <div className="text-right text-sm text-[var(--color-ink-secondary)]">
              <p>{fmtDate(q.created_at)}</p>
              {q.valid_until && <p className="mt-0.5">Valid until {fmtDate(q.valid_until)}</p>}
            </div>
          </div>
        </div>

        {/* Customer */}
        {(q.customer_name || q.site_address || q.place_of_supply || q.seller_state) && (
          <div className="grid grid-cols-1 gap-1 border-b border-[var(--color-border)] py-4 text-sm sm:grid-cols-2">
            <div>
              {q.customer_name && (
                <p className="font-medium text-[var(--color-ink)]">{q.customer_name}</p>
              )}
              {q.customer_phone && <p className="text-[var(--color-ink-secondary)]">{q.customer_phone}</p>}
              {q.site_address && <p className="text-[var(--color-ink-secondary)]">{q.site_address}</p>}
            </div>
            <div className="text-[var(--color-ink-secondary)] sm:text-right">
              {q.seller_state && <p>Seller state: {q.seller_state}</p>}
              {q.place_of_supply && <p>Place of supply: {q.place_of_supply}</p>}
              <p>{inter ? "Inter-state supply · IGST" : "Intra-state supply · CGST + SGST"}</p>
              {q.works_contract && <p>Works contract (turnkey)</p>}
            </div>
          </div>
        )}

        {/* BOQ */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-strong)] text-left text-xs text-[var(--color-ink-secondary)]">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium">UOM</th>
                <th className="px-3 py-2 font-medium text-right">Rate</th>
                <th className="px-3 py-2 font-medium text-right">Disc</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const rows = linesBySection.get(s.id) ?? [];
                if (rows.length === 0) return null;
                const block = (
                  <Fragment key={s.id}>
                    <tr className="bg-[var(--color-surface-sunken)]">
                      <td colSpan={7} className="px-3 py-2 text-sm font-semibold text-[var(--color-ink)]">
                        {s.title}
                      </td>
                    </tr>
                    {renderRows(rows, counter)}
                  </Fragment>
                );
                counter += rows.length;
                return block;
              })}
              {(() => {
                const rows = linesBySection.get(null) ?? [];
                if (rows.length === 0) return null;
                const block = renderRows(rows, counter);
                counter += rows.length;
                return block;
              })()}
            </tbody>
          </table>
        </div>

        {/* Totals + tax summary */}
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {rateSummary.length > 0 && (
            <div className="w-full sm:max-w-sm">
              <p className="mb-2 text-xs font-medium text-[var(--color-ink-secondary)]">Tax summary</p>
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-ink-secondary)]">
                    <th className="py-1.5 pr-3 font-medium">GST %</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Taxable</th>
                    {inter ? (
                      <th className="py-1.5 font-medium text-right">IGST</th>
                    ) : (
                      <>
                        <th className="py-1.5 pr-3 font-medium text-right">CGST</th>
                        <th className="py-1.5 font-medium text-right">SGST</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rateSummary.map((r) => (
                    <tr key={r.rate} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-1.5 pr-3">{r.rate}%</td>
                      <td className="py-1.5 pr-3 text-right">{inr(r.taxable)}</td>
                      {inter ? (
                        <td className="py-1.5 text-right">{inr(r.igst)}</td>
                      ) : (
                        <>
                          <td className="py-1.5 pr-3 text-right">{inr(r.cgst)}</td>
                          <td className="py-1.5 text-right">{inr(r.sgst)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <dl className="w-full flex-col gap-1.5 text-sm tabular sm:max-w-xs">
            <TotalRow label="Subtotal" value={inr(q.subtotal)} />
            {Number(q.discount_total) > 0 && <TotalRow label="Discount" value={`− ${inr(q.discount_total)}`} />}
            <TotalRow label="Taxable" value={inr(q.taxable_total)} />
            {inter ? (
              <TotalRow label="IGST" value={inr(q.igst_total)} />
            ) : (
              <>
                <TotalRow label="CGST" value={inr(q.cgst_total)} />
                <TotalRow label="SGST" value={inr(q.sgst_total)} />
              </>
            )}
            <div className="mt-1 flex justify-between border-t border-[var(--color-border-strong)] pt-2 text-base font-semibold text-[var(--color-ink)]">
              <dt>Grand total</dt>
              <dd>{inr(q.grand_total)}</dd>
            </div>
          </dl>
        </div>

        {/* Terms */}
        {(q.terms || q.works_contract) && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-4">
            <p className="mb-1 text-xs font-medium text-[var(--color-ink-secondary)]">Terms &amp; notes</p>
            {q.works_contract && (
              <p className="mb-1 text-sm text-[var(--color-ink-secondary)]">
                This is a works-contract (turnkey) supply under GST (SAC 9954); GST is charged on the
                composite supply of goods and services.
              </p>
            )}
            {q.terms && (
              <p className="whitespace-pre-wrap text-sm text-[var(--color-ink-secondary)]">{q.terms}</p>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-ink-disabled)]">
        Powered by VEYRA
      </p>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-ink-secondary)]">{label}</dt>
      <dd className="text-right text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
