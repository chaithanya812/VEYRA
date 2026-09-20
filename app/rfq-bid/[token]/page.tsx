import type { Metadata } from "next";
import { getPortalRfq } from "@/lib/data/rfq";
import { BidForm } from "@/components/bid-line-fields";
import { StatusChip } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { submitPortalBidAction } from "./actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Submit bid",
};

function Unavailable() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-lg font-semibold text-[var(--color-ink)]">Link unavailable</h1>
      <p className="text-sm text-[var(--color-ink-secondary)]">
        This bid link is not active. Please ask the sender for a current link.
      </p>
    </div>
  );
}

export default async function VendorBidPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPortalRfq(token);

  if (!data) return <Unavailable />;

  const lineDefaults: Record<
    string,
    { unit_rate?: number; tax_pct?: number; freight?: number }
  > = {};
  if (data.currentBid) {
    for (const l of data.currentBid.lines) {
      lineDefaults[l.rfq_item_id] = {
        unit_rate: l.unit_rate,
        tax_pct: l.tax_pct,
        freight: l.freight,
      };
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-5">
          <div>
            {data.sellerName && (
              <p className="text-sm font-semibold text-[var(--color-red)]">
                {data.sellerName}
              </p>
            )}
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">{data.title}</h1>
            <p className="mt-0.5 text-sm text-[var(--color-ink-secondary)]">
              Vendor bid
              {data.project_label ? ` · ${data.project_label}` : ""}
            </p>
          </div>
          {data.currentBid && (
            <StatusChip
              tone="green"
              label={`Submitted · v${data.currentBid.version}`}
            />
          )}
        </div>

        <dl className="grid grid-cols-1 gap-3 border-b border-[var(--color-border)] py-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--color-ink-secondary)]">Place of supply</dt>
            <dd className="mt-0.5 text-[var(--color-ink)]">
              {data.place_of_supply ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-secondary)]">Bid deadline</dt>
            <dd
              className={
                data.biddingClosed
                  ? "mt-0.5 font-medium text-[var(--color-red)]"
                  : "mt-0.5 text-[var(--color-ink)]"
              }
            >
              {data.bid_deadline ? fmtDate(data.bid_deadline) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-secondary)]">Lines</dt>
            <dd className="mt-0.5 tabular text-[var(--color-ink)]">{data.items.length}</dd>
          </div>
        </dl>

        {data.biddingClosed ? (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-[var(--color-red)]">
              Bidding has closed
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
              The deadline for this request has passed, so a new bid cannot be
              submitted through this link.
            </p>
            {data.currentBid && (
              <p className="mt-3 text-sm text-[var(--color-ink)]">
                Your last submitted quote was version {data.currentBid.version}
                {data.currentBid.submitted_at
                  ? ` on ${fmtDate(data.currentBid.submitted_at)}`
                  : ""}
                .
              </p>
            )}
          </div>
        ) : (
          <div className="mt-6">
            {data.currentBid && (
              <p className="mb-4 text-sm text-[var(--color-ink)]">
                You last submitted version {data.currentBid.version}
                {data.currentBid.submitted_at
                  ? ` on ${fmtDate(data.currentBid.submitted_at)}`
                  : ""}
                . Submitting again replaces it with a new version — history is
                kept.
              </p>
            )}
            <BidForm
              action={submitPortalBidAction}
              hidden={{ token }}
              items={data.items}
              idPrefix="portal"
              defaults={{
                delivery_date: data.currentBid?.delivery_date ?? null,
                remark: data.currentBid?.remark ?? null,
                lines: lineDefaults,
              }}
              submitLabel="Submit bid"
              footnote={
                data.currentBid
                  ? undefined
                  : "Submitting a bid records your quote. You can open this link again to send a corrected version — history is kept."
              }
            />
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-ink-disabled)]">
        Powered by VEYRA
      </p>
    </div>
  );
}
