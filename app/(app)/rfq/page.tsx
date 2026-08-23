import Link from "next/link";
import { ClipboardList, Plus, AlertTriangle } from "lucide-react";
import { listRfqs, rfqVendorCounts } from "@/lib/data/rfq";
import {
  RFQ_STATUS_META,
  isBidDeadlinePassed,
  type Rfq,
  type RfqTone,
} from "@/lib/rfq-model";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";

/**
 * Status chips are green/amber/grey ONLY (RFQ_STATUS_META has no red tone) —
 * red is reserved (§Design); its single status job on this screen is the
 * past-bid-deadline alert.
 */
const TONE_TO_CHIP: Record<RfqTone, "neutral" | "green" | "amber"> = {
  neutral: "neutral",
  muted: "neutral",
  active: "amber",
  positive: "green",
};

export default async function RfqPage() {
  const rfqs = await listRfqs();
  const counts = await rfqVendorCounts(rfqs.map((r) => r.id));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="RFQ"
        subtitle={`${rfqs.length} requests for quotation`}
        actions={
          <Link href="/rfq/new">
            <Button variant="primary">
              <Plus className="size-4" /> New RFQ
            </Button>
          </Link>
        }
      />

      {rfqs.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title="No RFQs yet"
          description="Create one from scratch or convert an approved material request."
          action={
            <Link href="/rfq/new">
              <Button variant="primary">
                <Plus className="size-4" /> New RFQ
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Bid Deadline</th>
                  <th className="px-4 py-3 font-medium text-right">#Vendors</th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((rfq) => (
                  <RfqRow key={rfq.id} rfq={rfq} vendorCount={counts[rfq.id] ?? 0} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RfqRow({ rfq, vendorCount }: { rfq: Rfq; vendorCount: number }) {
  const deadlinePassed = isBidDeadlinePassed(rfq.bid_deadline, rfq.status);
  const meta = RFQ_STATUS_META[rfq.status];
  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40">
      <td className="px-4 py-3">
        <Link
          href={`/rfq/${rfq.id}`}
          className="font-medium text-[var(--color-ink)] hover:text-[var(--color-red)] tabular"
          title={rfq.id}
        >
          {rfq.id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">{rfq.title}</td>
      <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
        {rfq.project_label ?? "—"}
      </td>
      <td className="px-4 py-3">
        <StatusChip tone={TONE_TO_CHIP[meta.tone]} label={meta.label} />
      </td>
      <td className="px-4 py-3">
        {rfq.bid_deadline == null ? (
          <span className="text-[var(--color-ink-secondary)]">—</span>
        ) : deadlinePassed ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-red)]">
            <AlertTriangle className="size-3.5 shrink-0" />
            {fmtDate(rfq.bid_deadline)}
            <span className="sr-only">(deadline passed)</span>
          </span>
        ) : (
          <span className="text-[var(--color-ink)]">{fmtDate(rfq.bid_deadline)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular text-[var(--color-ink)]">
        {vendorCount}
      </td>
      <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
        {fmtDate(rfq.created_at)}
      </td>
    </tr>
  );
}
