import Link from "next/link";
import { KanbanSquare, Settings2 } from "lucide-react";
import { boardColumns, ensureDefaultStages } from "@/lib/data/pipeline";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, EmptyState } from "@/components/ui/primitives";
import { inr } from "@/lib/utils";

/**
 * CRM Pipeline — Kanban board (OPS-CRM-002). One column per tenant-configured
 * stage; leads group into columns by status name. Column counts and Σ values
 * are pure aggregations of real lead rows. Stage colours stay neutral/grey —
 * red is reserved (§Design): only the Lost column header may use red text.
 * The board scrolls horizontally inside its own container, never the body.
 */
export default async function PipelinePage() {
  await ensureDefaultStages();
  const columns = await boardColumns();

  const totalLeads = columns.reduce((s, c) => s + c.count, 0);
  const totalValue = columns.reduce((s, c) => s + c.value, 0);

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Pipeline"
        subtitle={
          columns.length > 0
            ? `${totalLeads} leads across ${columns.length} stages · ${inr(totalValue)} on the board`
            : "Group your leads into configurable stages."
        }
        actions={
          <Link href="/pipeline/stages">
            <Button variant="secondary">
              <Settings2 className="size-4" /> Manage stages
            </Button>
          </Link>
        }
      />

      {columns.length === 0 ? (
        <EmptyState
          icon={<KanbanSquare className="size-8" />}
          title="No pipeline stages yet"
          description="Add your first stage to start moving leads across the board."
          action={
            <Link href="/pipeline/stages">
              <Button variant="primary">Manage stages</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
          <div className="flex min-w-max items-stretch gap-4 p-4">
            {columns.map((col) => (
              <section
                key={col.stage.id}
                aria-label={`${col.stage.name} stage`}
                className="flex w-72 shrink-0 flex-col"
              >
                {/* Column header — name + count + Σ value ₹ */}
                <header
                  className={`mb-3 flex items-baseline justify-between gap-2 px-1 ${
                    col.stage.is_lost
                      ? "text-[var(--color-red)]"
                      : "text-[var(--color-ink)]"
                  }`}
                >
                  <h2 className="text-sm font-semibold">{col.stage.name}</h2>
                  <span className="text-xs text-[var(--color-ink-secondary)] tabular whitespace-nowrap">
                    {col.count} · {inr(col.value)}
                  </span>
                </header>

                <div className="flex flex-col gap-2">
                  {col.leads.map((lead) => (
                    <Card key={lead.id} className="p-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="block text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-red)]"
                      >
                        {lead.name}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--color-ink-secondary)] tabular text-right">
                        {inr(lead.value)}
                      </p>
                    </Card>
                  ))}
                  {col.leads.length === 0 && (
                    <p className="rounded-md border border-dashed border-[var(--color-border-strong)] px-3 py-6 text-center text-xs text-[var(--color-ink-disabled)]">
                      No leads here yet
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
