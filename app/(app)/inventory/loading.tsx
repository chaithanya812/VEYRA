import {
  SkeletonFrame,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/inventory` — five tabs (Warehouse/Site · Deliveries · Expense · History ·
 * Material Search), and every one of them opens with the tab bar rather than
 * with stat tiles. The route-group fallback drew tiles, so switching into
 * Inventory flashed a band that was never going to appear.
 */
export default function Loading() {
  return (
    <SkeletonFrame label="Loading inventory…">
      <div className="mx-auto max-w-6xl">
        <SkeletonHeader />
        <SkeletonTabs widths={[152, 148, 132, 148, 124]} />
        <div className="mt-6">
          <SkeletonTable rows={7} cols={5} />
        </div>
      </div>
    </SkeletonFrame>
  );
}
