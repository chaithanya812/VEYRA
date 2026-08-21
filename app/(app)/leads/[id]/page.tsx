import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLead, LEAD_STATUSES } from "@/lib/data/leads";
import { statusTone, statusLabel, sourceLabel } from "@/lib/leads-ui";
import { setStatusAction, addNoteAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Card, PageHeader, StatusChip } from "@/components/ui/primitives";
import { inr, fmtDate } from "@/lib/utils";
import type { LeadSource } from "@/lib/data/leads";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getLead(id);
  if (!result) notFound();
  const { lead, activities } = result;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to leads
      </Link>

      <PageHeader
        title={lead.name}
        actions={
          <StatusChip
            tone={statusTone[lead.status]}
            label={statusLabel[lead.status]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Details + status */}
        <div className="md:col-span-1 flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Details
            </h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              <Row label="Phone" value={lead.phone ?? "—"} />
              <Row label="Email" value={lead.email ?? "—"} />
              <Row label="Source" value={sourceLabel[lead.source as LeadSource]} />
              <Row label="Value" value={inr(lead.value)} />
              <Row label="Created" value={fmtDate(lead.created_at)} />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Update status
            </h2>
            <form action={setStatusAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={lead.id} />
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue={lead.status}>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary" size="sm">
                Update
              </Button>
            </form>
          </Card>
        </div>

        {/* Timeline */}
        <div className="md:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
              Activity
            </h2>

            <form action={addNoteAction} className="mb-5 flex flex-col gap-2">
              <input type="hidden" name="id" value={lead.id} />
              <Textarea
                name="note"
                placeholder="Add a note — a call outcome, next step…"
              />
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" size="sm">
                  Add note
                </Button>
              </div>
            </form>

            <ol className="flex flex-col gap-4">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--color-border-strong)]" />
                  <div>
                    <p className="text-sm text-[var(--color-ink)]">
                      {a.note ?? a.kind}
                    </p>
                    <p className="text-xs text-[var(--color-ink-secondary)]">
                      {fmtDate(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-ink-secondary)]">{label}</dt>
      <dd className="text-right text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
