import { describe, it, expect } from "vitest";
import {
  PROCUREMENT_EXPLAINERS,
  SCREEN_EXPLAINER_KEYS,
  getExplainer,
  type ExplainerKey,
} from "./procurement-explainers";

const KEYS = Object.keys(PROCUREMENT_EXPLAINERS) as ExplainerKey[];

describe("PROCUREMENT_EXPLAINERS", () => {
  it("every key has a non-empty term and body", () => {
    expect(KEYS.length).toBeGreaterThan(0);
    for (const k of KEYS) {
      const entry = PROCUREMENT_EXPLAINERS[k];
      expect(entry.term.trim().length, `${k}.term`).toBeGreaterThan(0);
      expect(entry.body.trim().length, `${k}.body`).toBeGreaterThan(0);
    }
  });

  it("every key a screen references exists in the map", () => {
    expect(SCREEN_EXPLAINER_KEYS.length).toBeGreaterThan(0);
    for (const k of SCREEN_EXPLAINER_KEYS) {
      const entry = getExplainer(k);
      expect(entry, k).toBeDefined();
      expect(entry.term.trim().length, `${k} term`).toBeGreaterThan(0);
      expect(entry.body.trim().length, `${k} body`).toBeGreaterThan(0);
    }
  });

  it("lookup is the same object as the map entry", () => {
    expect(getExplainer("place_of_supply")).toBe(
      PROCUREMENT_EXPLAINERS.place_of_supply,
    );
  });
});
