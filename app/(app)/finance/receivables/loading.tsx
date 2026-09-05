import {
  SkeletonFilterBar,
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTiles,
} from "@/components/ui/skeleton";

/**
 * `/finance/receivables` — the four bucket tiles are the screen's navigation,
 * not decoration, so they belong in the fallback: the generic route-group
 * skeleton put a filter row where the buckets go and the tiles arrived a row
 * lower than the skeleton promised.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading receivables…">
      <div className="mx-auto max-w-[1400px]">
        <SkeletonHeader />
        <div className="mb-4">
          <SkeletonTiles count={4} />
        </div>
        <div className="mb-3">
          <SkeletonFilterBar controls={3} />
        </div>
        <div className="mb-4">
          <SkeletonFilterBar controls={4} />
        </div>
        <SkeletonTable rows={8} cols={6} />
      </div>
    </SkeletonFrame>
  );
}
