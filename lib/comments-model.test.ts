import { describe, it, expect } from "vitest";
import {
  buildThreads,
  commentCounts,
  extractMentions,
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
