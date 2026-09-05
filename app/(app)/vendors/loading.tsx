import {
  SkeletonFilterBar,
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
} from "@/components/ui/skeleton";

/**
 * `/vendors` — header, the frame's seven-control filter band, then the table.
 * No stat tiles: the counts live in the header subtitle. The route-group
 * fallback drew tiles and no filter band, which is the shape inverted.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading vendors…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader />
        <div className="mb-4">
          <SkeletonFilterBar controls={7} />
        </div>
        <SkeletonTable rows={8} cols={7} />
      </div>
    </SkeletonFrame>
  );
}
