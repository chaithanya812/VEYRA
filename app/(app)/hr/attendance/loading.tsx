import {
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTabs,
  SkeletonTiles,
} from "@/components/ui/skeleton";

/**
 * `/hr/attendance` — the personal board: header, four year-to-date tiles, then
 * Attendance · Leaves · WFH · Holidays. The route-group fallback had the tiles
 * right and the tab bar missing, so the month's rows landed one control lower
 * than the skeleton promised.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading my attendance…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader action={false} />
        <div className="mb-6">
          <SkeletonTiles count={4} />
        </div>
        <SkeletonTabs widths={[104, 80, 68, 92]} />
        <div className="mt-6">
          <SkeletonTable rows={7} cols={5} />
        </div>
      </div>
    </SkeletonFrame>
  );
}
