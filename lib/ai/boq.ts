import "server-only";
import { AI_BOQ_JSON_SHAPE, parseAiBoq, type AiBoq } from "@/lib/ai-boq-model";
import { extractJson, generate, type AiAttachment } from "./provider";

/**
 * AI prompt-to-BOQ (OPS-EST-002).
 *
 * The model reads a brief — plus, optionally, the floor plan, the client's
 * WhatsApp list or a spec sheet — and returns the SCOPE: rooms, the items in
 * each, a professional quantity and a unit. It does not return a price, and it
 * could not usefully lie about one if it tried: `parseAiBoq` drops every
 * price-shaped field, and the caller creates each line at ₹0 so the
 * deterministic engine and the user set every rate.
 *
 * That split is the whole design. The AI is good at turning "3BHK, modular
 * kitchen in acrylic, wardrobes in both bedrooms" into a structured list, and
 * has no business deciding what a running foot of carcass costs this month.
 */

const SYSTEM_PROMPT = `You are a senior quantity surveyor for the Indian interior, modular-furniture and
construction industry. Given a project brief — and any attached drawings, photos or item lists —
structure the SCOPE OF WORK into rooms/areas and, under each, the line items with a professional
quantity and unit of measure.

HARD RULES:
- NEVER output a price, rate, cost, amount, budget figure, currency or money of any kind. Quantities
  and units ONLY. If the brief states a budget, ignore it — it is not yours to allocate.
- Units must be chosen from the allowed list in the schema.
- Quantities are your best professional estimate implied by the brief; when a dimension is given,
  derive the quantity from it (e.g. a 3m x 0.6m counter is about 1.8 sqm).
- Be specific and buildable: "Base unit with soft-close drawers, 600mm" beats "kitchen cabinets".
- Group by real rooms/areas. Use "All areas" for anything that spans the whole home.
- Respond with ONLY a single valid JSON object matching this exact shape — no prose, no code fences:

${AI_BOQ_JSON_SHAPE}`;

export interface BoqGenerationInput {
  brief: string;
  attachments?: AiAttachment[];
  /** Extra scope context carried over from the lead (rooms, theme, layout). */
  context?: string;
}

/**
 * Structure a brief into a validated, price-free BOQ. Returns the parsed shape
 * or a user-safe message — never throws.
 */
export async function structureScopeToBoq(
  input: BoqGenerationInput | string,
): Promise<{ boq: AiBoq } | { error: string }> {
  const req = typeof input === "string" ? { brief: input } : input;
  const brief = req.brief.trim();
  if (!brief) return { error: "Describe the project scope first." };

  const user = req.context?.trim()
    ? `${brief}\n\nKnown project context:\n${req.context.trim()}`
    : brief;

  const result = await generate({
    system: SYSTEM_PROMPT,
    user,
    attachments: req.attachments,
    json: true,
    maxTokens: 8000,
  });
  if ("error" in result) return result;

  try {
    return parseAiBoq(extractJson(result.text));
  } catch {
    return { error: "Could not read the AI's response as a BOQ. Try rephrasing the brief." };
  }
}
