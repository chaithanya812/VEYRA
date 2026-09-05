import Link from "next/link";
import { ArrowUpRight, Filter, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui/primitives";
import { PermissionLimited } from "@/components/ui/permission-limited";
import { StatTile, TileGrid } from "@/app/(app)/dashboard/workspace-ui";
import { can } from "@/lib/data/permissions";
import { receivablesData } from "@/lib/data/receivables";
import {
  BUCKET_META,
  describeReceivablesFilter,
  filterReceivables,
  parseBucket,
  receivableRows,
  summariseReceivables,
  type ReceivableRow,
} from "@/lib/receivables-model";
import { cn, inr } from "@/lib/utils";
import { SavedViews } from "@/components/ui/saved-views";
import { ExportCsvButton } from "@/components/reports/export-csv-button";
import { listSavedViews } from "@/lib/data/saved-views";
import { meterExportAction } from "@/app/(app)/finance/actions";
import { csvFilename, findSavedViewScreen } from "@/lib/saved-views-model";
import { RestoreControl, WriteOffControl } from "./receivables-controls";

/**
 * Account Receivables — frame `110534`, PLAN-V4 §12.3.
 *
 * ⚠ THIS SCREEN RE-ENTERS NOTHING. Every row is a `milestones` row that the
 * project's own Financial Planning schedule (Phase 8 §9.3) already wrote,
 * reached through a client `contracts` row. There is no receivables table and
 * no invoice table: ageing a receivable is a question asked of the payment
 * schedule, not a second copy of it. That is the interconnection the owner
 * asked for — "keep the whole system interconnected… got to make it simple,
 * but keep it interconnected."
 *
 * Three more things about the shape of this file.
 *
 * 1. It computes NO money. `lib/receivables-model.ts` does all of it, and its
 *    figures are asserted equal to `rollupContract` and `summarisePlan` — the
 *    functions the project screens and the Payments Dashboard already call — so
 *    a drill-through cannot land on a screen that disagrees with the row it was
 *    clicked from.
 * 2. The vocabulary is the one the owner SETTLED on 2026-09-04 (HANDOFF-V8
 *    §10.8): `Contracted` is the whole client commitment, `Billed` is what has
 *    been signed off, `Dues` is billed − received. Symmetric with the payables
 *    side. Every figure prints the two numbers it came from.
 * 3. The filter resolves from `searchParams` on the SERVER — a plain GET form
 *    and four tile links, no client JS. A filter resolved in an effect
 *    server-renders the wrong table and cannot be verified by fetching HTML.
 */

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; q?: string }>;
}) {
  // The guard sits before the read. Fetching every client's money and then
  // hiding it would still have read it.
  if (!(await can("billing.payment.view"))) {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Account Receivables"
          subtitle="Every client milestone, aged"
        />
        <PermissionLimited capability="billing.payment.view" />
      </div>
    );
  }

  const sp = await searchParams;
  const bucket = parseBucket(sp.bucket);
  const q = sp.q?.trim() || "";

  const data = await receivablesData();
  const all = receivableRows(data);
  const rows = filterReceivables(all, { bucket, q });
  // The band is Σ of the VISIBLE rows. A band that does not move with its own
  // filter is a number without a denominator (HANDOFF-V8 §11).
  const band = summariseReceivables(rows, data.contracts);
  // The tiles count the WHOLE ledger, so clicking one narrows the table without
  // the tiles themselves shrinking underfoot.
  const ledger = summariseReceivables(all, data.contracts);
  const tiles = ledger.tiles;
  const chip = describeReceivablesFilter({ bucket, q });
  const mayApprove = await can("billing.payment.approve");

  // ── Saved views + CSV (Part 4 Unit 2) ────────────────────────────
  // Both are reached only INSIDE the `can("billing.payment.view")` branch
  // above, and the export serialises exactly the rows this render produced —
  // filter and all. There is no column chooser here: the table's headers are
  // hand-written, and the registry says so instead of pretending otherwise.
  const screen = findSavedViewScreen("finance.receivables")!;
  const saved = await listSavedViews(screen);
  const csvHeaders = [
    "Project Name",
    "Client",
    "Sales Owner",
    "Milestone (%)",
    "Due Date",
    "Amount",
    "Pending",
    "Received",
    "Status",
  ];
  // `—` for a milestone with no due date, exactly as the table shows it. The
  // export must never be a more confident answer than the screen.
  const csvRows = rows.map((r) => [
    r.projectName,
    r.clientName,
    r.salesOwner,
    r.milestoneLabel,
    r.dueDate ?? "—",
    inr(r.amount),
    inr(r.pending),
    inr(r.received),
    r.writtenOff ? "Written off" : r.signedOff ? "Billed" : "Not billed",
  ]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const href = (b: string | null) => {
    const params = new URLSearchParams();
    if (b) params.set("bucket", b);
    if (q) params.set("q", q);
    const s = params.toString();
    return s ? `/finance/receivables?${s}` : "/finance/receivables";
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Account Receivables"
        subtitle={`${all.length} client milestone${all.length === 1 ? "" : "s"} across ${ledger.projectCount} project${ledger.projectCount === 1 ? "" : "s"} · read straight off each project's payment schedule, never re-entered`}
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-[var(--color-ink-secondary)] sm:inline">
              Auto refreshes after 24 hours
            </span>
            <ExportCsvButton
              filename={csvFilename(screen, today, Boolean(chip))}
              headers={csvHeaders}
              rows={csvRows}
              filterChip={chip}
              disabled={rows.length === 0}
              onExported={meterExportAction.bind(null, screen.key)}
            />
          </div>
        }
      />

      <SavedViews screen={screen} views={saved.views} readError={saved.error} />

      {/* Filter — a GET form, so the URL IS the state and the server renders
          the table the URL asks for.

          ⚠ THE `key` IS LOAD-BEARING — see the same comment on
          /finance/payments. `defaultValue` applies ON MOUNT ONLY, and a saved-
          view chip or a bucket tile is a CLIENT-SIDE navigation that re-renders
          this form without remounting it, leaving the search box showing the
          previous URL's text while the table shows the new one. The next press
          of Filter would then submit the stale term. */}
      <form
        method="get"
        key={`${bucket ?? ""}|${q}`}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        {bucket && <input type="hidden" name="bucket" value={bucket} />}
        <Input
          name="q"
          defaultValue={q}
          placeholder="Project, client, owner or milestone"
          aria-label="Search project, client, sales owner or milestone"
          className="w-72"
        />
        <Button type="submit" variant="secondary">
          <Filter className="size-4" /> Filter
        </Button>
        {chip && (
          <Button asChild type="button" variant="ghost">
            <Link href="/finance/receivables">
              Clear
            </Link>
          </Button>
        )}
        <span className="text-[13px] text-[var(--color-ink-secondary)]">
          <span data-testid="applied-filter-chip">
            {chip
              ? `${chip} · ${rows.length} of ${all.length}`
              : `No filter — all ${all.length} milestone${all.length === 1 ? "" : "s"}`}
          </span>
        </span>
      </form>

      {/* The four tiles of `110534`. Each is a FILTER, and each prints
          `n Milestones | ₹` — the count travels with the money. */}
      <TileGrid>
        {tiles.map((t) => {
          const active = bucket === t.bucket;
          return (
            <Link
              key={t.bucket}
              href={href(active ? null : t.bucket)}
              data-testid={`tile-${t.bucket}`}
              aria-pressed={active}
              className={cn(
                "block rounded-[var(--radius-card)] transition-shadow",
                active && "ring-2 ring-[var(--color-ink)]",
              )}
            >
              <StatTile
                label={t.label}
                value={`${t.count} Milestone${t.count === 1 ? "" : "s"} · ${inr(t.amount)}`}
                hint={t.note}
                tone={t.count > 0 ? t.tone : "neutral"}
              />
            </Link>
          );
        })}
      </TileGrid>

      {/*
        The settled vocabulary, printed with its arithmetic (HANDOFF-V8 §10.8).
        `Contracted` and `Billed` are two different, both-real quantities that
        used to share the words "Total Receivables" on two screens; naming them
        apart and showing what each is made of is the whole remedy.
      */}
      <section className="mt-4">
        <p className="mb-2 text-[13px] font-medium text-[var(--color-ink-secondary)]">
          Inflow{" "}
          <span className="font-normal text-[var(--color-ink-disabled)]">
            — what the client has committed, what has been earned, and what is
            payable now
          </span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Contracted"
            value={inr(band.contracted)}
            hint={`Σ of ${band.projectCount === 1 ? "this project's" : "every"} client contract — the whole commitment`}
          />
          <StatTile
            label="Billed"
            value={inr(band.billed)}
            hint="Client milestones signed off — what may be invoiced"
          />
          <StatTile
            label="Received"
            value={inr(band.received)}
            hint="Client money in the bank, reversed pairs excluded"
            tone={band.received > 0 ? "positive" : "neutral"}
          />
          <StatTile
            label="Receivable Dues"
            value={inr(band.dues)}
            hint={`Billed ${inr(band.billed)} − Received ${inr(band.received)}`}
            tone={band.dues > 0 ? "warning" : "neutral"}
            hero
          />
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-ink-secondary)]">
          A receipt that names a milestone is applied to it exactly; one that
          names only the contract is applied to the oldest milestone first, so
          the Pending column below foots to Receivable Dues rather than
          disagreeing with it.
          {band.scheduleDrift !== 0 && (
            <>
              {" "}
              <span className="font-medium text-[var(--color-ink)]">
                Schedule drift {inr(band.scheduleDrift)}
              </span>{" "}
              — the milestones on show total {inr(band.scheduled)} against{" "}
              {inr(band.contracted)} contracted.
            </>
          )}
          {band.overReceived > 0 && (
            <>
              {" "}
              <span className="font-medium text-[var(--color-ink)]">
                {inr(band.overReceived)} received beyond a milestone&apos;s value
              </span>{" "}
              — a credit, not a due.
            </>
          )}
        </p>
      </section>

      {all.length > 0 && !data.writeOffAvailable && (
        <p className="mt-4 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] px-3 py-2 text-[13px] text-[var(--color-ink-secondary)]">
          <span className="font-medium text-[var(--color-ink)]">
            Written Off is not yet available.
          </span>{" "}
          Migration <code>0042_receivable_write_off</code> has not been applied,
          so no milestone can carry a write-off yet. The tile reads zero because
          the column does not exist — not because nothing has been written off.
        </p>
      )}

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Landmark className="size-8" />}
            title={chip ? "No milestones match this filter" : "No client milestones yet"}
            description={
              chip
                ? "Clear the filter, or pick another tile."
                : "A client contract with a payment schedule appears here automatically — nothing is re-entered on this screen."
            }
            action={
              chip ? (
                <Button asChild variant="secondary">
                  <Link href="/finance/receivables">Clear filter</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-left text-[var(--color-ink-secondary)]">
                    {[
                      "Project Name",
                      "Sales Owner",
                      "Milestone (%)",
                      "Due Date",
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="sticky top-0 z-20 whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 font-medium"
                      >
                        {h}
                      </th>
                    ))}
                    <th
                      scope="col"
                      title="The milestone's own value, from the payment schedule."
                      className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-right font-medium"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      title="Amount − Received."
                      className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-right font-medium"
                    >
                      Pending
                    </th>
                    <th
                      scope="col"
                      title="Client receipts applied to this milestone."
                      className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-right font-medium"
                    >
                      Received
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-right font-medium"
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Row key={r.milestoneId} row={r} mayApprove={mayApprove} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * One milestone.
 *
 * `Amount` is green-tinted and `Pending` amber-tinted, per `110534`. Neither is
 * red: red's fourth job is a genuine alert, and it is spent on the Overdue
 * Payment chip and tile, where money signed off and past due has actually gone
 * missing (§2 rule 7).
 */
function Row({ row, mayApprove }: { row: ReceivableRow; mayApprove: boolean }) {
  const meta = BUCKET_META[row.bucket];
  return (
    <tr className="group align-top">
      <td className="border-b border-[var(--color-border)] px-4 py-3">
        <Link
          href={`/projects/${row.projectId}/finance`}
          className="font-medium text-[var(--color-ink)] hover:underline"
        >
          {row.projectName}
        </Link>
        <p className="text-[var(--color-ink-secondary)]">{row.clientName}</p>
      </td>

      <td className="border-b border-[var(--color-border)] px-4 py-3">
        {row.salesOwner}
        {row.salesOwnerSource === "contract" && (
          <p className="text-[12px] text-[var(--color-ink-secondary)]">
            raised the contract — this project has no lead to take an owner from
          </p>
        )}
      </td>

      <td className="border-b border-[var(--color-border)] px-4 py-3">
        <span className="font-medium text-[var(--color-ink)]">
          {row.milestoneLabel}
        </span>
        <p className="mt-1">
          <StatusChip
            label={meta.label}
            tone={row.bucket === "overdue_payment" ? "red" : row.bucket === "milestone_overdue" ? "amber" : row.bucket === "settled" ? "green" : "neutral"}
          />
        </p>
        {row.writtenOff && row.writeOffReason && (
          <p className="mt-1 max-w-[22rem] text-[12px] text-[var(--color-ink-secondary)]">
            {row.writeOffReason}
          </p>
        )}
      </td>

      <td className="whitespace-nowrap border-b border-[var(--color-border)] px-4 py-3">
        {row.dueDate ?? "—"}
        <p className="text-[12px] text-[var(--color-ink-secondary)]">
          {row.dueKind === "actual"
            ? "actual"
            : row.dueKind === "tentative"
              ? row.signedOff
                ? "tentative — no actual date recorded"
                : "tentative"
              : "no date"}
        </p>
      </td>

      <td className="whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-green-tint)] px-4 py-3 text-right tabular text-[var(--color-green)]">
        {inr(row.amount)}
      </td>
      <td
        data-testid="pending-cell"
        className={cn(
          "whitespace-nowrap border-b border-[var(--color-border)] px-4 py-3 text-right tabular",
          row.pending > 0
            ? "bg-[var(--color-amber-tint)] text-[var(--color-amber)]"
            : "text-[var(--color-ink-secondary)]",
        )}
      >
        {inr(row.pending)}
      </td>
      <td className="whitespace-nowrap border-b border-[var(--color-border)] px-4 py-3 text-right tabular">
        {inr(row.received)}
        {row.overReceived > 0 && (
          <p className="text-[12px] text-[var(--color-ink-secondary)]">
            {inr(row.overReceived)} over
          </p>
        )}
      </td>

      <td className="border-b border-[var(--color-border)] px-4 py-3 text-right">
        {!mayApprove ? (
          <Link
            href={`/projects/${row.projectId}/finance`}
            title={`Open ${row.projectName} → Financial Planning`}
            aria-label={`Open ${row.projectName} financial planning`}
            data-testid="drill-through"
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        ) : row.writtenOff ? (
          <RestoreControl milestoneId={row.milestoneId} label={row.milestoneLabel} />
        ) : (
          <WriteOffControl
            milestoneId={row.milestoneId}
            label={row.milestoneLabel}
            amount={inr(row.pending)}
          />
        )}
      </td>
    </tr>
  );
}
