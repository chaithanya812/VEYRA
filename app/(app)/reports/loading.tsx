import {
  SkeletonCards,
  SkeletonFrame,
  SkeletonHeader,
} from "@/components/ui/skeleton";

/**
 * `/reports` — a three-column grid of report cards, one per capability the
 * caller holds. It is the one list screen in the app with no table at all, so
 * the route-group fallback's tiles-and-rows was the wrong shape twice over.
 *
 * The read behind it is the permission sweep (`canAll`), not a page of data,
 * which is why the fallback is cards and no filter row.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading reports…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader action={false} />
        <SkeletonCards count={6} cols={3} />
      </div>
    </SkeletonFrame>
  );
}
