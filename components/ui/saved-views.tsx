"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  activeView,
  viewHref,
  viewsForScreen,
  VIEW_NAME_MAX,
  type SavedView,
  type SavedViewScreen,
} from "@/lib/saved-views-model";
import {
  deleteViewAction,
  saveViewAction,
  type SavedViewState,
} from "@/app/(app)/finance/actions";
import { cn } from "@/lib/utils";

/**
 * The saved-views strip — built ONCE and adopted by every screen that keeps
 * its filter state in the URL.
 *
 * Three things about it are load-bearing.
 *
 * 1. **APPLYING A VIEW IS A `<Link>`, NOT STATE.** A saved view is a saved
 *    query string, and the screen already resolves that on the server from
 *    `searchParams`. So there is nothing to hydrate, nothing to sync, and no
 *    way for the chip you clicked and the table you are looking at to disagree.
 *
 * 2. **THE CURRENT QUERY IS READ FROM `useSearchParams`, NOT FROM A PROP.**
 *    The screen never has to remember to pass its own URL down, and the
 *    "unsaved changes to this view" state cannot go stale.
 *
 * 3. **`router.refresh()` AFTER EVERY SUCCESSFUL WRITE.** `revalidatePath`
 *    invalidates the cache but does NOT re-render a client component — the
 *    chip row would still hold the props it was rendered with, so a saved view
 *    would land in Postgres while the strip springs back to its old contents
 *    and reads to the user as a failed save (HANDOFF-V8 §11).
 */
export function SavedViews({
  screen,
  views,
  readError,
}: {
  screen: SavedViewScreen;
  views: SavedView[];
  /**
   * The PostgREST message, verbatim, if the list could not be read. Rendered as
   * itself rather than shown as "no saved views" — a read failure that looks
   * like an empty list is a lie with a plausible shape (§11).
   */
  readError?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [naming, setNaming] = useState(false);
  const [saveState, save, saving] = useActionState<SavedViewState, FormData>(
    saveViewAction,
    undefined,
  );
  const [delState, remove, removing] = useActionState<SavedViewState, FormData>(
    deleteViewAction,
    undefined,
  );

  const current = params.toString();
  const mine = viewsForScreen(views, screen.key);
  const active = activeView(mine, current);

  // Re-render the server component that fed `views` in. Without this the strip
  // keeps the list it was rendered with and the new chip never appears.
  useEffect(() => {
    if (saveState?.ok) {
      setNaming(false);
      router.refresh();
    }
  }, [saveState, router]);
  useEffect(() => {
    if (delState?.ok) router.refresh();
  }, [delState, router]);

  const error = saveState?.error ?? delState?.error ?? readError;

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-ink-secondary)]">
          <Bookmark className="size-3.5" /> Saved views
        </span>

        {mine.length === 0 && !naming && (
          <span className="text-[13px] text-[var(--color-ink-disabled)]">
            {readError
              ? "Saved views could not be read — see below."
              : "None yet — filter this screen, then save it."}
          </span>
        )}

        {mine.map((v) => {
          const isActive = active?.id === v.id;
          return (
            <span
              key={v.id}
              data-testid="saved-view-chip"
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px]",
                isActive
                  ? "border-[var(--color-ink)] bg-[var(--color-surface-sunken)] font-medium text-[var(--color-ink)]"
                  : "border-[var(--color-border)] text-[var(--color-ink-secondary)]",
              )}
            >
              <Link
                href={viewHref(screen, v.query)}
                className="hover:underline"
                aria-current={isActive ? "true" : undefined}
              >
                {v.name}
              </Link>
              {/* Deleting YOUR OWN view. The server re-reads ownership before
                  it deletes — this button is convenience, not the check. */}
              <form action={remove} className="contents">
                <input type="hidden" name="screen" value={screen.key} />
                <input type="hidden" name="id" value={v.id} />
                <button
                  type="submit"
                  disabled={removing}
                  aria-label={`Delete saved view ${v.name}`}
                  title={`Delete “${v.name}”`}
                  className="rounded-full p-0.5 text-[var(--color-ink-disabled)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>
              </form>
            </span>
          );
        })}

        {active && (
          <span className="text-[13px] text-[var(--color-ink-disabled)]">
            · showing “{active.name}”
          </span>
        )}

        {naming ? (
          <form action={save} className="flex items-center gap-2">
            <input type="hidden" name="screen" value={screen.key} />
            {/* The CURRENT url, canonicalised server-side by the screen's own
                registry entry — a saved view cannot carry a param the screen
                does not resolve. */}
            <input type="hidden" name="q" value={current} />
            <Input
              name="name"
              autoFocus
              required
              maxLength={VIEW_NAME_MAX}
              placeholder="Name this view"
              aria-label="Name this view"
              defaultValue={active?.name ?? ""}
              className="h-8 w-48"
            />
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setNaming(true)}
            title={
              current
                ? "Save the current filter and columns as a named view"
                : "Save this screen, unfiltered, as a named view"
            }
          >
            <BookmarkPlus className="size-4" /> Save current view
          </Button>
        )}

        {mine.length > 0 && current && !active && (
          <Link href={pathname} className="text-[13px] text-[var(--color-ink-secondary)] hover:underline">
            Clear
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-[13px] text-[var(--color-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
