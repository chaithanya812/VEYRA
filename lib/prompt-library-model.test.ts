import { describe, it, expect } from "vitest";
import {
  CLAUSES,
  assemblePrompt,
  defaultClauseIds,
  extractVariables,
  needsReferenceImage,
  normaliseClauseIds,
} from "./prompt-library-model";

describe("extractVariables", () => {
  it("finds placeholders in order of first appearance, deduplicated", () => {
    expect(
      extractVariables("Replace the {{surface}} in the {{room}} with {{surface}}"),
    ).toEqual(["surface", "room"]);
  });

  it("returns nothing for a body with no placeholders", () => {
    expect(extractVariables("Empty the room.")).toEqual([]);
  });

  it("survives empty and non-string bodies without throwing", () => {
    expect(extractVariables("")).toEqual([]);
    expect(extractVariables(undefined as unknown as string)).toEqual([]);
  });

  it("ignores a lone brace pair — a placeholder needs both", () => {
    expect(extractVariables("cost is {not a var} and {{real}}")).toEqual(["real"]);
  });
});

describe("assemblePrompt", () => {
  const body = "Using the attached photo of the {{room}}, replace the {{surface}}.";

  it("substitutes every filled value", () => {
    const r = assemblePrompt({
      body,
      values: { room: "Kitchen", surface: "Cabinet shutters" },
      clauseIds: [],
    });
    expect(r.text).toContain("photo of the Kitchen, replace the Cabinet shutters.");
    expect(r.missing).toEqual([]);
  });

  it("leaves an unfilled variable VISIBLE and reports it", () => {
    const r = assemblePrompt({ body, values: { room: "Kitchen" }, clauseIds: [] });
    expect(r.text).toContain("{{surface}}");
    expect(r.missing).toEqual(["surface"]);
  });

  it("treats a blank or whitespace value as unfilled", () => {
    const r = assemblePrompt({
      body,
      values: { room: "Kitchen", surface: "   " },
      clauseIds: [],
    });
    expect(r.missing).toEqual(["surface"]);
  });

  it("reports a repeated missing variable once", () => {
    const r = assemblePrompt({
      body: "{{x}} and {{x}} again",
      values: {},
      clauseIds: [],
    });
    expect(r.missing).toEqual(["x"]);
  });

  /**
   * The preserve clause is what makes this an EDIT of the client's room rather
   * than a regenerated room that merely looks nice. It must survive a caller
   * passing nothing at all.
   */
  it("always includes the preserve clause, even when no clauses are asked for", () => {
    const r = assemblePrompt({ body, values: {}, clauseIds: [] });
    expect(r.text).toContain("Change ONLY what is described above");
  });

  it("orders clauses as declared, not as passed", () => {
    const r = assemblePrompt({
      body,
      values: {},
      clauseIds: ["clean", "camera"],
    });
    const camera = r.text.indexOf("Keep the original camera position");
    const clean = r.text.indexOf("Do not add any text");
    expect(camera).toBeGreaterThan(-1);
    expect(clean).toBeGreaterThan(camera);
  });

  it("names a second attachment only when the template needs a reference", () => {
    const withRef = assemblePrompt({ body, values: {}, clauseIds: [], needsReference: true });
    expect(withRef.text).toContain("Image 2:");
    const without = assemblePrompt({ body, values: {}, clauseIds: [] });
    expect(without.text).not.toContain("Image 2:");
  });

  it("always ends with the attachments block", () => {
    const r = assemblePrompt({ body, values: {}, clauseIds: [] });
    expect(r.text.trimEnd().split("\n\n").pop()).toContain("ATTACHMENTS");
  });
});

describe("clauses", () => {
  it("every clause has a non-empty id, label and text", () => {
    expect(CLAUSES.length).toBeGreaterThanOrEqual(6);
    for (const c of CLAUSES) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.text.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique — a duplicate would silently drop a clause", () => {
    expect(new Set(CLAUSES.map((c) => c.id)).size).toBe(CLAUSES.length);
  });

  it("exactly one clause is locked, and the defaults include it", () => {
    expect(CLAUSES.filter((c) => c.locked).map((c) => c.id)).toEqual(["preserve"]);
    expect(defaultClauseIds()).toContain("preserve");
  });

  it("normalise re-adds a locked clause somebody tried to remove", () => {
    expect(normaliseClauseIds(["camera"])).toEqual(["preserve", "camera"]);
  });

  it("normalise drops an unknown id rather than trusting it", () => {
    expect(normaliseClauseIds(["nope"])).toEqual(["preserve"]);
  });
});

describe("needsReferenceImage", () => {
  it("detects a body that asks for a second image", () => {
    expect(needsReferenceImage("…the fabric in the second reference image.")).toBe(true);
    expect(needsReferenceImage("…shown in the reference image.")).toBe(true);
  });

  it("is false for a description-only prompt", () => {
    expect(needsReferenceImage("Restyle the shutters in sage green.")).toBe(false);
  });
});
