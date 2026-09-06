/**
 * The design prompt library — pure model, client-safe (no `server-only`), so
 * the composer form and the server action share one definition of what a
 * prompt is and how it assembles.
 *
 * ⛔ NO AI IS CALLED ANYWHERE IN THIS FEATURE. Assembling a prompt is string
 * substitution. That matters beyond cost: every existing AI surface in VEYRA is
 * dead in production because `AI_GEMINI_API_KEY` is unset, and this one is not,
 * because it never asks a model anything. It also means nothing here can
 * produce a price, a rate or a quantity (HARD RULE 2) — the only numbers a
 * prompt carries are ones the user typed into it.
 *
 * The product is the PROMPTS, not the plumbing. The plumbing is this file.
 */

/* ── Variables ─────────────────────────────────────────────────────────────
 * A template body carries `{{name}}` placeholders. The variable list is
 * DERIVED from the body and never stored beside it: a stored list and a body
 * that disagree is a bug waiting to happen, and it is the same "derived, never
 * stored" rule the money screens follow.
 */

const VAR_RE = /\{\{(\w+)\}\}/g;

/** Variables used by a template, in order of first appearance, deduplicated. */
export function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of String(body ?? "").matchAll(VAR_RE)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/**
 * Suggested values per variable name. A name with no entry falls back to a
 * free-text input rather than an empty dropdown — a template must never become
 * unusable because somebody invented a placeholder.
 */
export const VOCAB: Record<string, string[]> = {
  room: ["Kitchen", "Master bedroom", "Kids bedroom", "Living room", "Dining", "Pooja room", "Balcony", "Utility", "Home office"],
  surface: ["Curtain fabric", "Sofa upholstery", "Flooring", "Countertop", "Cabinet shutters", "Wardrobe shutters", "Backsplash", "Wall paint", "False ceiling", "Bed headboard"],
  material: ["Fluted teak veneer", "Sage green laminate", "Statuario marble", "Kota stone", "Terrazzo", "Rattan cane", "Acrylic high gloss", "PU matte", "Natural linen", "Jute weave"],
  colour: ["Ivory white", "Off-white", "Sage green", "Deep indigo", "Terracotta", "Warm walnut", "Charcoal", "Dusty rose"],
  style: ["Contemporary Indian", "Minimal", "Boho", "European classic", "Mid-century modern", "Traditional Kerala", "Industrial"],
  finish: ["Matte", "High gloss", "Satin", "Textured", "Brushed"],
  hardware: ["Long J-profile handles", "Antique brass knobs", "Handleless push-to-open", "Matte black bar pulls"],
  lighting: ["Warm 2700K evening", "Bright natural daylight", "Cove lighting with recessed spots", "Golden hour from the window"],
  count: ["2", "3", "4"],
};

/* ── Guard clauses ─────────────────────────────────────────────────────────
 * The single biggest quality difference between a good and a bad image-edit
 * prompt is the instruction to change ONLY what was asked. Without it the model
 * regenerates the room and the designer loses the client's actual space.
 */

export interface PromptClause {
  id: string;
  label: string;
  text: string;
  /** On by default. */
  on: boolean;
  /** Cannot be switched off — see `preserve`. */
  locked?: boolean;
}

export const CLAUSES: readonly PromptClause[] = [
  {
    id: "preserve",
    label: "Preserve everything else",
    on: true,
    locked: true,
    text: "Change ONLY what is described above. Every other element — layout, furniture positions, wall finishes, flooring, ceiling, fixtures and decor — must remain exactly as in the source photo.",
  },
  { id: "camera", label: "Keep camera & perspective", on: true,
    text: "Keep the original camera position, focal length and perspective. Do not recompose, crop or rotate the view." },
  { id: "light", label: "Keep lighting", on: true,
    text: "Preserve the existing lighting direction, colour temperature and shadow behaviour." },
  { id: "scale", label: "Realistic scale", on: true,
    text: "Scale all patterns, grains and tile or plank sizes realistically against the room's real dimensions." },
  { id: "photoreal", label: "Photorealistic", on: true,
    text: "Output a photorealistic architectural visualisation, not an illustration or a render with visible CGI artefacts." },
  { id: "india", label: "Indian context", on: false,
    text: "Design for an Indian home: Indian proportions and ceiling heights, locally available materials and finishes, and switchboards and fittings to Indian standards." },
  { id: "variants", label: "Return 3 variations", on: false,
    text: "Return three variations of the same change so the client can compare options side by side." },
  { id: "clean", label: "No text or watermarks", on: false,
    text: "Do not add any text, labels, watermarks, logos or annotations to the image." },
];

/** The clause ids that start switched on. */
export function defaultClauseIds(): string[] {
  return CLAUSES.filter((c) => c.on || c.locked).map((c) => c.id);
}

/** `preserve` is never optional, whatever the caller passes. */
export function normaliseClauseIds(ids: readonly string[]): string[] {
  const set = new Set(ids);
  for (const c of CLAUSES) if (c.locked) set.add(c.id);
  return CLAUSES.filter((c) => set.has(c.id)).map((c) => c.id);
}

/* ── Assembly ───────────────────────────────────────────────────────────── */

export interface AssembledPrompt {
  text: string;
  /** Variables the user has not filled — still visible as `{{name}}`. */
  missing: string[];
}

/**
 * Substitute values, append the chosen constraints, and say which images to
 * attach. An unfilled variable stays visible as `{{name}}` and is reported in
 * `missing`, so a half-filled prompt is obviously half-filled rather than
 * silently shipping a blank the model will invent something for.
 */
export function assemblePrompt(input: {
  body: string;
  values: Record<string, string>;
  clauseIds: readonly string[];
  /** Does this template need a second, reference image? */
  needsReference?: boolean;
}): AssembledPrompt {
  const missing: string[] = [];
  const body = String(input.body ?? "").replace(VAR_RE, (_all, name: string) => {
    const v = input.values?.[name]?.trim();
    if (v) return v;
    if (!missing.includes(name)) missing.push(name);
    return `{{${name}}}`;
  });

  const chosen = new Set(normaliseClauseIds(input.clauseIds ?? []));
  const clauses = CLAUSES.filter((c) => chosen.has(c.id));

  const parts = [body];
  if (clauses.length > 0) {
    parts.push("CONSTRAINTS\n" + clauses.map((c) => `- ${c.text}`).join("\n"));
  }
  parts.push(
    input.needsReference
      ? "ATTACHMENTS\n- Image 1: the room photo to edit.\n- Image 2: the reference showing the material or fabric to apply."
      : "ATTACHMENTS\n- Image 1: the room photo to edit.",
  );

  return { text: parts.join("\n\n"), missing };
}

/**
 * Does a template expect a reference image? Inferred from the body rather than
 * stored, so a tenant writing their own prompt gets the right attachment note
 * without being asked a question they would not understand.
 */
export function needsReferenceImage(body: string): boolean {
  return /second (reference )?image|reference image|second photo/i.test(String(body ?? ""));
}
