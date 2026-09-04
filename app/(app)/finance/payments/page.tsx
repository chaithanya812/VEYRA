import Link from "next/link";
import { ArrowUpRight, Filter, Landmark, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { PermissionLimited } from "@/components/ui/permission-limited";
import { StatTile, TileGrid } from "@/app/(app)/dashboard/workspace-ui";
import { can } from "@/lib/data/permissions";
import { paymentsDashboardData } from "@/lib/data/finance";
import {
  cellTone,
  columnTitle,
  describeFilter,
  filterMatrix,
  MATRIX_COLUMNS,
  paymentsMatrix,
  summariseMatrix,
  type CellTone,
  type MatrixColumnKey,
  type PaymentsMatrixBand,
  type PaymentsMatrixRow,
} from "@/lib/payments-dashboard-model";
import { PROJECT_STAGES, STAGE_LABELS } from "@/lib/projects-model";
import { cn, inr } from "@/lib/utils";

/**
 * The company-wide Payments Dashboard — frame `110458`, PLAN-V4 §12.1.
 *
 * Three things about the shape of this file.
 *
 * 1. It computes NO money. Every figure comes from `paymentsMatrix` →
 *    `summarisePlan`, the same function the project's own Financial Planning
 *    band calls, so the drill-through arrow cannot land on a screen that
 *    disagrees with the row it was clicked from.
 * 2. The band is summed from the VISIBLE rows, and the applied-filter chip is
 *    not optional. A summary band that does not say what it is filtered to is a
 *    number without a denominator (HANDOFF-V8 §11).
 * 3. The filter resolves from `searchParams` on the SERVER — a plain GET form,
 *    no client JS, no `useEffect`. A filter resolved in an effect server-renders
 *    the wrong table and cannot be verified by fetching HTML.
 */

const TONE_CELL: Record<CellTone, string> = {
  neutral: "text-[var(--color-ink)]",
  positive: "text-[var(--color-green)] bg-[var(--color-green-tint)]",
  warning: "text-[var(--color-amber)] bg-[var(--color-amber-tint)]",
  // Red's fourth job: a genuine alert. Never a big number, only a negative one.
  negative: "text-[var(--color-red)] bg-[var(--color-red-tint)] font-medium",
};

export default async function PaymentsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string | string[]; q?: string; dues?: string }>;
}) {
  // The guard sits before the read. Fetching every project's money and then
  // hiding it would still have read it.
  if (!(await can("billing.payment.view"))) {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Payments Dashboard"
          subtitle="Every project's money in one matrix"
        />
        <PermissionLimited capability="billing.payment.view" />
      </div>
    );
  }

  const sp = await searchParams;
  const rawStages = Array.isArray(sp.stage) ? sp.stage : sp.stage ? [sp.stage] : [];
  const stages = rawStages.filter((s): s is (typeof PROJECT_STAGES)[number] =>
    (PROJECT_STAGES as readonly string[]).includes(s),
  );
  const q = sp.q?.trim() || "";
  const duesOnly = sp.dues === "1";

  // Two shapes of the same filter, deliberately: the matrix is narrowed on the
  // STORED stage values, while the chip reads in the user's words — the frame's
  // own text is `Project Stage: Planning + 13`.
  const filter = { stages, q, duesOnly };
  const chip = describeFilter({
    stages: stages.map((s) => STAGE_LABELS[s]),
    q,
    duesOnly,
  });

  const data = await paymentsDashboardData();
  const all = paymentsMatrix(data);
  const rows = filterMatrix(all, filter);
  // Σ of the VISIBLE rows, never the unfiltered set.
  const band = summariseMatrix(rows);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Payments Dashboard"
        subtitle={`${all.length} project${all.length === 1 ? "" : "s"} · every figure comes from the same engine the project screens use`}
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-[var(--color-ink-secondary)] sm:inline">
              Auto refreshes after 24 hours
            </span>
            <Button
              variant="secondary"
              disabled
              title="Importing a bank or accounting statement is not built yet — Phase 11 ships the dashboard first."
            >
              <Upload className="size-4" /> Import Payments
            </Button>
          </div>
        }
      />

      {/* Filter bar — a GET form, so the URL IS the state and the server renders
          the table the URL asks for. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="mb-1 w-full text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Project stage
          </legend>
          {PROJECT_STAGES.map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 text-sm text-[var(--color-ink)]"
            >
              <input
                type="checkbox"
                name="stage"
                value={s}
                defaultChecked={stages.includes(s)}
                className="size-4 accent-[var(--color-ink)]"
              />
              {STAGE_LABELS[s]}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Project or client"
            aria-label="Search project or client"
            className="w-56"
          />
          <label className="flex h-10 items-center gap-2 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              name="dues"
              value="1"
              defaultChecked={duesOnly}
              className="size-4 accent-[var(--color-ink)]"
            />
            Dues outstanding only
          </label>
          <Button type="submit" variant="secondary">
            <Filter className="size-4" /> Filter
          </Button>
          {chip && (
            <Link href="/finance/payments">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          )}
        </div>
      </form>

      {/* The applied-filter chip. Shown whenever the band is a subset, and the
          row count travels with it — a figure with its denominator. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-[var(--color-ink-secondary)]">
          Summary Applied Filters:
        </span>
        {chip ? (
          <span
            data-testid="applied-filter-chip"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] px-2.5 py-1 font-medium text-[var(--color-ink)]"
          >
            {chip}
            <span className="font-normal text-[var(--color-ink-secondary)]">
              · {rows.length} of {all.length}
            </span>
          </span>
        ) : (
          <span
            data-testid="applied-filter-chip"
            className="text-[var(--color-ink-secondary)]"
          >
            None — all {all.length} project{all.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <TileGrid>
        <StatTile label="Total Projects" value={String(band.totalProjects)} />
        <StatTile
          label="Expected P&L"
          value={inr(band.expectedPnl)}
          hint="Project Value − Est. Expenses"
          hero
          tone={cellTone("expectedPnl", band.expectedPnl)}
        />
        <StatTile label="Project Value" value={inr(band.projectValue)} />
        <StatTile
          label="Cash Flow"
          value={inr(band.cashFlow)}
          hint="Funds Received − Disbursed"
          tone={cellTone("cashFlow", band.cashFlow)}
        />
      </TileGrid>

      <BandGroup
        title="Inflow"
        subtitle="What the client committed, what has been earned, and what has been paid"
        band={band}
        keys={["contracted", "receivableBilled", "fundsReceived", "receivableDues"]}
      />
      <BandGroup
        title="Outflow"
        subtitle="Money you owe your vendors"
        band={band}
        keys={["estimatedExpenses", "disbursed", "committed"]}
      />

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Landmark className="size-8" />}
            title={chip ? "No projects match this filter" : "No projects yet"}
            description={
              chip
                ? "Clear the filter, or widen the stages you selected."
                : "A project with contracts and payments appears here automatically."
            }
            action={
              chip ? (
                <Link href="/finance/payments">
                  <Button variant="secondary">Clear filter</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Card className="overflow-hidden">
            {/* The scroll lives INSIDE the card: this table is wider than the
                page and the page body must never scroll sideways. */}
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-left text-[var(--color-ink-secondary)]">
                    <th className="sticky left-0 top-0 z-30 min-w-[240px] border-b border-r border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 font-medium">
                      Project
                    </th>
                    {MATRIX_COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        title={columnTitle(c)}
                        scope="col"
                        className="sticky top-0 z-20 whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-right font-medium"
                      >
                        {c.label}
                      </th>
                    ))}
                    <th className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-3">
                      <span className="sr-only">Open project payments</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <MatrixRow key={r.projectId} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* The collision the owner SETTLED on 2026-09-04 (HANDOFF-V8 §10.8),
          shipped rather than narrated: both figures, named apart. */}
      <p className="mt-4 max-w-3xl text-[13px] text-[var(--color-ink-secondary)]">
        <span className="font-medium text-[var(--color-ink)]">
          Contracted is the whole client commitment; Billed (Client) is what has
          been signed off.
        </span>{" "}
        Both used to be called “Total Receivables”, on two screens, meaning two
        different numbers. Receivable Dues is Billed − Funds Received, and reads
        the same on every screen. Hover any column heading to see what it counts.
      </p>
    </div>
  );
}

/** The stored stage value in the user's words; an unknown value shown as-is. */
function stageLabel(stage: string): string {
  return (STAGE_LABELS as Record<string, string>)[stage] ?? stage;
}

function BandGroup({
  title,
  subtitle,
  band,
  keys,
}: {
  title: string;
  subtitle: string;
  band: PaymentsMatrixBand;
  keys: MatrixColumnKey[];
}) {
  return (
    <section className="mt-4">
      <p className="mb-2 text-[13px] font-medium text-[var(--color-ink-secondary)]">
        {title}{" "}
        <span className="font-normal text-[var(--color-ink-disabled)]">
          — {subtitle}
        </span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {keys.map((k) => {
          const col = MATRIX_COLUMNS.find((c) => c.key === k)!;
          return (
            <StatTile
              key={k}
              label={col.label}
              value={inr(band[k])}
              hint={col.note}
              tone={cellTone(k, band[k])}
            />
          );
        })}
      </div>
    </section>
  );
}

function MatrixRow({ row }: { row: PaymentsMatrixRow }) {
  return (
    <tr className="group">
      <th
        scope="row"
        className="sticky left-0 z-10 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left font-normal group-hover:bg-[var(--color-surface-sunken)]"
      >
        <Link
          href={`/projects/${row.projectId}/payments`}
          className="font-medium text-[var(--color-ink)] hover:underline"
        >
          {row.projectName}
        </Link>
        <p className="text-[var(--color-ink-secondary)]">
          {row.clientName}
          {row.stage ? ` · ${stageLabel(row.stage)}` : ""}
          {row.contractCount === 0 ? " · no contracts" : ""}
        </p>
      </th>

      {MATRIX_COLUMNS.map((c) => {
        const value = row[c.key];
        return (
          <td
            key={c.key}
            className={cn(
              "whitespace-nowrap border-b border-[var(--color-border)] px-4 py-3 text-right tabular",
              TONE_CELL[cellTone(c.key, value)],
            )}
          >
            {inr(value)}
          </td>
        );
      })}

      <td className="border-b border-[var(--color-border)] px-3 py-3 text-right">
        <Link
          href={`/projects/${row.projectId}/payments`}
          title={`Open ${row.projectName} → Payments`}
          aria-label={`Open ${row.projectName} payments`}
          data-testid="drill-through"
          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      </td>
    </tr>
  );
}
