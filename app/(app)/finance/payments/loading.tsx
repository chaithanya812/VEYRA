import {
  SkeletonFilterBar,
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTiles,
} from "@/components/ui/skeleton";

/**
 * `/finance/payments` is the heaviest read in the app — every project, every
 * contract, every payment, folded into one matrix. The route-group fallback is
 * header + tiles + rows, which is close but misses the saved-view bar and the
 * filter form, so the page jumped twice on arrival: once when the filter row
 * appeared and again when the matrix pushed everything down.
 *
 * This is the same vocabulary (`components/ui/skeleton.tsx`), arranged in this
 * screen's order: header · saved views · filter · tiles · matrix.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading the payments dashboard…">
      <div className="mx-auto max-w-[1400px]">
        <SkeletonHeader />
        <div className="mb-3">
          <SkeletonFilterBar controls={3} />
        </div>
        <div className="mb-4">
          <SkeletonFilterBar controls={5} />
        </div>
        <div className="mb-6">
          <SkeletonTiles count={4} />
        </div>
        <SkeletonTable rows={8} cols={6} />
      </div>
    </SkeletonFrame>
  );
}
