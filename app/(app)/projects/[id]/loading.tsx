import {
  SkeletonBar,
  SkeletonCards,
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * Every project surface — the workspace itself and all eight modules — shares
 * one frame: a back link, a page header naming the project, a tab or segment
 * bar, then cards. The route-group fallback drew four stat tiles and a table,
 * which none of these screens open with, so a click from Modules to Documents
 * flashed a layout that was never going to appear.
 *
 * One `loading.tsx` at the `[id]` segment covers the module routes underneath
 * it too, which is what makes tab-to-tab navigation inside a project feel like
 * one screen rather than eight.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading this project…">
      <div className="mx-auto max-w-6xl">
        <SkeletonBar w={128} className="mb-4" />
        <SkeletonHeader />
        <SkeletonTabs widths={[88, 84, 96]} />
        <div className="mt-6">
          <SkeletonCards count={3} />
        </div>
      </div>
    </SkeletonFrame>
  );
}
