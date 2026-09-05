import {
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/procurement` — company-wide Requests · RFQ · Orders · Acceptance. The tab
 * bar is the first thing under the header and it is the control the user is
 * reaching for, so the fallback shows it rather than four stat tiles this
 * screen never renders.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading procurement…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader action={false} />
        <SkeletonTabs widths={[92, 64, 76, 100]} />
        <div className="mt-6">
          <SkeletonTable rows={7} cols={6} />
        </div>
      </div>
    </SkeletonFrame>
  );
}
