import Link from "next/link";
import { ArrowLeft, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { listStages } from "@/lib/data/pipeline";
import { deleteStageAction, reorderStageAction } from "../actions";
import { AddStageForm } from "./add-stage-form";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/primitives";

/**
 * Manage the tenant's pipeline stages (OPS-CRM-002): add, reorder, delete.
 * Stages are neutral/grey — no per-stage colouring (red is reserved §Design).
 * Deleting a stage never deletes leads; they simply leave the board until
 * matched by another stage name.
 */
export default async function PipelineStagesPage() {
  const stages = await listStages();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/pipeline"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to pipeline
      </Link>

      <PageHeader
        title="Pipeline stages"
        subtitle={`${stages.length} stages · the board reads left to right in this order.`}
      />

      <Card className="mb-6 p-5">
        <AddStageForm />
      </Card>

      <Card className="overflow-hidden">
        {stages.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--color-ink-secondary)]">
            No stages yet — add your first stage above. The board seeds the
            default pipeline on first visit.
          </p>
        ) : (
          <ul>
            {stages.map((stage, i) => (
              <li
                key={stage.id}
                className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-0 hover:bg-[var(--color-surface-sunken)]"
              >
                <span className="w-6 text-right text-xs text-[var(--color-ink-secondary)] tabular">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-ink)] truncate">
                    {stage.name}
                    {stage.is_won && (
                      <span className="ml-2 text-xs font-normal text-[var(--color-ink-secondary)]">
                        winning stage
                      </span>
                    )}
                    {stage.is_lost && (
                      <span className="ml-2 text-xs font-normal text-[var(--color-red)]">
                        lost stage
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-ink-secondary)]">
                    Leads match this column by their status name.
                  </p>
                </div>

                <form action={reorderStageAction}>
                  <input type="hidden" name="id" value={stage.id} />
                  <input type="hidden" name="dir" value="up" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={i === 0}
                    aria-label={`Move ${stage.name} up`}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                </form>
                <form action={reorderStageAction}>
                  <input type="hidden" name="id" value={stage.id} />
                  <input type="hidden" name="dir" value="down" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={i === stages.length - 1}
                    aria-label={`Move ${stage.name} down`}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </form>
                <form action={deleteStageAction}>
                  <input type="hidden" name="id" value={stage.id} />
                  <Button
                    type="submit"
                    variant="danger"
                    size="sm"
                    aria-label={`Delete ${stage.name}`}
                  >
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
