import Link from "next/link";
import { Settings2 } from "lucide-react";
import { getPipelineBoard } from "@/lib/data/pipeline";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { inr } from "@/lib/utils";
import { PipelineBoard } from "./pipeline-board";

/**
 * Pipeline — a funnel over a grouped table (PLAN-V4 §6).
 *
 * This replaced a Kanban board. The owner: *"go to the pipeline, dude, it looks
 * mad at me… it looks absolute garbage… you cannot put a kanban board… change
 * it."* With fourteen tenant-configurable statuses, a column per stage is a
 * horizontal-scroll wall of cards carrying a name and a number. The same data
 * as a funnel plus a grouped table shows owner, next follow-up, days in stage
 * and last activity — the things you actually triage on.
 */
export default async function PipelinePage() {
  const { rows, statuses, options, total, value } = await getPipelineBoard();

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Pipeline"
        subtitle={`${total} leads · ${inr(value)} in play · grouped by your own status ladder`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/settings/workspace">
              <Settings2 className="size-4" /> Manage statuses
            </Link>
          </Button>
        }
      />
      <PipelineBoard rows={rows} statuses={statuses} options={options} />
    </div>
  );
}
