import { describe, it, expect } from "vitest";
import {
  buildThreads,
  clampPin,
  commentCounts,
  extractMentions,
  pinsFor,
  type EntityComment,
} from "./comments-model";

function c(over: Partial<EntityComment> & { id: string }): EntityComment {
  return {
    body: "Change the current sofa to an L-shaped corner sofa",
    authorName: "Radhika",
    createdAt: "2026-02-27T10:00:00.000Z",
    audience: "internal",
    status: "open",
    parentId: null,
    versionId: "v1",
    ...over,
  };
}

const COMMENTS: EntityComment[] = [
  c({ id: "1", status: "accepted" }),
  c({ id: "2", status: "open", body: "Add a TV unit on the north wall" }),
  c({ id: "3", audience: "client", body: "The client has asked us to add TV" }),
  c({ id: "4", parentId: "2", body: "Noted, revising", createdAt: "2026-02-28T09:00:00.000Z" }),
  c({ id: "5", versionId: "v2", status: "not_required" }),
];

describe("buildThreads", () => {
  it("keeps internal and client as two separate threads", () => {
    const internal = buildThreads(COMMENTS, { audience: "internal" });
    const client = buildThreads(COMMENTS, { audience: "client" });
    expect(internal.map((t) => t.comment.id)).toEqual(["1", "2", "5"]);
    expect(client.map((t) => t.comment.id)).toEqual(["3"]);
  });

  it("never leaks an internal reply into the client thread", () => {
    const client = buildThreads(COMMENTS, { audience: "client" });
    expect(client.flatMap((t) => t.replies)).toHaveLength(0);
  });

  it("attaches replies to their parent instead of listing them", () => {
    const internal = buildThreads(COMMENTS, { audience: "internal" });
    const withReply = internal.find((t) => t.comment.id === "2");
    expect(withReply?.replies.map((r) => r.id)).toEqual(["4"]);
    expect(internal.map((t) => t.comment.id)).not.toContain("4");
  });

  it("scopes to a version — a comment on v1 is not a comment on v2", () => {
    const v2 = buildThreads(COMMENTS, { audience: "internal", versionId: "v2" });
    expect(v2.map((t) => t.comment.id)).toEqual(["5"]);
  });

  it("filters by status", () => {
    const pending = buildThreads(COMMENTS, { audience: "internal", status: "open" });
    expect(pending.map((t) => t.comment.id)).toEqual(["2"]);
  });

  it("does not renumber pins when a filter hides one", () => {
    // "2" is the second pin on the drawing; hiding "Accepted" must not make it
    // pin 1, or the badge on the plan stops matching the list.
    const all = buildThreads(COMMENTS, { audience: "internal" });
    const pending = buildThreads(COMMENTS, { audience: "internal", status: "open" });
    expect(all.find((t) => t.comment.id === "2")?.pinNumber).toBe(2);
    expect(pending[0].pinNumber).toBe(2);
  });

  it("searches body and author", () => {
    expect(
      buildThreads(COMMENTS, { audience: "internal", query: "TV" }).map((t) => t.comment.id),
    ).toEqual(["2"]);
    expect(
      buildThreads(COMMENTS, { audience: "internal", query: "radhika" }),
    ).toHaveLength(3);
  });
});

describe("commentCounts", () => {
  it("reports total and pending per audience, the way the file list shows it", () => {
    expect(commentCounts(COMMENTS, "internal")).toEqual({ total: 4, pending: 1 });
    expect(commentCounts(COMMENTS, "client")).toEqual({ total: 1, pending: 1 });
  });
});

describe("extractMentions", () => {
  it("pulls handles out of a body", () => {
    expect(extractMentions("cc @radhika and @aditi.p on this")).toEqual([
      "radhika",
      "aditi.p",
    ]);
  });

  it("de-duplicates and lower-cases", () => {
    expect(extractMentions("@Rahul @rahul")).toEqual(["rahul"]);
  });

  it("finds nothing in a plain message", () => {
    expect(extractMentions("no mentions here")).toEqual([]);
  });
});

describe("clampPin", () => {
  it("keeps a coordinate on the page", () => {
    expect(clampPin(1.4, -0.2)).toEqual({ x: 1, y: 0 });
  });

  it("rounds to three places — a pin does not need micron precision", () => {
    expect(clampPin(0.123456, 0.987654)).toEqual({ x: 0.123, y: 0.988 });
  });

  it("falls back to the middle rather than NaN", () => {
    expect(clampPin(Number.NaN, Number.NaN)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("pinsFor", () => {
  const PINNED: EntityComment[] = [
    c({ id: "p1", page: 1, x: 0.2, y: 0.3 }),
    c({ id: "p2", page: 1, x: 0.8, y: 0.9, body: "Increase counter space near sink area" }),
    c({ id: "p3", page: 2, x: 0.5, y: 0.5, body: "Second sheet" }),
    c({ id: "p4", body: "A note on the file as a whole" }), // no coordinates
  ];

  it("only draws comments that carry coordinates", () => {
    const pins = pinsFor(buildThreads(PINNED, { audience: "internal" }));
    expect(pins.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("filters to one page", () => {
    const pins = pinsFor(buildThreads(PINNED, { audience: "internal" }), 1);
    expect(pins.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("carries the thread's pin number, so the badge matches the rail", () => {
    const threads = buildThreads(PINNED, { audience: "internal" });
    const pins = pinsFor(threads);
    expect(pins.find((p) => p.id === "p2")?.number).toBe(2);
  });

  it("keeps the number stable when a filter hides an earlier pin", () => {
    // Hiding pin 1 must not promote pin 2 to 1 — the badge on the drawing
    // would then point at the wrong comment.
    const threads = buildThreads(PINNED, { audience: "internal", query: "counter" });
    expect(pinsFor(threads)[0].number).toBe(2);
  });
});
