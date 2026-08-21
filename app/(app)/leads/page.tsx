import Link from "next/link";
import { Users, Plus } from "lucide-react";
import { listLeads, leadCounts } from "@/lib/data/leads";
import { statusTone, statusLabel, sourceLabel } from "@/lib/leads-ui";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { inr, fmtDate } from "@/lib/utils";

export default async function LeadsPage() {
  const [leads, counts] = await Promise.all([listLeads(), leadCounts()]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Leads"
        subtitle={`${counts.total} leads · ${inr(counts.pipelineValue)} pipeline value`}
        actions={
          <Link href="/leads/new">
            <Button variant="primary">
              <Plus className="size-4" /> New lead
            </Button>
          </Link>
        }
      />

      {leads.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="No leads yet"
          description="Capture your first enquiry to start the pipeline."
          action={
            <Link href="/leads/new">
              <Button variant="primary">
                <Plus className="size-4" /> New lead
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
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Value</th>
                  <th className="px-4 py-3 font-medium text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-sunken)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium text-[var(--color-ink)] hover:text-[var(--color-red)]"
                      >
                        {lead.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)] tabular">
                      {lead.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-secondary)]">
                      {sourceLabel[lead.source]}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        tone={statusTone[lead.status]}
                        label={statusLabel[lead.status]}
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {inr(lead.value)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--color-ink-secondary)] tabular">
                      {fmtDate(lead.created_at)}
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
