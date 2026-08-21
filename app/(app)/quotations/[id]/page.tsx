import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2, Copy, GitBranch } from "lucide-react";
import { getQuotation, listVersions } from "@/lib/data/quotations";
import { QUOTE_STATUSES } from "@/lib/quotations-model";
import { statusTone, statusLabel } from "@/lib/quotations-ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { PageHeader, StatusChip, Card } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { QuoteBuilder } from "../quote-builder";
import { setStatusAction, setShareAction, newVersionAction } from "../actions";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getQuotation(id);
  if (!data) notFound();
  const { quotation, sections, lines } = data;
  const versions = await listVersions(quotation.version_group);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/quotations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to quotations
      </Link>

      <PageHeader
        title={quotation.title}
        subtitle={`${quotation.number}${quotation.version > 1 ? ` · v${quotation.version}` : ""} · Updated ${fmtDate(quotation.updated_at)}`}
        actions={<StatusChip tone={statusTone[quotation.status]} label={statusLabel[quotation.status]} />}
      />

      {/* Action bar */}
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <form action={setStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={quotation.id} />
          <span className="text-sm text-[var(--color-ink-secondary)]">Status</span>
          <Select name="status" defaultValue={quotation.status} className="h-9 w-36">
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm">Set</Button>
        </form>

        <div className="h-6 w-px bg-[var(--color-border)]" />

        <form action={setShareAction}>
          <input type="hidden" name="id" value={quotation.id} />
          <input type="hidden" name="enabled" value={String(!quotation.share_enabled)} />
          <Button type="submit" variant={quotation.share_enabled ? "danger" : "secondary"} size="sm">
            <Link2 className="size-4" />
            {quotation.share_enabled ? "Disable link" : "Create share link"}
          </Button>
        </form>

        {quotation.share_enabled && quotation.share_token && (
          <a
            href={`/q/${quotation.share_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-red)] hover:underline"
          >
            <Copy className="size-3.5" /> /q/{quotation.share_token.slice(0, 10)}…
          </a>
        )}

        <div className="h-6 w-px bg-[var(--color-border)]" />

        <form action={newVersionAction}>
          <input type="hidden" name="id" value={quotation.id} />
          <Button type="submit" variant="ghost" size="sm">
            <GitBranch className="size-4" /> New version
          </Button>
        </form>

        {versions.length > 1 && (
          <div className="flex items-center gap-1.5 text-sm text-[var(--color-ink-secondary)]">
            <span>Versions:</span>
            {versions.map((v) => (
              <Link
                key={v.id}
                href={`/quotations/${v.id}`}
                className={
                  v.id === quotation.id
                    ? "font-semibold text-[var(--color-ink)]"
                    : "text-[var(--color-red)] hover:underline"
                }
              >
                v{v.version}
              </Link>
            ))}
          </div>
        )}
      </Card>

      <QuoteBuilder quotation={quotation} sections={sections} lines={lines} />
    </div>
  );
}
