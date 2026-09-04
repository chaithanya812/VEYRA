import "server-only";
import { withOrg } from "./with-org";
import { getActingContext } from "./team";
import {
  canonicalQueryFromString,
  replacesExisting,
  validateViewName,
  type SavedView,
  type SavedViewScreen,
} from "@/lib/saved-views-model";

/**
 * Saved views — the data half of HANDOFF-V8 Part 4 Unit 2.
 *
 * Two invariants live here and nowhere else.
 *
 * 1. **THE OWNER COMES FROM THE ACTING CONTEXT, NEVER FROM THE FORM.** Every
 *    read below filters on `member_id`, and the write takes it from
 *    `getActingContext()`. So there is no request shape that lists, replaces or
 *    deletes somebody else's view — the same argument `recordPettyEntry` makes
 *    about `member_id`, for the same reason.
 *
 * 2. **THE QUERY IS CANONICALISED BEFORE IT IS STORED**, by the screen's own
 *    registry entry, which drops any param that screen does not itself resolve.
 *    A saved view cannot smuggle an arbitrary query param into a screen that
 *    will later replay it.
 *
 * Every `.error` is checked and reported as itself (HARD RULE 12).
 */

interface SavedViewRow {
  id: string;
  screen: string;
  name: string;
  query: string | null;
}

export interface SavedViewList {
  views: SavedView[];
  /** The PostgREST message, verbatim. Never a friendlier one (HARD RULE 12). */
  error?: string;
}

/**
 * The acting member's saved views for one screen.
 *
 * ⚠ THE ERROR IS RETURNED, NOT THROWN, AND NEVER SWALLOWED. Saved views are
 * an enhancement on a money screen; a read failure here — the table not yet
 * migrated, a renamed column — must not take the Payments Dashboard down with
 * it. But "you have no saved views" would be a lie with a plausible shape
 * (§11), so the message travels to the strip and is rendered as itself. Silence
 * is the failure mode this codebase has already paid for.
 */
export async function listSavedViews(
  screen: SavedViewScreen,
): Promise<SavedViewList> {
  const { db } = await withOrg();
  const acting = await getActingContext();
  const { data, error } = await db
    .table("saved_views")
    .select("id, screen, name, query")
    .eq("member_id", acting.member.id)
    .eq("screen", screen.key);
  if (error) return { views: [], error: error.message };
  return {
    views: ((data ?? []) as unknown as SavedViewRow[]).map((r) => ({
      id: r.id,
      screen: r.screen,
      name: r.name,
      query: r.query ?? "",
    })),
  };
}

/**
 * Save the current URL as a named view, replacing the caller's own view of the
 * same name rather than creating a second chip with the same label.
 *
 * `rawQuery` is the browser's `location.search` — canonicalised here, so what
 * is stored is exactly what the screen will resolve.
 */
export async function saveView(input: {
  screen: SavedViewScreen;
  name: string;
  rawQuery: string;
}): Promise<{ error?: string; id?: string; replaced?: boolean }> {
  const named = validateViewName(input.name);
  if (!named.ok) return { error: named.error };
  const query = canonicalQueryFromString(input.screen, input.rawQuery ?? "");

  // A read failure here CANNOT be tolerated the way it is on the strip: if the
  // existing views are unknown, "replace" and "insert" are indistinguishable
  // and the insert would trip the unique index with a confusing error.
  const mine = await listSavedViews(input.screen);
  if (mine.error) return { error: mine.error };
  const existing = replacesExisting(mine.views, input.screen.key, named.name);

  const { db } = await withOrg();
  if (existing) {
    // Same name, new filter — an UPDATE, so the chip the person is looking at
    // is the one that changes. An insert would trip the unique index and read
    // to them as "saving is broken".
    const { error } = await db.table("saved_views").updateById(existing.id, {
      name: named.name,
      query,
      updated_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };
    return { id: existing.id, replaced: true };
  }

  const acting = await getActingContext();
  const { data, error } = await db.table("saved_views").insert({
    member_id: acting.member.id,
    screen: input.screen.key,
    name: named.name,
    query,
  });
  if (error) return { error: error.message };
  const id = (data as unknown as { id: string }[] | null)?.[0]?.id;
  return { id };
}

/**
 * Delete one of the caller's OWN views.
 *
 * The ownership check is a read before the delete, not a WHERE on the delete:
 * `withOrg` exposes only `deleteById`, so proving the row is the caller's is
 * this function's job. A wrong id returns a message that says so rather than
 * silently succeeding.
 */
export async function deleteSavedView(
  screen: SavedViewScreen,
  id: string,
): Promise<{ error?: string }> {
  const mine = await listSavedViews(screen);
  if (mine.error) return { error: mine.error };
  if (!mine.views.some((v) => v.id === id)) {
    return { error: "That view is not yours to delete." };
  }
  const { db } = await withOrg();
  const { error } = await db.table("saved_views").deleteById(id);
  return error ? { error: error.message } : {};
}
