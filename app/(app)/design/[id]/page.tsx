import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getAsset, KIND_LABELS, SIGNOFF_META, kindLabel, pinLabel } from "@/lib/data/design";
import { Card, PageHeader, StatusChip } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { CommentForm } from "./comment-form";
import { SignOffControl } from "./signoff-control";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAsset(id);
  if (!result) notFound();
  const { asset, comments, signoff } = result;

  const meta = signoff ? SIGNOFF_META[signoff.status] : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/design"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to vault
      </Link>

      <PageHeader
        title={asset.name}
        subtitle={`${kindLabel(asset.kind)} · ${asset.project_label ?? "No project"} · added ${fmtDate(asset.created_at)}`}
        actions={
          meta ? (
            <StatusChip tone={meta.tone} label={meta.label} />
          ) : (
            <StatusChip tone="neutral" label="Unsigned" />
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Metadata + the asset link */}
        <div className="flex flex-col gap-6 md:col-span-1">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Asset
            </h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              <Row label="Kind" value={KIND_LABELS[asset.kind]} />
              <Row label="Project" value={asset.project_label ?? "—"} />
              <Row
                label="Added"
                value={fmtDate(asset.created_at)}
              />
              {asset.url && (
                <div className="mt-1">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 break-all font-medium text-[var(--color-red)] hover:underline"
                  >
                    Open asset <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                </div>
              )}
            </dl>
            {asset.note && (
              <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-ink-secondary)]">
                {asset.note}
              </p>
            )}
          </Card>

          {/* The sign-off gate */}
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Client sign-off
            </h2>
            <p className="mb-3 text-xs text-[var(--color-ink-secondary)]">
              Site execution waits on an approval here.
            </p>

            <div className="mb-4 flex flex-col gap-2 rounded-md bg-[var(--color-surface-sunken)] p-3 text-sm">
              {signoff ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <StatusChip tone={SIGNOFF_META[signoff.status].tone} label={SIGNOFF_META[signoff.status].label} />
                    <span className="text-xs text-[var(--color-ink-secondary)] tabular">
                      {fmtDate(signoff.signed_at ?? signoff.created_at)}
                    </span>
                  </div>
                  {signoff.note && (
                    <p className="whitespace-pre-wrap text-[var(--color-ink-secondary)]">
                      {signoff.note}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[var(--color-ink-secondary)]">
                  No sign-off recorded yet.
                </p>
              )}
            </div>

            <SignOffControl assetId={asset.id} status={signoff?.status ?? null} />
          </Card>
        </div>

        {/* Pin comments */}
        <div className="md:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
              Review comments
            </h2>

            <CommentForm assetId={asset.id} />

            {comments.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-secondary)]">
                No comments yet — reviewers can pin feedback to a spot with X/Y percentages.
              </p>
            ) : (
              <ol className="flex flex-col gap-4">
                {comments.map((c) => {
                  const pin = pinLabel(c.x_pct, c.y_pct);
                  return (
                    <li key={c.id} className="border-b border-[var(--color-border)] pb-4 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        {pin ? (
                          <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-xs font-medium text-[var(--color-ink)] tabular">
                            {pin}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="shrink-0 text-xs text-[var(--color-ink-secondary)] tabular">
                          {fmtDate(c.created_at)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--color-ink)]">
                        {c.body}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
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
