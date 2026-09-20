import { shouldShowDemoNotice, type DemoFlagged } from "@/lib/demo-notice-model";

/**
 * Shared "DEMO — sample, replace me" box. Informational, never an alert:
 * grey treatment, no red. Renders nothing once a non-demo row exists, and
 * nothing on an empty list.
 */
export function DemoNotice({
  rows,
}: {
  rows: ReadonlyArray<DemoFlagged>;
}) {
  if (!shouldShowDemoNotice(rows)) return null;
  return (
    <div
      role="note"
      className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2 text-[13px] text-[var(--color-ink-secondary)]"
    >
      <span className="font-medium text-[var(--color-ink)]">
        DEMO — sample, replace me
      </span>
      {" — "}
      These are starter samples so the list is not empty. They stay usable;
      they stop counting as yours the moment you add a real row.
    </div>
  );
}
