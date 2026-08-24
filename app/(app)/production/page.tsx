import { ClipboardList, Scissors } from "lucide-react";
import {
  listBoms,
  listCutlists,
  getCutlist,
} from "@/lib/data/production";
import { cutlistTotals } from "@/lib/production-model";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { BomForm } from "./bom-form";
import { CutlistForm } from "./cutlist-form";

/**
 * Production hub (FEATURE-REGISTER OPS-PROD-001): BOM explosion and the
 * panel-wise cutlist with grain direction + edge-banding — the factory moat.
 *
 * Red discipline (§Design): red appears ONLY as each section's single primary
 * action (Create BOM / Create cutlist). All computed quantities are pure
 * arithmetic (lib/production-model.ts); totals render as NEUTRAL stat tiles,
 * never red — there is no alert condition in this slice and no pricing at all.
 */

function metric(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function metres(mm: number): string {
  return (mm / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function ProductionPage() {
  const boms = await listBoms();
  const cutlists = await listCutlists();

  // Per-cutlist totals need their panels; small lists make this fine.
  const cutlistRows = await Promise.all(
    cutlists.map(async (c) => {
      const full = await getCutlist(c.id);
      return { cutlist: c, panels: full?.panels ?? [] };
    }),
  );

  const grandTotals = cutlistTotals(
    cutlistRows.flatMap((r) => r.panels),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Production"
        subtitle="Exploded bills of materials and panel-wise cutting lists — grain direction and edge-banding included."
      />

      {/* ── Bills of materials ─────────────────────────────────────────────── */}
      <section className="mb-10 flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Bills of materials
        </h2>
        <BomForm />

        {boms.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title="No BOMs yet"
            description="Create a bill of materials above — exploded material lines with waste-adjusted effective quantities."
          />
        ) : (
          <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
            {boms.map((bom) => (
              <div key={bom.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                    {bom.title}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-[var(--color-ink-secondary)]">
                    {bom.project_label && <span>{bom.project_label}</span>}
                    <StatusChip
                      tone="neutral"
                      label={statusLabel(bom.status)}
                    />
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--color-ink-secondary)] tabular">
                  <span>Created {fmtDate(bom.created_at)}</span>
                  {bom.source_ref && (
                    <span className="truncate">Ref {bom.source_ref}</span>
                  )}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ── Cutlists ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Cutlists
        </h2>

        {/* Computed totals — neutral stat tiles, NOT red (§Design). */}
        {cutlists.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
                Panels
              </p>
              <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
                {metric(grandTotals.panelCount)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
                Total area
              </p>
              <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
                {metric(grandTotals.totalAreaSqm)}{" "}
                <span className="text-sm font-normal">sqm</span>
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
                Edge-banding
              </p>
              <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
                {metres(grandTotals.totalBandingMm)}{" "}
                <span className="text-sm font-normal">running-metre</span>
              </p>
            </Card>
          </div>
        )}

        <CutlistForm />

        {cutlists.length === 0 ? (
          <EmptyState
            icon={<Scissors className="size-8" />}
            title="No cutlists yet"
            description="Create a cutlist above — panel-wise board cuts with grain direction and which edges get banded."
          />
        ) : (
          <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
            {cutlistRows.map(({ cutlist, panels }) => {
              const t = cutlistTotals(panels);
              return (
                <div key={cutlist.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                      {cutlist.title}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-[var(--color-ink-secondary)]">
                      {cutlist.project_label && (
                        <span>{cutlist.project_label}</span>
                      )}
                      <StatusChip
                        tone="neutral"
                        label={statusLabel(cutlist.status)}
                      />
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--color-ink-secondary)] tabular">
                    <span>{metric(t.panelCount)} panels</span>
                    <span>{metric(t.totalAreaSqm)} sqm</span>
                    <span>{metres(t.totalBandingMm)} m banding</span>
                    {cutlist.board_material && (
                      <span className="truncate">{cutlist.board_material}</span>
                    )}
                    <span>Created {fmtDate(cutlist.created_at)}</span>
                  </p>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
