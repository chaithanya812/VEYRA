import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ExportCsvButton } from "@/components/reports/export-csv-button";
import { cn } from "@/lib/utils";
import { findReport, type ReportCell } from "../reports-config";

/**
 * One report rendered as a clean table (FEATURE-REGISTER OPS-REP-001).
 * Zebra rows, 13px cells, ₹ right-aligned tabular numerals, sticky header —
 * per DESIGN-DIRECTION §3/§4. Red appears only on true alert cells (overdue,
 * negative P&L). The CSV export never blocks the page: it serialises the
 * already-fetched rows in the browser.
 */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report: slug } = await params;
  const def = findReport(slug);
  if (!def) notFound();

  const data = await def.run();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/reports"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-3.5" /> All reports
      </Link>

      <PageHeader
        title={def.title}
        subtitle={def.subtitle}
        actions={
          <ExportCsvButton
            filename={`${def.slug}.csv`}
            headers={data.head}
            rows={data.csv}
            disabled={data.isEmpty}
          />
        }
      />

      {data.isEmpty ? (
        <EmptyState
          icon={<def.icon className="size-8" />}
          title={data.emptyTitle}
          description={data.emptyDescription}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  {data.head.map((h, i) => {
                    const sample = data.rows[0]?.[i];
                    return (
                      <th
                        key={h}
                        scope="col"
                        className={cn(
                          "whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 font-medium text-[var(--color-ink-secondary)]",
                          sample?.right ? "text-right" : "text-left",
                        )}
                      >
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((cells, ri) => (
                  <tr
                    key={ri}
                    className={cn(
                      "border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--color-border)_45%,transparent)]",
                      ri % 2 === 1 && "bg-[var(--color-surface-sunken)]",
                    )}
                  >
                    {cells.map((c: ReportCell, ci) => (
                      <td
                        key={ci}
                        className={cn(
                          "px-4 py-2.5 align-middle text-[var(--color-ink)]",
                          c.right && "text-right tabular-nums",
                          c.alert &&
                            "font-medium text-[var(--color-red)]",
                        )}
                      >
                        {c.node}
                      </td>
                    ))}
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
