import {
  SkeletonFilterBar,
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
} from "@/components/ui/skeleton";

/**
 * `/leads` — the heaviest single payload in the app: every lead is fetched once
 * on the server and search, sort and column visibility are client-side over it.
 *
 * Its shape is header · one filter row · a wide table. The route-group fallback
 * puts four stat tiles between the header and the rows and leads has none, so
 * the whole table arrived a tile-row higher than the skeleton promised.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading leads…">
      <div className="mx-auto max-w-[1440px]">
        <SkeletonHeader />
        <div className="mb-4">
          <SkeletonFilterBar controls={5} />
        </div>
        <SkeletonTable rows={10} cols={6} lead />
      </div>
    </SkeletonFrame>
  );
}
