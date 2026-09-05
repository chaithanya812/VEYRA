import {
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
} from "@/components/ui/skeleton";

/**
 * `/quotations` — header then the table, with nothing in between: no tiles, no
 * filter row. The route-group fallback drew both, so the list jumped up by two
 * rows on arrival.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading quotations…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader />
        <SkeletonTable rows={8} cols={6} />
      </div>
    </SkeletonFrame>
  );
}
