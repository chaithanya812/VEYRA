import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getVendor, getVendorProjects } from "@/lib/data/vendors";
import {
  VENDOR_STATUS_META,
  categorySummary,
  vendorStatusOf,
  type VendorTone,
} from "@/lib/vendors-model";
import { Card, PageHeader, StatusChip } from "@/components/ui/primitives";
import { StatTile, TileGrid } from "../../../dashboard/workspace-ui";
import { cn, inr } from "@/lib/utils";

/**
 * Vendor Projects (PLAN-V4 §10.3, frame `110234`) — the owner's ask verbatim:
 * *"monitor payment history, outstanding balances, procurement activities, and
 * project associations."*
 *
 * **Nothing on this screen is re-entered and nothing is stored.** Contracts
 * carry `vendor_id` and `project_id`, payments carry both, and a milestone
 * already knows whether its work is signed off. The whole table is those three
 * rows, added up — which is only possible because the spine landed first.
 *
 * THREE COLUMNS, THREE DIFFERENT QUESTIONS. The frame labelled the first one
 * `Total Payables`, a phrase `summarisePlan` used for the second; the owner
 * settled it on 2026-09-04 (HANDOFF-V8 §10.1) by keeping both figures and
 * naming them apart, because both are real and both are wanted:
 *
 *   Committed = Agreed − Disbursed   (the whole remaining commitment)
 *   Billed    = milestone work signed off
 *   Dues      = Billed − Disbursed   (what is payable right now)
 *
 * `lib/finance-model.ts::summarisePlan` now uses those exact three words for
 * those exact three quantities, so this screen and Financial Planning agree.
 * All three are printed here rather than one being quietly picked.
 *
 * Negatives are not clamped. Paying a vendor more than was agreed happens on a
 * real site, and a screen that floored it at zero would hide the one row
 * somebody needed to see — so it is red, which is a genuine alert.
 */
const STATUS_TONE: Record<VendorTone, "neutral" | "green" | "amber"> = {
  neutral: "neutral",
  active: "amber",
  positive: "green",
};

export default async function VendorProjectsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await getVendor(id);
  if (!result) notFound();
  const { vendor } = result;

  const { rows, totals } = await getVendorProjects(id);
  const cats = categorySummary(vendor.categories);
  const meta = VENDOR_STATUS_META[vendorStatusOf(vendor.status)];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/vendors/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to vendor
      </Link>

      <PageHeader
        title="Vendor Projects"
        subtitle={`${vendor.name}${vendor.city ? ` · ${vendor.city}` : ""}${
          cats.first ? ` · ${cats.first}${cats.overflow ? ` +${cats.overflow}` : ""}` : ""
        }`}
        actions={<StatusChip tone={STATUS_TONE[meta.tone]} label={meta.label} />}
      />

      {/* The frame's four header figures, summed from the rows below them. */}
      <TileGrid>
        <StatTile
          label="Estimated Expenses"
          value={inr(totals.estimatedExpenses)}
          hero
          hint={`${totals.projectCount} ${totals.projectCount === 1 ? "project" : "projects"}`}
        />
        <StatTile
          label="Total Disbursed"
          value={inr(totals.disbursed)}
          tone="neutral"
          hint="Paid to this vendor so far"
        />
        <StatTile
          label="Committed"
          value={inr(totals.committed)}
          tone={totals.committed < 0 ? "negative" : "info"}
          hint="Agreed less disbursed — the whole remaining commitment"
        />
        <StatTile
          label="Dues"
          value={inr(totals.dues)}
          tone={totals.dues > 0 ? "warning" : totals.dues < 0 ? "negative" : "neutral"}
          hint="Billed less disbursed — payable today"
        />
      </TileGrid>

      {rows.length === 0 ? (
        <Card className="mt-4 border-dashed p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-ink)]">
            This vendor is not on any project yet
          </p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-[var(--color-ink-secondary)]">
            A vendor joins a project by having a contract on it, or by being
            paid against it. Raise a vendor contract from the project&apos;s
            Financial Planning and this table fills itself — nothing here is
            entered twice.
          </p>
        </Card>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[11px] uppercase tracking-wide text-[var(--color-ink-secondary)]">
                  <th className="px-4 py-2 font-medium">Project Name</th>
                  <th className="px-4 py-2 font-medium">Client Name</th>
                  <th className="px-4 py-2 text-right font-medium">Agreed Amount</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Disbursed Amount
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Committed</th>
                  <th className="px-4 py-2 text-right font-medium">Billed</th>
                  <th className="px-4 py-2 text-right font-medium">Dues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.project_id ?? "unlinked"}
                    className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                  >
                    <td className="px-4 py-2.5">
                      {r.project_id ? (
                        <Link
                          href={`/projects/${r.project_id}/finance`}
                          className="font-medium text-[var(--color-ink)] hover:underline"
                        >
                          {r.projectName ?? "Untitled project"}
                        </Link>
                      ) : (
                        <span
                          className="text-[var(--color-ink-secondary)]"
                          title="These contracts or payments have no project FK — the money is still owed"
                        >
                          No project linked
                        </span>
                      )}
                      <span className="block text-[11px] text-[var(--color-ink-secondary)]">
                        {r.contractCount}{" "}
                        {r.contractCount === 1 ? "contract" : "contracts"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-secondary)]">
                      {r.clientName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {inr(r.agreed)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">
                      {inr(r.disbursed)}
                    </td>
                    <Money value={r.committed} />
                    <td className="px-4 py-2.5 text-right tabular text-[var(--color-ink-secondary)]">
                      {inr(r.billed)}
                    </td>
                    <Money value={r.dues} warnPositive />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-sunken)] font-medium">
                  <td className="px-4 py-2.5" colSpan={2}>
                    {rows.length} {rows.length === 1 ? "project" : "projects"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {inr(totals.estimatedExpenses)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {inr(totals.disbursed)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {inr(totals.committed)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {inr(totals.billed)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {inr(totals.dues)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* A figure travels with the two numbers it came from — every ratio and
          every difference in this codebase does (HANDOFF §10). */}
      <p className="mt-3 text-xs text-[var(--color-ink-secondary)]">
        <span className="font-medium text-[var(--color-ink)]">Committed</span>{" "}
        is Agreed less Disbursed — everything still owed to this vendor over the
        life of the job.{" "}
        <span className="font-medium text-[var(--color-ink)]">Dues</span>{" "}
        is Billed less Disbursed — what is payable today. Of{" "}
        {inr(totals.estimatedExpenses)} agreed, {inr(totals.billed)} has been
        signed off and {inr(totals.disbursed)} paid.
      </p>
    </div>
  );
}

/** A money cell that shows an over-payment as the alert it is. */
function Money({
  value,
  warnPositive = false,
}: {
  value: number;
  warnPositive?: boolean;
}) {
  const negative = value < 0;
  return (
    <td className="px-4 py-2.5 text-right">
      <span
        className={cn(
          "inline-flex items-center justify-end gap-1.5 tabular",
          negative && "font-medium text-[var(--color-red)]",
          !negative && warnPositive && value > 0 && "text-[var(--color-amber)]",
          !negative && !warnPositive && "text-[var(--color-ink)]",
        )}
        title={negative ? "More has been paid than was agreed" : undefined}
      >
        {negative && <AlertTriangle className="size-3.5 shrink-0" />}
        {inr(value)}
      </span>
    </td>
  );
}
