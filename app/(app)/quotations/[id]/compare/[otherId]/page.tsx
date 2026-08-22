import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitCompareArrows } from "lucide-react";
import { getQuotation } from "@/lib/data/quotations";
import { diffQuotations, lineFieldLabel, type QuotationDiff, type SectionDiff, type LineField } from "@/lib/quotations-diff";
import { statusTone, statusLabel } from "@/lib/quotations-ui";
import { inr } from "@/lib/utils";
import { PageHeader, StatusChip, Card } from "@/components/ui/primitives";

/** Format a diff field value for display (money via inr, % for tax rate). */
function formatFieldValue(field: LineField, value: number | string): string {
  switch (field) {
    case "uom":
      return String(value);
    case "qty":
      return String(value);
    case "tax_rate":
      return `${value}%`;
    default:
      return inr(Number(value));
  }
}

export default async function CompareQuotationPage({
  params,
}: {
  params: Promise<{ id: string; otherId: string }>;
}) {
  const { id, otherId } = await params;
  if (id === otherId) notFound();

  const [base, other] = await Promise.all([getQuotation(id), getQuotation(otherId)]);
  if (!base || !other) notFound();

  // Tenant isolation + same-version-group guard. RLS is OFF, so this check is
  // the only thing preventing a cross-version (cross-tenant) comparison.
  if (base.quotation.version_group !== other.quotation.version_group) notFound();

  // Diff from the lower version (older) to the higher version (newer).
  const [older, newer] =
    base.quotation.version <= other.quotation.version
      ? [base, other]
      : [other, base];

  const diff = diffQuotations(
    { quotation: older.quotation, sections: older.sections, lines: older.lines },
    { quotation: newer.quotation, sections: newer.sections, lines: newer.lines },
  );

  const hasChanges = diff.sections.some(
    (s) => s.added.length || s.removed.length || s.changed.length,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/quotations/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to quotation
      </Link>

      <PageHeader
        title={`Version comparison`}
        subtitle={`v${older.quotation.version} → v${newer.quotation.version} · ${newer.quotation.number}`}
        actions={
          <StatusChip
            tone={statusTone[newer.quotation.status]}
            label={statusLabel[newer.quotation.status]}
          />
        }
      />

      {/* Header total deltas */}
      <Card className="mb-6 p-4">
        <p className="mb-3 text-xs font-medium text-[var(--color-ink-secondary)]">
          Header changes (old → new)
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <HeaderDeltaRows diff={diff} />
        </div>
      </Card>

      {!hasChanges && (
        <Card className="mb-6 flex items-center gap-2 p-4 text-sm text-[var(--color-ink-secondary)]">
          <GitCompareArrows className="size-4" />
          No line or total changes between these versions.
        </Card>
      )}

      <div className="space-y-5">
        {diff.sections.map((section) => (
          <SectionBlock key={section.sectionTitle} section={section} />
        ))}
      </div>
    </div>
  );
}

function HeaderDeltaRows({ diff }: { diff: QuotationDiff }) {
  const fields: Array<{ label: string; d: QuotationDiff["header"]["subtotal"] }> = [
    { label: "Subtotal", d: diff.header.subtotal },
    { label: "Taxable", d: diff.header.taxable },
    { label: "Tax total", d: diff.header.tax_total },
    { label: "CGST", d: diff.header.cgst_total },
    { label: "SGST", d: diff.header.sgst_total },
    { label: "IGST", d: diff.header.igst_total },
    { label: "Grand total", d: diff.header.grand_total },
  ];
  return (
    <>
      {fields.map(({ label, d }) => (
        <div key={label} className="flex flex-col">
          <span className="text-xs text-[var(--color-ink-secondary)]">{label}</span>
          <span className="tabular text-sm text-[var(--color-ink)]">
            {inr(d.old)} <span className="text-[var(--color-ink-secondary)]">→</span> {inr(d.new)}
          </span>
          {d.delta !== 0 && (
            <span
              className={
                d.delta > 0
                  ? "tabular text-xs text-[var(--color-green)]"
                  : "tabular text-xs text-[var(--color-ink-secondary)]"
              }
            >
              {d.delta > 0 ? "+" : "−"}
              {inr(Math.abs(d.delta))}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function SectionBlock({ section }: { section: SectionDiff }) {
  const empty =
    section.added.length === 0 && section.removed.length === 0 && section.changed.length === 0;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
        {section.sectionTitle}
      </div>
      {empty ? (
        <p className="px-4 py-3 text-sm text-[var(--color-ink-secondary)]">
          No changes in this section.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {section.added.map((e) => (
            <li key={`add-${e.line.id}`} className="px-4 py-2.5">
              <span className="text-xs font-medium text-[var(--color-green)]">Added</span>{" "}
              <span className="font-medium text-[var(--color-ink)]">{e.title}</span>
              <span className="ml-2 text-sm tabular text-[var(--color-ink-secondary)]">
                {e.line.qty} {e.line.uom} · {inr(e.line.line_total)}
              </span>
            </li>
          ))}
          {section.removed.map((e) => (
            <li key={`rem-${e.line.id}`} className="px-4 py-2.5">
              <span className="text-xs font-medium text-[var(--color-ink-secondary)]">Removed</span>{" "}
              <span className="font-medium text-[var(--color-ink-secondary)] line-through">
                {e.title}
              </span>
              <span className="ml-2 text-sm tabular text-[var(--color-ink-disabled)] line-through">
                {e.line.qty} {e.line.uom} · {inr(e.line.line_total)}
              </span>
            </li>
          ))}
          {section.changed.map((e) => (
            <li key={`chg-${e.newLine.id}`} className="px-4 py-2.5">
              <span className="text-xs font-medium text-[var(--color-amber)]">Changed</span>{" "}
              <span className="font-medium text-[var(--color-ink)]">{e.title}</span>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 pl-1 text-sm tabular">
                {e.changes.map((c) => (
                  <span key={c.field} className="text-[var(--color-ink-secondary)]">
                    {lineFieldLabel(c.field)}:{" "}
                    <span className="text-[var(--color-ink-secondary)] line-through">
                      {formatFieldValue(c.field, c.oldValue)}
                    </span>{" "}
                    <span className="font-medium text-[var(--color-ink)]">
                      {formatFieldValue(c.field, c.newValue)}
                    </span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
