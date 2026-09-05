import {
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTiles,
} from "@/components/ui/skeleton";

/**
 * Route-group loading skeleton. Next renders this instantly on every in-app
 * navigation while the target server component fetches, so a click gives
 * immediate feedback instead of a frozen screen.
 *
 * It is the FALLBACK shape — header, tiles, rows — which most list screens
 * share. Screens whose real layout differs enough that this would jump on
 * arrival carry their own `loading.tsx` in their own segment (the three finance
 * screens, the project workspace). Both compose `components/ui/skeleton.tsx`,
 * so there is one skeleton vocabulary and not five.
 *
 * Neutral greys only — red is a reserved accent (DESIGN-DIRECTION) and never
 * used for chrome.
 */
export default function Loading() {
  return (
    <SkeletonFrame>
      <SkeletonHeader />
      <div className="mb-6">
        <SkeletonTiles count={4} />
      </div>
      <SkeletonTable rows={6} cols={4} lead />
    </SkeletonFrame>
  );
}
