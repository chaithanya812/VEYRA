import {
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
} from "@/components/ui/skeleton";

/**
 * `/rfq` — header then the table of quotation requests and their vendor counts.
 * Nothing sits between them, so the route-group fallback's tile band was a row
 * of boxes that vanished on arrival.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading requests for quotation…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader />
        <SkeletonTable rows={6} cols={5} />
      </div>
    </SkeletonFrame>
  );
}
