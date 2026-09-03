import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getRfq, bidComparison, vendorNames } from "@/lib/data/rfq";
import {
  RFQ_STATUS_META,
  RESPONSE_STATUS_META,
  isBidDeadlinePassed,
  rankBids,
  type RfqTone,
} from "@/lib/rfq-model";
import { EnterBidForm } from "./enter-bid-form";
import { AwardDialog } from "./award-dialog";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate, inr } from "@/lib/utils";

/**
 * Red on this screen is reserved (§Design): the past-bid-deadline alert, the
 * one primary action (Award), and destructive controls only. Comparison
 * highlighting uses green (L1 / lowest landed cost) and amber (L2) — never red.
 */
const TONE_TO_CHIP: Record<RfqTone, "neutral" | "green" | "amber"> = {
  neutral: "neutral",
  muted: "neutral",
  active: "amber",
  positive: "green",
};

const L1_CELL =
  "bg-[var(--color-green-tint)] font-medium text-[var(--color-green)]";
const L2_CELL =
  "bg-[var(--color-amber-tint)] font-medium text-[var(--color-amber)]";

export default async function RfqDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const result = await getRfq(id);
  if (!result) notFound();
  const { rfq, vendors, items } = result;
  const names = await vendorNames(vendors.map((v) => v.vendor_id));

  const meta = RFQ_STATUS_META[rfq.status];
  const deadlinePassed = isBidDeadlinePassed(rfq.bid_deadline, rfq.status);
  const awardable = rfq.status !== "awarded" && rfq.status !== "closed";
  const comparison = tab === "comparison" ? await bidComparison(id) : null;

  // The award dialog needs every bidding vendor and its total, whichever tab is
  // open — so this read is not tied to the comparison tab being visible.
  const forAward = await bidComparison(id);
  const awardOptions = (forAward?.vendorTotals ?? [])
    .filter((v) => v.total > 0)
    .map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      total: v.total,
      rank: v.rank,
    }))
    .sort((a, b) => a.total - b.total);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/rfq"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to RFQs
      </Link>

      <PageHeader
        title={rfq.title}
        actions={
          <>
            <StatusChip tone={TONE_TO_CHIP[meta.tone]} label={meta.label} />
            {awardable && awardOptions.length > 0 && (
              <AwardDialog rfqId={rfq.id} options={awardOptions} />
            )}
          </>
        }
      />

      {/* ── Details ───────────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <Detail label="Project" value={rfq.project_label ?? "—"} />
          <Detail label="Place of supply" value={rfq.place_of_supply ?? "—"} />
          <div>
            <dt className="text-xs text-[var(--color-ink-secondary)]">Bid deadline</dt>
            <dd className="mt-0.5">
              {rfq.bid_deadline == null ? (
                <span className="text-[var(--color-ink)]">—</span>
              ) : deadlinePassed ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-red)]">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {fmtDate(rfq.bid_deadline)}
                  <span className="sr-only">(deadline passed)</span>
                </span>
              ) : (
                <span className="text-[var(--color-ink)]">{fmtDate(rfq.bid_deadline)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-secondary)]">Source MR</dt>
            <dd className="mt-0.5">
              {rfq.mr_id ? (
                <Link
                  href={`/procurement/${rfq.mr_id}`}
                  className="tabular text-[var(--color-ink)] hover:underline"
                >
                  {rfq.mr_id.slice(0, 8)}
                </Link>
              ) : (
                <span className="text-[var(--color-ink)]">—</span>
              )}
            </dd>
          </div>
          <Detail label="Created" value={fmtDate(rfq.created_at)} />
        </dl>
        {rfq.remarks && (
          <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-ink-secondary)]">
            {rfq.remarks}
          </p>
        )}
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--color-border)]">
        {[
          { key: "vendors", label: "Vendors", href: `/rfq/${rfq.id}` },
          { key: "comparison", label: "Comparison", href: `/rfq/${rfq.id}?tab=comparison` },
        ].map((t) => {
          const active = t.key === "comparison" ? tab === "comparison" : tab !== "comparison";
          return (
            <Link
              key={t.key}
              href={t.href}
              className={
                "border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors " +
                (active
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "comparison" ? (
        /* ── Comparison matrix ─────────────────────────────────────── */
        !comparison || items.length === 0 ? (
          <EmptyState
            title="Nothing to compare yet"
            description="Add line items to this RFQ first — bids are compared item by item."
          />
        ) : comparison.columns.length === 0 ? (
          <EmptyState
            title="No vendors invited"
            description="Invite vendors when creating an RFQ; their bids fill these columns."
          />
        ) : (
          <ComparisonMatrix comparison={comparison} />
        )
      ) : /* ── Vendors ──────────────────────────────────────────────── */
      vendors.length === 0 ? (
        <EmptyState
          title="No vendors invited"
          description="Invite vendors when creating an RFQ; enter their quotes here as they arrive."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Response</th>
                  <th className="px-4 py-3 font-medium text-right">Invited</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const rmeta = RESPONSE_STATUS_META[v.response_status];
                  return (
                    <tr
                      key={v.id}
                      className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                    >
                      <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                        {names[v.vendor_id] ?? v.vendor_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip tone={TONE_TO_CHIP[rmeta.tone]} label={rmeta.label} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">
                        {fmtDate(v.invited_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
              Proxy bid entry{" "}
              <span className="font-normal text-[var(--color-ink-secondary)]">
                — type each quote as it arrives (phone/email)
              </span>
            </h2>
            <div className="flex flex-col gap-2">
              {vendors.map((v) => (
                <EnterBidForm
                  key={v.id}
                  rfqId={rfq.id}
                  vendorId={v.vendor_id}
                  vendorName={names[v.vendor_id] ?? v.vendor_id.slice(0, 8)}
                  items={items.map((it) => ({
                    id: it.id,
                    item_name: it.item_name,
                    uom: it.uom,
                    qty: Number(it.qty) || 0,
                  }))}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── The matrix: rows = items, columns = vendors; green = L1, amber = L2 ───── */

function ComparisonMatrix({
  comparison,
}: {
  comparison: NonNullable<Awaited<ReturnType<typeof bidComparison>>>;
}) {
  const { columns, items, vendorTotals } = comparison;

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-max text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              {columns.map((c) => (
                <th key={c.vendorId} className="px-4 py-3 text-right font-medium">
                  {c.vendorName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              // Per-line ranking on LANDED cost: 1 = lowest (green), 2 = second (amber).
              const ranks: Record<string, number | undefined> = rankBids(
                row.cells.map((cell) => ({
                  vendorId: cell.vendorId,
                  total: cell.lineTotal,
                })),
              );
              return (
                <tr
                  key={row.rfqItemId}
                  className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                    {row.item_name}
                    {row.uom && (
                      <span className="ml-1.5 text-xs text-[var(--color-ink-secondary)]">
                        ({row.uom})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">
                    {row.qty}
                  </td>
                  {columns.map((col) => {
                    const cell = row.cells.find((cl) => cl.vendorId === col.vendorId);
                    if (!cell) {
                      return (
                        <td key={col.vendorId} className="px-4 py-2.5 text-right text-[var(--color-ink-disabled)]">
                          no quote
                        </td>
                      );
                    }
                    const rank = ranks[col.vendorId];
                    const tint =
                      rank === 1 ? L1_CELL : rank === 2 ? L2_CELL : "";
                    return (
                      <td
                        key={col.vendorId}
                        className={`px-4 py-2.5 text-right tabular ${tint}`}
                        title={
                          rank === 1
                            ? "Lowest landed cost for this item (L1)"
                            : rank === 2
                              ? "Second-lowest landed cost (L2)"
                              : undefined
                        }
                      >
                        {inr(cell.lineTotal)}
                        {rank === 1 && <span className="sr-only"> (lowest)</span>}
                        {rank === 2 && <span className="sr-only"> (second)</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] font-semibold text-[var(--color-ink)]">
              <td className="px-4 py-3">Total landed</td>
              <td />
              {vendorTotals.map((vt) => (
                <td key={vt.vendorId} className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular">{inr(vt.total)}</span>
                    {vt.rank != null ? (
                      <StatusChip
                        tone={
                          vt.rank === 1
                            ? "green"
                            : vt.rank === 2
                              ? "amber"
                              : "neutral"
                        }
                        label={`L${vt.rank}`}
                      />
                    ) : (
                      <span className="text-xs font-normal text-[var(--color-ink-disabled)]">
                        no bid
                      </span>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-[var(--color-border)] px-4 py-2.5 text-xs text-[var(--color-ink-secondary)]">
        Cell values are LANDED totals (qty × unit rate + freight), computed by the engine from human-entered rates.
        Green marks the lowest line (L1), amber the second (L2).
      </p>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-secondary)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
