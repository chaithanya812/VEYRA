import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Trash2, PackageOpen } from "lucide-react";
import { getMaterialRequest } from "@/lib/data/material-requests";
import {
  MR_ITEM_STAGE_META,
  MR_LIFECYCLE_STAGES,
  MR_STAGE_META,
  isOverdue,
  itemStageOf,
  stageBreakdown,
  type MRTone,
} from "@/lib/material-requests-model";
import { updateMRStageAction, removeMRItemAction } from "../actions";
import { AddItemForm } from "./add-item-form";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Card, PageHeader, StatusChip, EmptyState } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/utils";

/**
 * One material request, deep-linked from `/procurement` (`110014`).
 *
 * The Stage control here moves the REQUEST's own lifecycle — draft → requested
 * → cancelled — and nothing else, because migration 0036 moved procurement
 * status onto the LINE. The lines show where they actually are; moving them is
 * the project screen's job, where the project that owns them is known and can
 * be guarded against.
 *
 * Stage chips are green/amber/grey ONLY (no red tone exists in MR_STAGE_META).
 * Red on this screen: the overdue delivery alert (true alert) and the
 * destructive remove control — nothing else.
 */
const TONE_TO_CHIP: Record<MRTone, "neutral" | "green" | "amber"> = {
  neutral: "neutral",
  muted: "neutral",
  active: "amber",
  positive: "green",
};

export default async function MaterialRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getMaterialRequest(id);
  if (!result) notFound();
  const { mr, items } = result;
  const overdue = isOverdue(mr.expected_delivery, mr.stage);
  const meta = MR_STAGE_META[mr.stage];
  const breakdown = stageBreakdown(items);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/procurement"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to material requests
      </Link>

      <PageHeader
        title={mr.title}
        actions={<StatusChip tone={TONE_TO_CHIP[meta.tone]} label={meta.label} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Header card + stage control ─────────────────────────────── */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Details
            </h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              <Row label="Project" value={mr.project_label ?? "—"} />
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-ink-secondary)]">Expected delivery</dt>
                <dd className="text-right">
                  {mr.expected_delivery == null ? (
                    <span className="text-[var(--color-ink)]">—</span>
                  ) : overdue ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-red)]">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {fmtDate(mr.expected_delivery)}
                      <span className="sr-only">(overdue)</span>
                    </span>
                  ) : (
                    <span className="text-[var(--color-ink)]">{fmtDate(mr.expected_delivery)}</span>
                  )}
                </dd>
              </div>
              <Row label="Source" value={mr.source.replace(/_/g, " ")} />
              <Row label="Created" value={fmtDate(mr.created_at)} />
            </dl>
            {mr.remarks && (
              <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-ink-secondary)]">
                {mr.remarks}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              Request stage
            </h2>
            <p className="mb-3 text-xs text-[var(--color-ink-secondary)]">
              Whether this request has been raised. Where its goods are is a
              per-line answer — see the Stage column opposite.
            </p>
            <form action={updateMRStageAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={mr.id} />
              <Field label="Move to stage" htmlFor="stage">
                <Select id="stage" name="stage" defaultValue={mr.stage}>
                  {MR_LIFECYCLE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {MR_STAGE_META[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary" size="sm">
                Update stage
              </Button>
            </form>
          </Card>
        </div>

        {/* ── Line items ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
              Line items{" "}
              <span className="font-normal text-[var(--color-ink-secondary)]">
                ({items.length})
              </span>
            </h2>

            {/* THE Stage cell from `110014`: a breakdown, never a status. The
                counts here add back to the line count above. */}
            {breakdown.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {breakdown.map((s) => (
                  <span
                    key={s.stage}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-[12px] text-[var(--color-ink-secondary)]"
                  >
                    {s.label}
                    <span className="font-medium tabular text-[var(--color-ink)]">
                      ({s.count})
                    </span>
                  </span>
                ))}
              </div>
            )}

            {items.length === 0 ? (
              <EmptyState
                icon={<PackageOpen className="size-8" />}
                title="No line items yet"
                description="Add the first item below — catalogue match or flagged ad-hoc."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-left text-[var(--color-ink-secondary)]">
                      <th className="px-3 py-3 font-medium">S.No</th>
                      <th className="px-3 py-3 font-medium">Item Name</th>
                      <th className="px-3 py-3 font-medium">UOM</th>
                      <th className="px-3 py-3 font-medium text-right">Qty</th>
                      <th className="px-3 py-3 font-medium">Stage</th>
                      <th className="px-3 py-3 font-medium">Remarks</th>
                      <th className="px-3 py-3 font-medium"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr
                        key={it.id}
                        className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border)]/40"
                      >
                        <td className="px-3 py-2.5 tabular text-[var(--color-ink-secondary)]">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">
                          <span className="inline-flex items-center gap-2">
                            {it.item_name}
                            {it.is_adhoc && (
                              <span
                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-secondary)]"
                                title="Not in the catalogue yet — pending promotion to the Item master"
                              >
                                ad-hoc
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-ink-secondary)]">{it.uom ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular text-[var(--color-ink)]">
                          {Number(it.qty)}
                        </td>
                        <td className="px-3 py-2.5">
                          {/* itemStageOf, not a raw index: an unrecognised
                              stage reads as Pending rather than crashing the
                              row it belongs to. */}
                          <StatusChip
                            tone={
                              TONE_TO_CHIP[
                                MR_ITEM_STAGE_META[itemStageOf(it.stage)].tone
                              ]
                            }
                            label={MR_ITEM_STAGE_META[itemStageOf(it.stage)].label}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-ink-secondary)]">{it.remarks ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          <form action={removeMRItemAction}>
                            <input type="hidden" name="id" value={it.id} />
                            <input type="hidden" name="mrId" value={mr.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${it.item_name}`}
                              className="text-[var(--color-ink-secondary)] hover:text-[var(--color-red)]"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <AddItemForm mrId={mr.id} />
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
