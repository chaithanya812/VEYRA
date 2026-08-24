import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import {
  listAssets,
  listSignoffs,
  latestSignoffByAsset,
  SIGNOFF_META,
  kindLabel,
} from "@/lib/data/design";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { Input } from "@/components/ui/field";
import { fmtDate } from "@/lib/utils";
import { AddAssetForm } from "./add-asset-form";

export default async function DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const sp = await searchParams;
  const project = sp.project?.trim() || undefined;

  const [assets, signoffs] = await Promise.all([
    listAssets(project),
    listSignoffs(),
  ]);
  const current = latestSignoffByAsset(signoffs);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Design vault"
        subtitle="Drawings, renders and BOQs per project — reviewed with pin comments and gated by a formal sign-off."
      />

      <AddAssetForm />

      {/* Project filter — server-rendered GET form, no client JS. */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          name="project"
          defaultValue={project ?? ""}
          placeholder="Filter by project label…"
          className="w-64"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {project && (
          <Link href="/design">
            <Button type="button" variant="ghost">
              Clear
            </Button>
          </Link>
        )}
      </form>

      {assets.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="size-8" />}
          title={project ? "No assets for this project" : "The vault is empty"}
          description={
            project
              ? "Try a different project label or clear the filter."
              : "Add your first drawing, render or BOQ above — reviewers comment with pins and approve it before site execution."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const so = current.get(asset.id);
            const meta = so ? SIGNOFF_META[so.status] : null;
            return (
              <Card key={asset.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/design/${asset.id}`}
                    className="font-medium text-[var(--color-ink)] hover:underline"
                  >
                    {asset.name}
                  </Link>
                  <StatusChip tone="neutral" label={kindLabel(asset.kind)} />
                </div>
                <p className="text-sm text-[var(--color-ink-secondary)]">
                  {asset.project_label ?? "No project"}
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  {meta ? (
                    <StatusChip tone={meta.tone} label={meta.label} />
                  ) : (
                    <StatusChip tone="neutral" label="Unsigned" />
                  )}
                  <span className="text-xs text-[var(--color-ink-secondary)] tabular">
                    {fmtDate(asset.created_at)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sign-off legend — the gate vocabulary (rejected red / pending amber / approved green). */}
      {(assets.length > 0 || signoffs.length > 0) && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-ink-secondary)]">
          <span>Sign-off:</span>
          {Object.values(SIGNOFF_META).map((m) => (
            <StatusChip key={m.label} tone={m.tone} label={m.label} />
          ))}
        </div>
      )}
    </div>
  );
}
