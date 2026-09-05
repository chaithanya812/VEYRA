import {
  SkeletonFilterBar,
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTiles,
} from "@/components/ui/skeleton";

/**
 * `/projects` — the portfolio list. Closest of any screen to the route-group
 * fallback (header · tiles · rows), but it carries a stage filter between the
 * tiles and the table and the table is seven columns wide, so the generic shape
 * shifted the whole list by one row on arrival.
 *
 * The Milestones cell is why the table is wide: the list exists to answer "is
 * this project going well", not to print a stage.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading projects…">
      <div className="mx-auto max-w-[1440px]">
        <SkeletonHeader />
        <div className="mb-6">
          <SkeletonTiles count={4} />
        </div>
        <div className="mb-4">
          <SkeletonFilterBar controls={2} />
        </div>
        <SkeletonTable rows={7} cols={7} />
      </div>
    </SkeletonFrame>
  );
}
