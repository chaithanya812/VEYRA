import { describe, it, expect } from "vitest";
import {
  clientVisiblePhotos,
  filterPhotos,
  formatPhotoDate,
  groupPhotosByDate,
  photoDateOf,
  selectionSummary,
  sitePhotoTabOf,
  tabCounts,
  wasUploadedLater,
  type SiteProgressPhoto,
} from "./site-photos-model";

function p(over: Partial<SiteProgressPhoto> & { id: string }): SiteProgressPhoto {
  return {
    project_id: "proj-1",
    caption: null,
    url: null,
    storage_path: "org/proj-1/x/site.jpg",
    mime_type: "image/jpeg",
    size_bytes: 1024,
    client_visible: false,
    taken_on: "2026-03-24",
    uploaded_by: null,
    created_at: "2026-03-24T10:00:00.000Z",
    ...over,
  };
}

describe("tabs", () => {
  const photos = [
    p({ id: "a", client_visible: true }),
    p({ id: "b" }),
    p({ id: "c" }),
  ];

  it("splits into visible and hidden, and the two halves add up", () => {
    const counts = tabCounts(photos);
    expect(counts).toEqual({ all: 3, client_visible: 1, client_hidden: 2 });
    expect(counts.client_visible + counts.client_hidden).toBe(counts.all);
  });

  it("filters to exactly what each tab claims", () => {
    expect(filterPhotos(photos, "all")).toHaveLength(3);
    expect(filterPhotos(photos, "client_visible").map((x) => x.id)).toEqual(["a"]);
    expect(filterPhotos(photos, "client_hidden").map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("falls back to All for an unknown tab rather than throwing", () => {
    expect(sitePhotoTabOf("client_visible")).toBe("client_visible");
    expect(sitePhotoTabOf("nonsense")).toBe("all");
    expect(sitePhotoTabOf(null)).toBe("all");
    expect(sitePhotoTabOf(undefined)).toBe("all");
  });
});

describe("dates", () => {
  it("uses the day the work was photographed, not the day it was uploaded", () => {
    const late = p({
      id: "a",
      taken_on: "2026-03-24",
      created_at: "2026-04-02T09:00:00.000Z",
    });
    expect(photoDateOf(late)).toBe("2026-03-24");
    expect(wasUploadedLater(late)).toBe(true);
  });

  it("falls back to the upload date when no site date was recorded", () => {
    const legacy = p({ id: "a", taken_on: null, created_at: "2026-02-09T05:00:00.000Z" });
    expect(photoDateOf(legacy)).toBe("2026-02-09");
    // Nothing to disagree with, so nothing to flag.
    expect(wasUploadedLater(legacy)).toBe(false);
  });

  it("does not flag a photo uploaded the same day it was taken", () => {
    expect(wasUploadedLater(p({ id: "a" }))).toBe(false);
  });

  it("formats from the date string, never through a local Date", () => {
    expect(formatPhotoDate("2026-03-24")).toBe("24 Mar 2026");
    expect(formatPhotoDate("2026-01-01")).toBe("01 Jan 2026");
    // Midnight UTC on the 24th is the 23rd in the Americas; the string wins.
    expect(formatPhotoDate("2026-12-31")).toBe("31 Dec 2026");
    expect(formatPhotoDate("")).toBe("Undated");
  });
});

describe("groupPhotosByDate", () => {
  const photos = [
    p({ id: "old", taken_on: "2026-01-29", created_at: "2026-01-29T08:00:00.000Z" }),
    p({ id: "new1", taken_on: "2026-03-24", created_at: "2026-03-24T08:00:00.000Z" }),
    p({ id: "new2", taken_on: "2026-03-24", created_at: "2026-03-24T11:00:00.000Z" }),
    p({ id: "mid", taken_on: "2026-02-09", created_at: "2026-02-09T08:00:00.000Z" }),
  ];

  it("groups by day, newest day first", () => {
    const groups = groupPhotosByDate(photos);
    expect(groups.map((g) => g.day)).toEqual(["2026-03-24", "2026-02-09", "2026-01-29"]);
    expect(groups[0].label).toBe("24 Mar 2026");
    expect(groups[0].photos).toHaveLength(2);
  });

  it("puts the most recently added photo first within a day", () => {
    const [first] = groupPhotosByDate(photos);
    expect(first.photos.map((x) => x.id)).toEqual(["new2", "new1"]);
  });

  it("keeps undated photos in a group at the end instead of dropping them", () => {
    const groups = groupPhotosByDate([
      ...photos,
      p({ id: "nodate", taken_on: null, created_at: "not-a-date" }),
    ]);
    const last = groups[groups.length - 1];
    expect(last.day).toBe("");
    expect(last.label).toBe("No date recorded");
    expect(last.photos.map((x) => x.id)).toEqual(["nodate"]);
    // Every photo is still accounted for.
    expect(groups.reduce((n, g) => n + g.photos.length, 0)).toBe(5);
  });

  it("returns nothing for no photos", () => {
    expect(groupPhotosByDate([])).toEqual([]);
  });
});

describe("selectionSummary", () => {
  const photos = [
    p({ id: "a", client_visible: true }),
    p({ id: "b" }),
    p({ id: "c" }),
  ];

  it("counts what a bulk action would actually touch", () => {
    expect(selectionSummary(photos, ["a", "b"])).toEqual({
      count: 2,
      visible: 1,
      hidden: 1,
    });
  });

  it("ignores ids that match no photo, so a stale selection cannot inflate it", () => {
    expect(selectionSummary(photos, ["a", "gone", "also-gone"])).toEqual({
      count: 1,
      visible: 1,
      hidden: 0,
    });
  });

  it("is empty for an empty selection", () => {
    expect(selectionSummary(photos, [])).toEqual({ count: 0, visible: 0, hidden: 0 });
  });
});

describe("clientVisiblePhotos", () => {
  it("is what the Progress Report would carry — nothing else", () => {
    const photos = [
      p({ id: "a", client_visible: true }),
      p({ id: "b" }),
      p({ id: "c", client_visible: true }),
    ];
    expect(clientVisiblePhotos(photos).map((x) => x.id)).toEqual(["a", "c"]);
    expect(clientVisiblePhotos([])).toEqual([]);
  });
});
