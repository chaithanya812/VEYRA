import {
  SkeletonFilterBar,
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
} from "@/components/ui/skeleton";

/**
 * `/orders` — header, the order-state checkbox band plus payment and vendor
 * selects, then a nine-column table. No stat tiles: the overdue count is said
 * in the header subtitle rather than shown as a box.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading purchase orders…">
      <div className="mx-auto max-w-7xl">
        <SkeletonHeader />
        <div className="mb-4">
          <SkeletonFilterBar controls={6} />
        </div>
        <SkeletonTable rows={8} cols={7} />
      </div>
    </SkeletonFrame>
  );
}
