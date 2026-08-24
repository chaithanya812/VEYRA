/**
 * Route-group loading skeleton. Next.js renders this instantly on every
 * in-app navigation while the target server component fetches, so a click gives
 * immediate feedback instead of a frozen screen. Neutral greys only — red is a
 * reserved accent (DESIGN-DIRECTION) and never used for chrome/skeletons.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Page heading */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-[var(--color-border-strong)]" />
          <div className="h-3.5 w-64 rounded bg-[var(--color-border)]" />
        </div>
        <div className="h-9 w-32 rounded-[var(--radius-card)] bg-[var(--color-border)]" />
      </div>

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="h-3 w-20 rounded bg-[var(--color-border)]" />
            <div className="mt-3 h-6 w-24 rounded bg-[var(--color-border-strong)]" />
          </div>
        ))}
      </div>

      {/* Content rows */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <div className="h-3.5 w-32 rounded bg-[var(--color-border)]" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3.5 last:border-0"
          >
            <div className="h-4 w-4 shrink-0 rounded bg-[var(--color-border)]" />
            <div className="h-3.5 flex-1 rounded bg-[var(--color-border)]" />
            <div className="h-3.5 w-24 rounded bg-[var(--color-border)]" />
            <div className="h-3.5 w-16 rounded bg-[var(--color-border)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
