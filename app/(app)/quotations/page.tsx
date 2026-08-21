import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { listQuotations, quotationCounts } from "@/lib/data/quotations";
import { statusTone, statusLabel } from "@/lib/quotations-ui";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { inr, fmtDate } from "@/lib/utils";

export default async function QuotationsPage() {
  const [quotes, counts] = await Promise.all([listQuotations(), quotationCounts()]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Quotations"
        subtitle={`${counts.total} quotations · ${inr(counts.openValue)} open value`}
        actions={
          <Link href="/quotations/new">
            <Button variant="primary">
              <Plus className="size-4" /> New quotation
            </Button>
          </Link>
        }
      />

      {quotes.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" />}
          title="No quotations yet"
          description="Build a section-grouped BOQ from your catalogue — priced by the engine, never by hand."
          action={
            <Link href="/quotations/new">
              <Button variant="primary">
                <Plus className="size-4" /> New quotation
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[13px] text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Grand total</th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/quotations/${q.id}`}
                        className="font-medium text-[var(--color-ink)] hover:text-[var(--color-red)] tabular"
                      >
                        {q.number}
                        {q.version > 1 && (
                          <span className="ml-1 text-[var(--color-ink-secondary)]">v{q.version}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink)]">{q.title}</td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {q.customer_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip tone={statusTone[q.status]} label={statusLabel[q.status]} />
                    </td>
                    <td className="px-4 py-3 text-right tabular">{inr(q.grand_total)}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
                      {fmtDate(q.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
