import "server-only";
import { withOrg } from "./with-org";
import type { PromptTemplate } from "./quotation-studio";

/**
 * The design prompt library's data module.
 *
 * NO MIGRATION. `ai_prompt_templates` already exists (0025) with a `kind`
 * column; this is a new value in that vocabulary, `design`, alongside the
 * `quotation` and `material_request` prompts the quotation studio seeds. The
 * table is per-tenant, seedable and soft-deactivatable, so the whole feature is
 * a `kind` and a screen.
 *
 * ⛔ `ai_requests` is NOT touched here. It is the append-only ledger of real
 * model calls, and copying a prompt to the clipboard calls no model — logging
 * it there would corrupt the "what did the AI cost us this month" answer that
 * table exists to give.
 */

export const DESIGN_KIND = "design";

/**
 * The seeded library. These ARE the product — the plumbing around them is
 * trivial and the prompt quality is everything — so they are written the way a
 * designer would actually want them: name the one thing to change, then say
 * loudly what must not change. Every one is `is_system`, which means a tenant
 * can rename, edit or deactivate it without losing the ability to re-seed.
 */
const SEED: { name: string; prompt: string; seq: number }[] = [
  {
    seq: 10,
    name: "Swap curtain fabric",
    prompt:
      "Using the attached photo of the {{room}}, replace only the curtain fabric with the fabric in the second reference image. Keep the curtain shape, pleating, length and hardware exactly as they are, and match the fabric's pattern scale to the height of the window.",
  },
  {
    seq: 20,
    name: "Match sofa upholstery",
    prompt:
      "Using the attached photo of the {{room}}, re-upholster only the sofa in the fabric from the second reference image. Preserve the sofa's form, proportions, cushion count and position exactly.",
  },
  {
    seq: 30,
    name: "Replace a surface from a reference",
    prompt:
      "Using the attached photo of the {{room}}, replace only the {{surface}} with the material shown in the second reference image. Keep every object in the room in place.",
  },
  {
    seq: 40,
    name: "Replace a surface by description",
    prompt:
      "Using the attached photo of the {{room}}, replace only the {{surface}} with {{material}} in {{colour}}, with a {{finish}} finish. Leave every other surface untouched.",
  },
  {
    seq: 50,
    name: "Add a floor rug",
    prompt:
      "Using the attached photo of the {{room}}, add a {{material}} floor rug in front of the seating, sized so the front legs of the sofa rest on it. Keep the existing flooring visible around its edges and cast a soft contact shadow.",
  },
  {
    seq: 60,
    name: "Re-style cabinet shutters",
    prompt:
      "Using the attached photo of the {{room}}, restyle only the cabinet shutters to a {{style}} look in {{colour}} with {{hardware}}. Keep every cabinet's position, width and height, and keep the countertop as it is.",
  },
  {
    seq: 70,
    name: "Wardrobe finish swap",
    prompt:
      "Using the attached photo of the {{room}}, change only the wardrobe shutter finish to the veneer in the second reference image, running the grain vertically. Keep the wardrobe's exact size, shutter divisions and handle positions.",
  },
  {
    seq: 80,
    name: "Re-light the room",
    prompt:
      "Using the attached photo of the {{room}}, re-light the scene as {{lighting}}. Change nothing about the furniture, finishes or layout — only the light.",
  },
  {
    seq: 90,
    name: "False ceiling options",
    prompt:
      "Using the attached photo of the {{room}}, add a peripheral false ceiling with a 150 mm cove and recessed warm spots on a 1200 mm grid. Keep the room height looking realistic and do not alter the walls, flooring or furniture.",
  },
  {
    seq: 100,
    name: "Whole-room restyle",
    prompt:
      "Using the attached photo of the {{room}}, restyle the space in a {{style}} direction with a {{colour}} palette. Keep the room's architecture — walls, windows, doors, ceiling height and floor plan — completely unchanged.",
  },
  {
    seq: 110,
    name: "Empty the room",
    prompt:
      "Using the attached photo of the {{room}}, remove all loose furniture and decor while keeping walls, flooring, ceiling, windows, doors and built-in units exactly as they are. Return a clean empty room from the same camera position.",
  },
  {
    seq: 120,
    name: "Client comparison set",
    prompt:
      "Using the attached photo of the {{room}}, produce {{count}} versions that differ only in the {{surface}} finish, each labelled by the material used. Keep everything else identical across all versions so they can be compared fairly.",
  },
];

/**
 * Seed any prompt this tenant does not have yet, matched BY NAME.
 *
 * Idempotent and additive, exactly like `ensureDefaultPrompts` for quotations:
 * a tenant who renamed or deleted one does not get it silently restored on the
 * next page load, because the match is on the name they now hold.
 */
export async function ensureDesignPrompts(): Promise<void> {
  const { db } = await withOrg();
  const { data, error } = await db
    .table("ai_prompt_templates")
    .select("name")
    .eq("kind", DESIGN_KIND);
  if (error) throw error;

  const have = new Set(((data ?? []) as unknown as { name: string }[]).map((r) => r.name));
  const missing = SEED.filter((p) => !have.has(p.name));
  if (missing.length === 0) return;

  // Uniform keys across the batch: a PostgREST bulk insert sends an explicit
  // NULL for a key one row omits, which defeats the column default (§6 Writes).
  const { error: insErr } = await db.table("ai_prompt_templates").insert(
    missing.map((p) => ({
      name: p.name,
      prompt: p.prompt,
      kind: DESIGN_KIND,
      seq: p.seq,
      is_system: true,
      is_active: true,
    })),
  );
  if (insErr) throw insErr;
}

/** The tenant's active design prompts, in display order. */
export async function listDesignPrompts(): Promise<PromptTemplate[]> {
  await ensureDesignPrompts();
  const { db } = await withOrg();
  const { data, error } = await db
    .table("ai_prompt_templates")
    .select("*")
    .eq("kind", DESIGN_KIND)
    .order("seq", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as PromptTemplate[]).filter((p) => p.is_active);
}

/** Add a tenant's own prompt to the library. */
export async function createDesignPrompt(input: {
  name: string;
  prompt: string;
}): Promise<{ error?: string }> {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  if (!name) return { error: "Give the prompt a name." };
  if (!prompt) return { error: "The prompt itself cannot be empty." };

  const { db } = await withOrg();
  const existing = await listDesignPrompts();
  const { error } = await db.table("ai_prompt_templates").insert({
    name,
    prompt,
    kind: DESIGN_KIND,
    // After everything seeded, so a tenant's own prompts collect at the end.
    seq: (existing.at(-1)?.seq ?? 0) + 10,
    is_system: false,
    is_active: true,
  });
  return error ? { error: error.message } : {};
}

/**
 * Retire a prompt. Soft, via `is_active` — the table carries the flag for
 * exactly this, and a tenant who hides a seeded prompt should be able to get it
 * back without a re-seed inventing a duplicate.
 */
export async function deactivateDesignPrompt(id: string): Promise<{ error?: string }> {
  const { db } = await withOrg();
  const { error } = await db.table("ai_prompt_templates").updateById(id, {
    is_active: false,
  });
  return error ? { error: error.message } : {};
}
