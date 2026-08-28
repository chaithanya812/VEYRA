/**
 * The dashboard's own loading shape — a tab bar, four tiles, one list.
 *
 * The route-group skeleton (`app/(app)/loading.tsx`) covers navigations; this
 * one is the Suspense fallback for the workspace body specifically, so the
 * greeting and the page frame paint immediately while `getMyWorkspace()` is
 * still in flight (frame `102211`: the whole content area was grey and the
 * status bar read "Waiting for localhost…").
 *
 * Neutral greys only — red is a reserved accent and never used for chrome.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your workspace…</span>

      {/* Tab bar */}
      <div className="inline-flex gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1">
        {[72, 64, 60, 74, 82].map((w, i) => (
          <div
            key={i}
            style={{ width: w }}
            className="h-9 rounded-md bg-[var(--color-border)]"
          />
        ))}
      </div>

      {/* Tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
            <div className="mt-3 h-7 w-20 rounded bg-[var(--color-border-strong)]" />
            <div className="mt-2 h-3 w-28 rounded bg-[var(--color-border)]" />
          </div>
        ))}
      </div>

      {/* Section + list */}
      <div className="mt-8">
        <div className="mb-3 h-3.5 w-28 rounded bg-[var(--color-border)]" />
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3.5 last:border-0"
            >
              <div className="h-3.5 flex-1 rounded bg-[var(--color-border)]" />
              <div className="h-3.5 w-24 rounded bg-[var(--color-border)]" />
              <div className="h-6 w-6 rounded-full bg-[var(--color-border)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
