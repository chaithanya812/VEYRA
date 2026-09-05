import {
  SkeletonBar,
  SkeletonFrame,
  SkeletonTable,
  SkeletonTabs,
  SkeletonTiles,
} from "@/components/ui/skeleton";

/**
 * The dashboard's own loading shape — a tab bar, four tiles, one list.
 *
 * The route-group skeleton (`app/(app)/loading.tsx`) covers navigations; this
 * one is the Suspense fallback for the workspace body specifically, so the
 * greeting and the page frame paint immediately while `getMyWorkspace()` is
 * still in flight (frame `102211`: the whole content area was grey and the
 * status bar read "Waiting for localhost…").
 *
 * The greys, the pulse and the `aria-busy` now come from
 * `components/ui/skeleton.tsx` — this file is only the arrangement.
 */
export function WorkspaceSkeleton() {
  return (
    <SkeletonFrame label="Loading your workspace…">
      <SkeletonTabs widths={[72, 64, 60, 74, 82]} />

      <div className="mt-6">
        <SkeletonTiles count={4} />
      </div>

      <div className="mt-8">
        <SkeletonBar w={112} h={14} className="mb-3" />
        <SkeletonTable rows={4} cols={2} head={false} />
      </div>
    </SkeletonFrame>
  );
}
