"use client";

/**
 * Route-group error boundary. Multiple modules await their data function
 * directly with no try/catch, so a transient PostgREST/DB error would otherwise
 * throw and white-screen the whole route. This boundary catches it and renders
 * an inline, recoverable message with a Retry that re-runs the failed render.
 *
 * Red is reserved (DESIGN-DIRECTION): this is a genuine error state, so a single
 * red accent on the heading is within the closed list; the Retry is the view's
 * one primary action.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-red-soft,rgba(220,38,38,0.1))]">
        <span aria-hidden className="text-lg font-semibold text-[var(--color-red)]">
          !
        </span>
      </div>
      <h2 className="text-base font-semibold text-[var(--color-ink)]">
        Something went wrong loading this page
      </h2>
      <p className="max-w-md text-sm text-[var(--color-ink-secondary)]">
        This is usually a transient connection hiccup. Try again — if it keeps
        happening, refresh the page.
      </p>
      {error?.digest && (
        <p className="text-xs text-[var(--color-ink-disabled)] tabular">
          Ref: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-1 rounded-[var(--radius-card)] bg-[var(--color-red)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
