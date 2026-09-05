import {
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTabs,
  SkeletonTiles,
} from "@/components/ui/skeleton";

/**
 * `/finance/petty` — Dashboard · My Expense · My Fund. The tab bar is the first
 * thing under the header and it is the control the user is reaching for, so the
 * fallback shows it rather than a filter row that is not there.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading petty finance…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader />
        <SkeletonTabs widths={[96, 104, 88]} />
        <div className="mt-6 mb-6">
          <SkeletonTiles count={4} />
        </div>
        <SkeletonTable rows={7} cols={5} />
      </div>
    </SkeletonFrame>
  );
}
