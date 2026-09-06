import {
  ClipboardList,
  Factory,
  Layers,
  QrCode,
  Scissors,
} from "lucide-react";
import {
  listBoms,
  listCutlists,
  getCutlist,
} from "@/lib/data/production";
import {
  getNestingRun,
  listNestingRuns,
  listPanelTags,
  listWorkCenters,
  getPanelTimeline,
} from "@/lib/data/production-nesting";
import { cutlistTotals } from "@/lib/production-model";
import {
  panelStageTone,
  type NestingPlacement,
} from "@/lib/production-nesting-model";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";
import { BomForm } from "./bom-form";
import { listProjectOptions } from "@/lib/data/projects";
import { CutlistForm } from "./cutlist-form";
import { NestingForm, type NestableCutlist } from "./nesting-form";
import { AdvancePanelButton, GenerateTagsForm } from "./panel-tags-form";
import { WorkCenterForm } from "./work-center-form";

/**
 * Production hub (FEATURE-REGISTER OPS-PROD-001): BOM explosion, the
 * panel-wise cutlist with grain direction + edge-banding, sheet nesting,
 * panel-QR traceability and work centers — the factory moat (Wave 5b).
 *
 * Red discipline (§Design): red appears ONLY as each section's single primary
 * action (Create BOM / Create cutlist / Run nesting / Generate tags / Add work
 * center). All computed quantities are pure arithmetic (lib/production-model.ts,
 * lib/production-nesting-model.ts); totals render as NEUTRAL stat tiles — waste
 * goes amber above 25% WITH a text label, never red. The panel-stage timeline
 * uses neutral/green/amber chips only.
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

/** Model stage tone → chip tone: success→green, warning→amber, never red. */
function stageChipTone(stage: string): "neutral" | "amber" | "green" {
  const tone = panelStageTone(stage);
  return tone === "success" ? "green" : tone === "warning" ? "amber" : "neutral";
}

/** Inline SVG cutting layout of one board — neutral strokes, no red. */
function BoardLayout({
  lengthMm,
  widthMm,
  placements,
}: {
  lengthMm: number;
  widthMm: number;
  placements: NestingPlacement[];
}) {
  const stroke = Math.max(lengthMm, widthMm) / 400;
  const rects = [...placements].sort(
    (a, b) => Number(a.y_mm) - Number(b.y_mm) || Number(a.x_mm) - Number(b.x_mm),
  );
  return (
    <svg
      viewBox={`0 0 ${lengthMm} ${widthMm}`}
      className="block w-full"
      role="img"
      aria-label={`Board layout ${lengthMm} × ${widthMm} mm`}
    >
      <rect
        x={stroke / 2}
        y={stroke / 2}
        width={lengthMm - stroke}
        height={widthMm - stroke}
        fill="var(--color-surface)"
        stroke="var(--color-border-strong)"
        strokeWidth={stroke}
      />
      {rects.map((p, i) => (
        <rect
          key={i}
          x={Number(p.x_mm)}
          y={Number(p.y_mm)}
          width={Number(p.w_mm)}
          height={Number(p.h_mm)}
          fill="var(--color-surface-sunken)"
          stroke="var(--color-ink-secondary)"
          strokeWidth={stroke}
        >
          <title>{`${p.panel_name}${p.rotated ? " (rotated)" : ""}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default async function ProductionPage() {
  const boms = await listBoms();
  const cutlists = await listCutlists();
  // One read, shared by both forms — they must offer the same projects.
  const projects = await listProjectOptions();

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

  // ── Nesting ──
  const nestingRuns = await listNestingRuns();
  const latestRun = nestingRuns[0]
    ? await getNestingRun(nestingRuns[0].id)
    : null;

  const nestableCutlists: NestableCutlist[] = cutlistRows.map(
    ({ cutlist, panels }) => ({
      id: cutlist.id,
      title: cutlist.title,
      board_length_mm:
        cutlist.board_length_mm != null ? Number(cutlist.board_length_mm) : null,
      board_width_mm:
        cutlist.board_width_mm != null ? Number(cutlist.board_width_mm) : null,
      panels: panels.map((p) => ({
        panel_name: p.panel_name,
        length_mm: Number(p.length_mm),
        width_mm: Number(p.width_mm),
        qty: Number(p.qty),
      })),
    }),
  );

  // ── Panel traceability ──
  const tags = await listPanelTags();
  const tagRows = await Promise.all(
    tags.map(async (tag) => ({
      tag,
      events: await getPanelTimeline(tag.id),
    })),
  );

  // ── Work centers ──
  const workCenters = await listWorkCenters();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Production"
        subtitle="Exploded bills of materials, panel-wise cutting lists, sheet nesting, QR panel traceability and work centers."
      />

      {/* ── Bills of materials ─────────────────────────────────────────────── */}
      <section className="mb-10 flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Bills of materials
        </h2>
        <BomForm projects={projects} />

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
      <section className="mb-10 flex flex-col gap-4">
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

        <CutlistForm projects={projects} />

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

      {/* ── Sheet nesting ──────────────────────────────────────────────────── */}
      <section className="mb-10 flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Sheet nesting
        </h2>

        {nestableCutlists.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-8" />}
            title="Create a cutlist first"
            description="Nesting optimises a cutlist's panels onto whole boards — you need at least one cutlist to run it."
          />
        ) : (
          <>
            <NestingForm cutlists={nestableCutlists} />

            {latestRun && (
              <>
                {/* Latest-run stats — waste amber above 25% WITH a label, never red. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Card className="p-5">
                    <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
                      Boards used (latest run)
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
                      {metric(latestRun.run.boards_used)}
                    </p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
                      Waste %
                    </p>
                    <p className="mt-1 flex items-center gap-2">
                      <span className="text-xl font-semibold tabular text-[var(--color-ink)]">
                        {metric(latestRun.run.waste_pct)}
                      </span>
                      <StatusChip
                        tone={Number(latestRun.run.waste_pct) > 25 ? "amber" : "neutral"}
                        label={
                          Number(latestRun.run.waste_pct) > 25
                            ? "High waste"
                            : "Normal"
                        }
                      />
                    </p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
                      Panel area on boards
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular text-[var(--color-ink)]">
                      {metric(latestRun.run.total_panel_area_sqm)}{" "}
                      <span className="text-sm font-normal">of{" "}
                        {metric(latestRun.run.board_area_sqm)} sqm/board
                      </span>
                    </p>
                  </Card>
                </div>

                {/* Board layouts as inline SVG — neutral strokes, no red. */}
                {(() => {
                  const byBoard = new Map<number, NestingPlacement[]>();
                  for (const p of latestRun.placements) {
                    const list = byBoard.get(Number(p.board_index)) ?? [];
                    list.push(p);
                    byBoard.set(Number(p.board_index), list);
                  }
                  const indices = [...byBoard.keys()].sort((a, b) => a - b);
                  return (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {indices.map((boardIndex) => (
                        <Card key={boardIndex} className="p-4">
                          <BoardLayout
                            lengthMm={Number(latestRun.run.board_length_mm)}
                            widthMm={Number(latestRun.run.board_width_mm)}
                            placements={byBoard.get(boardIndex) ?? []}
                          />
                          <p className="mt-2 text-xs text-[var(--color-ink-secondary)] tabular">
                            Board {boardIndex + 1} ·{" "}
                            {(byBoard.get(boardIndex) ?? []).length} panels ·{" "}
                            {Number(latestRun.run.kerf_mm)} mm kerf
                          </p>
                        </Card>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}

            {nestingRuns.length === 0 ? (
              <EmptyState
                icon={<Layers className="size-8" />}
                title="No nesting runs yet"
                description="Pick a cutlist, set the board size and saw kerf, and run nesting — boards used and wastage are computed deterministically."
              />
            ) : (
              <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
                {nestingRuns.map((run) => (
                  <div key={run.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                        {cutlists.find((c) => c.id === run.cutlist_id)?.title ??
                          "Cutlist"}
                      </span>
                      <StatusChip
                        tone="neutral"
                        label={statusLabel(run.status)}
                      />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--color-ink-secondary)] tabular">
                      <span>{metric(run.boards_used)} boards</span>
                      <span>
                        {metric(run.board_length_mm)} ×{" "}
                        {metric(run.board_width_mm)} mm
                      </span>
                      <span>{metric(run.kerf_mm)} mm kerf</span>
                      <span>{metric(run.waste_pct)}% waste</span>
                      <span>Created {fmtDate(run.created_at)}</span>
                    </p>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </section>

      {/* ── Panel traceability (QR) ────────────────────────────────────────── */}
      <section className="mb-10 flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Panel traceability
        </h2>

        {nestableCutlists.length === 0 ? (
          <EmptyState
            icon={<QrCode className="size-8" />}
            title="Create a cutlist first"
            description="Each physical panel gets a QR token walked through cut → edgebanded → drilled → QC → packed → dispatched → installed."
          />
        ) : (
          <>
            <GenerateTagsForm cutlists={nestableCutlists} />

            {tagRows.length === 0 ? (
              <EmptyState
                icon={<QrCode className="size-8" />}
                title="No panel tags yet"
                description="Generate tags for a cutlist — one QR per physical panel, so any scan answers where that panel is."
              />
            ) : (
              <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
                {tagRows.map(({ tag, events }) => (
                  <div key={tag.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="truncate text-[13px] font-semibold text-[var(--color-ink)]">
                          {tag.panel_name}
                        </span>
                        <span className="font-mono text-xs text-[var(--color-ink-secondary)]">
                          {tag.token}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {/* Stage chip: neutral/green/amber ONLY — never red. */}
                        <StatusChip
                          tone={stageChipTone(tag.stage)}
                          label={statusLabel(tag.stage)}
                        />
                        <AdvancePanelButton tagId={tag.id} />
                      </span>
                    </div>
                    {events.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer select-none text-xs font-medium text-[var(--color-ink-secondary)]">
                          Timeline ({events.length})
                        </summary>
                        <ol className="mt-2 flex flex-col gap-1 border-l border-[var(--color-border)] pl-3">
                          {events.map((ev) => (
                            <li
                              key={ev.id}
                              className="text-xs text-[var(--color-ink-secondary)] tabular"
                            >
                              <span className="font-medium text-[var(--color-ink)]">
                                {statusLabel(ev.stage)}
                              </span>{" "}
                              · {fmtDate(ev.created_at)}
                              {ev.note ? ` — ${ev.note}` : ""}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </section>

      {/* ── Work centers ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
          Work centers
        </h2>

        <WorkCenterForm />

        {workCenters.length === 0 ? (
          <EmptyState
            icon={<Factory className="size-8" />}
            title="No work centers yet"
            description="Add factory stations — saw, edge-bander, drilling, QC, packing — with a nominal daily capacity."
          />
        ) : (
          <Card className="divide-y divide-[var(--color-border)] overflow-hidden">
            {workCenters.map((wc) => (
              <div key={wc.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                    {wc.name}
                  </span>
                  {wc.kind && (
                    <span className="text-xs text-[var(--color-ink-secondary)]">
                      {wc.kind}
                    </span>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[var(--color-ink-secondary)] tabular">
                  {wc.capacity_per_day != null && (
                    <span>{metric(wc.capacity_per_day)} panels/day</span>
                  )}
                  {wc.notes && <span className="truncate">{wc.notes}</span>}
                  <span>Added {fmtDate(wc.created_at)}</span>
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
