import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_BOQ_JSON_SHAPE, parseAiBoq, type AiBoq } from "@/lib/ai-boq-model";

/**
 * Product AI provider — Claude ONLY (REQ-01). The AI structures a free-text
 * project brief into rooms → scope items with qty/uom; a downstream engine
 * prices and a validator verifies. The model is instructed never to emit a
 * price, and parseAiBoq() drops any it does anyway.
 *
 * Requires ANTHROPIC_API_KEY (server-only). When it is absent the feature is
 * cleanly disabled — callers get a clear error, never a crash. Set
 * ANTHROPIC_MODEL to override the model without a code change.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

/** True when the product AI is configured (an Anthropic key is present). */
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM_PROMPT = `You are a senior quantity surveyor for the Indian interior, modular-furniture and
construction industry. Given a short project brief, structure the SCOPE OF WORK into rooms/areas and,
under each, the line items with a professional quantity and unit of measure.

HARD RULES:
- NEVER output a price, rate, cost, amount, currency, or money of any kind. Quantities and units ONLY.
- Units must be chosen from the allowed list in the schema.
- Quantities are your best professional estimate implied by the brief; when a dimension is given, derive
  the quantity from it (e.g. a 3m x 0.6m counter ≈ 1.8 sqm).
- Respond with ONLY a single valid JSON object matching this exact shape, no prose, no code fences:

${AI_BOQ_JSON_SHAPE}`;

/** Extract the first balanced-looking JSON object from a model text response. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Structure a project brief into a validated BOQ (no prices). Returns the parsed
 * AiBoq or a user-safe error string — never throws to the caller.
 */
export async function structureScopeToBoq(
  brief: string,
): Promise<{ boq: AiBoq } | { error: string }> {
  const text = brief.trim();
  if (!text) return { error: "Describe the project scope first." };
  if (!isAiConfigured()) {
    return { error: "AI is not configured — set ANTHROPIC_API_KEY on the server to enable it." };
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!out) return { error: "AI returned an empty response." };

    return parseAiBoq(extractJson(out)); // validator drops any stray price fields
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: "AI key is invalid — check ANTHROPIC_API_KEY." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { error: "AI is rate-limited right now — try again in a moment." };
    }
    if (err instanceof Anthropic.APIError) {
      return { error: `AI request failed (${err.status ?? "?"}).` };
    }
    return { error: "Could not parse the AI response into a BOQ. Try rephrasing the brief." };
  }
}
