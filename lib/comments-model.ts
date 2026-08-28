/**
 * The shared comment/activity thread (PLAN-V4 §3, frames `104841` / `105527` /
 * `105927`).
 *
 * The same thread appears on a design file, a site photo and a purchase order,
 * so it is modelled once against `(entity_type, entity_id)` and rendered by one
 * component. The two structural facts that make it more than a comment list:
 *
 * - **Audience is a hard split.** `internal` and `client` are two separate
 *   threads on the same object (104841's INTERNAL | CLIENT switch), not a flag
 *   on a shared list. A client must never see the internal one.
 * - **Comments are scoped to a version.** `Ver 1 ▾` filters the thread, because
 *   "change the sofa" refers to the drawing it was written against.
 *
 * The table lands in migration 0029; this file is the vocabulary and the
 * filtering, and is pure so both sides can use it.
 */

export type CommentAudience = "internal" | "client";
export type CommentStatus = "open" | "accepted" | "not_required";

export interface EntityComment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  audience: CommentAudience;
  status: CommentStatus;
  parentId?: string | null;
  /** Null = written against the file as a whole, not one version. */
  versionId?: string | null;
  /** Anchor on the document. Modelled from day one even if pins render centred. */
  page?: number | null;
  x?: number | null;
  y?: number | null;
}

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  open: "Pending",
  accepted: "Accepted",
  not_required: "Not required",
};

export const COMMENT_STATUS_TONE: Record<CommentStatus, "amber" | "green" | "neutral"> = {
  open: "amber",
  accepted: "green",
  not_required: "neutral",
};

export const AUDIENCE_LABELS: Record<CommentAudience, string> = {
  internal: "Internal",
  client: "Client",
};

export interface CommentFilter {
  audience: CommentAudience;
  /** null = "All". */
  status?: CommentStatus | null;
  /** null = every version; otherwise only that version's comments. */
  versionId?: string | null;
  query?: string;
}

/**
 * Top-level comments matching the filter. Replies are attached to their parent
 * rather than listed separately, so a reply never escapes into the wrong
 * audience by being rendered on its own.
 */
export interface CommentThread {
  comment: EntityComment;
  replies: EntityComment[];
  /** 1-based, for the numbered pin badge on the document. */
  pinNumber: number;
}

export function buildThreads(
  comments: EntityComment[],
  filter: CommentFilter,
): CommentThread[] {
  const q = (filter.query ?? "").trim().toLowerCase();

  const inAudience = comments.filter((c) => c.audience === filter.audience);
  const repliesByParent = new Map<string, EntityComment[]>();
  for (const c of inAudience) {
    if (!c.parentId) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }

  const roots = inAudience.filter((c) => !c.parentId);

  // Pin numbers are assigned before filtering, so hiding "Accepted" does not
  // renumber the pins still on the drawing.
  const numbered = roots.map((c, i) => ({ comment: c, pinNumber: i + 1 }));

  return numbered
    .filter(({ comment: c }) => {
      if (filter.versionId !== undefined && filter.versionId !== null) {
        if (c.versionId !== filter.versionId) return false;
      }
      if (filter.status && c.status !== filter.status) return false;
      if (q && !c.body.toLowerCase().includes(q) && !c.authorName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    })
    .map(({ comment, pinNumber }) => ({
      comment,
      pinNumber,
      replies: (repliesByParent.get(comment.id) ?? []).sort(byCreatedAt),
    }));
}

function byCreatedAt(a: EntityComment, b: EntityComment): number {
  return a.createdAt.localeCompare(b.createdAt);
}

/** What the file list shows: total and still-pending, per audience. */
export function commentCounts(
  comments: EntityComment[],
  audience: CommentAudience,
): { total: number; pending: number } {
  const mine = comments.filter((c) => c.audience === audience);
  return {
    total: mine.length,
    pending: mine.filter((c) => !c.parentId && c.status === "open").length,
  };
}

/**
 * The @mentions in a body, as raw handles. Used to fan out notifications; the
 * caller resolves them against real members and ignores what does not match.
 */
export function extractMentions(body: string): string[] {
  const found = body.match(/@[\w.-]+/g) ?? [];
  return [...new Set(found.map((m) => m.slice(1).toLowerCase()))];
}
