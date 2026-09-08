import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, ExternalLink, Scissors } from "lucide-react";
import { getProject } from "@/lib/data/projects";
import { listBoms, listCutlists, getCutlist } from "@/lib/data/production";
import { cutlistTotals } from "@/lib/production-model";
import { can } from "@/lib/data/permissions";
import { PermissionLimited } from "@/components/ui/permission-limited";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { BomForm } from "../../../production/bom-form";
import { CutlistForm } from "../../../production/cutlist-form";
import { fmtDate } from "@/lib/utils";

/**
 * Production, for ONE project.
 *
 * `/production` stays company-wide and keeps the things that genuinely belong
 * to the firm rather than to a job — sheet nesting runs against a chosen board,
 * panel QR traceability follows panels wherever they go, and a work centre is a
 * saw that cuts for every project. Those are not per-project questions, so they
 * are not duplicated here; this screen links across to them.
 *
 * What IS per-project is the BOM and the cutlist: they are exploded from one
 * job's drawings. Until now they carried an optional typed label and floated
 * free of the project, which is what made Production look like it belonged to
 * nothing. They now carry a real `project_id` (migration 0028's FK, finally
 * used), and this screen is that link made navigable — reached from the
 * project's Modules tab like every other module.
 *
 * The forms here are PINNED to this project rather than offering a dropdown:
 * the project is the page you are on, so a picker could only ever be set wrong.
 */
export default async function ProjectProductionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await can("projects.project.view"))) {
    return <PermissionLimited capability="projects.project.view" />;
  }

  // getProject returns { project, updates } — the row is one field in.
  const found = await getProject(id);
  if (!found) notFound();
  const { project } = found;

  const [boms, cutlists] = await Promise.all([listBoms(id), listCutlists(id)]);

  // Panel totals across this project's cutlists, from the same pure model the
  // company-wide screen uses — never recomputed here (§4). One read per
  // cutlist, in parallel; a project carries a handful, not hundreds.
  const withPanels = await Promise.all(cutlists.map((c) => getCutlist(c.id)));
  const totals = cutlistTotals(withPanels.flatMap((c) => c?.panels ?? []));

  const locked = {
    id: project.id,
    name: project.name,
    client_name: project.client_name,
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" className="mb-2">
        <Link href={`/projects/${id}`}>
          <ArrowLeft className="size-4" /> Back to project
        </Link>
      </Button>

      <PageHeader
        title="Production"
        subtitle={`${project.name} · bills of materials and cutting lists for this job`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/production">
              <ExternalLink className="size-4" /> Nesting, panels &amp; work centres
            </Link>
          </Button>
        }
      />

      {/* ── Bills of materials ─────────────────────────────────────────── */}
      <section className="mb-10 flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Bills of materials
        </h2>
        <BomForm projects={[locked]} lockedTo={locked} />

        {boms.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title="No BOMs for this project"
            description="Create one above — exploded material lines with waste-adjusted effective quantities."
          />
        ) : (
          <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
            {boms.map((bom) => (
              <div key={bom.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                    {bom.title}
                  </span>
                  <StatusChip tone="neutral" label={bom.status} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--color-ink-secondary)] tabular">
                  <span>Created {fmtDate(bom.created_at)}</span>
                  {bom.source_ref && <span className="truncate">Ref {bom.source_ref}</span>}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ── Cutlists ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Cutlists
        </h2>

        {cutlists.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ["Panels", totals.panelCount.toLocaleString("en-IN")],
              ["Board area", `${totals.totalAreaSqm} sqm`],
              ["Edge banding", `${Math.round(totals.totalBandingMm / 1000)} m`],
            ].map(([label, value]) => (
              <Card key={label} className="p-5">
                <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
                  {label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
                  {value}
                </p>
              </Card>
            ))}
          </div>
        )}

        <CutlistForm projects={[locked]} lockedTo={locked} />

        {cutlists.length === 0 ? (
          <EmptyState
            icon={<Scissors className="size-8" />}
            title="No cutlists for this project"
            description="Create one above — panel-wise board cuts with grain direction and which edges get banded."
          />
        ) : (
          <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
            {cutlists.map((cl) => (
              <div key={cl.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                    {cl.title}
                  </span>
                  <StatusChip tone="neutral" label={cl.status} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--color-ink-secondary)] tabular">
                  <span>Created {fmtDate(cl.created_at)}</span>
                  {cl.board_material && <span>{cl.board_material}</span>}
                  {cl.board_length_mm && cl.board_width_mm && (
                    <span>
                      {cl.board_length_mm} × {cl.board_width_mm} mm
                    </span>
                  )}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
