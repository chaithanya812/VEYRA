/**
 * Site Progress Uploads — the pure half (PLAN-V4 §9.5, frame `105527`).
 *
 * The frame is a date-grouped photo grid with three tabs, and the two decisions
 * worth writing down are both about honesty:
 *
 * 1. **Group by the date the work happened, not the date the file arrived.**
 *    `105527`'s headers say `Uploaded on: 24 Mar 2026`, which is fine until
 *    somebody uploads Friday's photos on Monday — and that is how site
 *    photography actually works. `taken_on` is the grouping key; `created_at`
 *    is still shown on the card, so both facts survive and neither pretends to
 *    be the other.
 *
 * 2. **`client_visible` is a stored flag, never an inference.** It is what the
 *    three tabs filter on and what the Progress Report reads, and since VEYRA
 *    ships no client portal (§0) that report is the only thing that reaches the
 *    client. A photo is shareable because a person said so.
 *
 * Everything here is pure so the grid, the tab counts and the report agree
 * without any of them talking to the database twice.
 */

export interface SiteProgressPhoto {
  id: string;
  project_id: string | null;
  caption: string | null;
  /** 0019's pasted link. Still valid; new uploads use `storage_path`. */
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | string | null;
  client_visible: boolean;
  /** The day the work was photographed. Null on rows that predate 0038. */
  taken_on: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/* ── The three tabs (`All · Client Visible · Client Not Visible`) ─────────── */

export const SITE_PHOTO_TABS = ["all", "client_visible", "client_hidden"] as const;
export type SitePhotoTab = (typeof SITE_PHOTO_TABS)[number];

export const SITE_PHOTO_TAB_LABELS: Record<SitePhotoTab, string> = {
  all: "All",
  client_visible: "Client visible",
  client_hidden: "Client not visible",
};

/**
 * Read a tab from a URL. Unknown values fall back to `all` rather than throwing:
 * a mistyped deep link should show the photos, not an error page.
 */
export function sitePhotoTabOf(raw: string | null | undefined): SitePhotoTab {
  return (SITE_PHOTO_TABS as readonly string[]).includes(String(raw))
    ? (raw as SitePhotoTab)
    : "all";
}

export function filterPhotos<T extends SiteProgressPhoto>(
  photos: T[],
  tab: SitePhotoTab,
): T[] {
  if (tab === "client_visible") return photos.filter((p) => p.client_visible);
  if (tab === "client_hidden") return photos.filter((p) => !p.client_visible);
  return photos;
}

/**
 * What each tab would show. Rendered on the tabs themselves — a tab that says
 * `Client visible 0` tells you something a silent tab does not.
 */
export function tabCounts(
  photos: readonly SiteProgressPhoto[],
): Record<SitePhotoTab, number> {
  const visible = photos.filter((p) => p.client_visible).length;
  return {
    all: photos.length,
    client_visible: visible,
    client_hidden: photos.length - visible,
  };
}

/* ── Dates and grouping ───────────────────────────────────────────────────── */

/** The day a photo belongs to: when it was taken, or when it landed. */
export function photoDateOf(photo: SiteProgressPhoto): string {
  const day = (photo.taken_on ?? photo.created_at ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/** True when the photo was uploaded on a different day from the one it shows. */
export function wasUploadedLater(photo: SiteProgressPhoto): boolean {
  if (!photo.taken_on) return false;
  const landed = (photo.created_at ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(landed) && landed !== photo.taken_on.slice(0, 10);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * `24 Mar 2026`, formatted from the date string itself rather than through a
 * `Date`. Parsing `2026-03-24` as a Date and reading it back in the local zone
 * is how a photo taken on the 24th ends up filed under the 23rd.
 */
export function formatPhotoDate(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return "Undated";
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${m[3]} ${month} ${m[1]}`;
}

export interface PhotoDateGroup<T extends SiteProgressPhoto = SiteProgressPhoto> {
  /** `YYYY-MM-DD`, or `""` for photos with no usable date. */
  day: string;
  label: string;
  photos: T[];
}

/**
 * The grid: newest day first, and within a day the most recently added photo
 * first. Undated rows collect in one group at the end rather than being dropped
 * — a photo nobody can date is still a photo somebody uploaded.
 */
export function groupPhotosByDate<T extends SiteProgressPhoto>(
  photos: T[],
): PhotoDateGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const p of photos) {
    const day = photoDateOf(p);
    const list = byDay.get(day) ?? [];
    list.push(p);
    byDay.set(day, list);
  }

  return [...byDay.entries()]
    .sort((a, b) => {
      if (a[0] === "") return 1;
      if (b[0] === "") return -1;
      return b[0].localeCompare(a[0]);
    })
    .map(([day, list]) => ({
      day,
      label: day ? formatPhotoDate(day) : "No date recorded",
      photos: [...list].sort((a, b) =>
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
      ),
    }));
}

/* ── Bulk actions (the `Actions ▾` menu in `105527`) ──────────────────────── */

export interface SelectionSummary {
  count: number;
  visible: number;
  hidden: number;
}

/**
 * What a bulk action is about to touch. The menu uses it to say "Show 3 to the
 * client" rather than "Show" — a bulk visibility change is exactly the kind of
 * action that should tell you its blast radius before you take it.
 *
 * Ids that match no photo are ignored: a stale selection must not inflate the
 * count of what is about to change.
 */
export function selectionSummary(
  photos: readonly SiteProgressPhoto[],
  ids: readonly string[],
): SelectionSummary {
  const wanted = new Set(ids);
  const picked = photos.filter((p) => wanted.has(p.id));
  const visible = picked.filter((p) => p.client_visible).length;
  return { count: picked.length, visible, hidden: picked.length - visible };
}

/** Photos the client would receive today — what the Progress Report carries. */
export function clientVisiblePhotos<T extends SiteProgressPhoto>(
  photos: T[],
): T[] {
  return photos.filter((p) => p.client_visible);
}
