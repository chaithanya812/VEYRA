import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The product's AI backend, behind one seam.
 *
 * REQ-01 originally pinned the product to Claude. The owner has since chosen
 * Gemini, so the provider is now a configuration value rather than a code
 * decision: set `AI_PROVIDER` to "gemini" or "anthropic" and everything above
 * this file is unchanged. Switching back, or running a different model, is an
 * env edit and a redeploy.
 *
 *   AI_PROVIDER          gemini | anthropic          (default: gemini)
 *   AI_GEMINI_API_KEY    Google AI Studio key
 *   AI_GEMINI_MODEL      e.g. gemini-3.5-flash-lite
 *   ANTHROPIC_API_KEY    Anthropic key
 *   ANTHROPIC_MODEL      e.g. claude-opus-5
 *
 * ⛔ WHAT THIS SEAM DOES NOT DO: produce money. No caller may ask a model for a
 * price, rate, cost or amount. Every prompt in this codebase asks for structure
 * — rooms, items, quantities, units — and a deterministic engine prices it
 * afterwards. That rule survives the provider change intact (HARD RULE 2).
 */

export const AI_PROVIDERS = ["gemini", "anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiAttachment {
  /** e.g. "image/png", "application/pdf" */
  mimeType: string;
  /** Base64 payload, no data: prefix. */
  dataBase64: string;
  name?: string;
}

export interface AiRequest {
  system: string;
  user: string;
  attachments?: AiAttachment[];
  maxTokens?: number;
  /** Ask the provider for raw JSON where it supports doing so. */
  json?: boolean;
}

export type AiResult = { text: string } | { error: string };

const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";

/** Which backend is configured right now. */
export function activeProvider(): AiProvider {
  const v = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  return (AI_PROVIDERS as readonly string[]).includes(v) ? (v as AiProvider) : "gemini";
}

export function activeModel(): string {
  return activeProvider() === "gemini"
    ? (process.env.AI_GEMINI_MODEL || GEMINI_DEFAULT_MODEL)
    : (process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL);
}

function geminiKey(): string | undefined {
  // AI_GEMINI_API_KEY is the product key; GEMINI_API_KEY belongs to the
  // competitor-video tooling and is only a fallback so a single-key setup works.
  return process.env.AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
}

/** True when the active provider has a usable key. */
export function isAiConfigured(): boolean {
  return activeProvider() === "gemini" ? !!geminiKey() : !!process.env.ANTHROPIC_API_KEY;
}

/** A user-facing description of the backend, for the UI's status line. */
export function aiStatus(): { configured: boolean; provider: AiProvider; model: string } {
  return { configured: isAiConfigured(), provider: activeProvider(), model: activeModel() };
}

/* ── Gemini ───────────────────────────────────────────────────────────────── */

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

async function callGemini(req: AiRequest): Promise<AiResult> {
  const key = geminiKey();
  if (!key) {
    return { error: "AI is not configured — set AI_GEMINI_API_KEY on the server." };
  }
  const model = activeModel();

  const parts: GeminiPart[] = [{ text: req.user }];
  for (const a of req.attachments ?? []) {
    parts.push({ inline_data: { mime_type: a.mimeType, data: a.dataBase64 } });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 8000,
            temperature: 0.2,
            ...(req.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || res.status === 403) {
        return { error: "AI key was rejected — check AI_GEMINI_API_KEY." };
      }
      if (res.status === 429) {
        return { error: "AI is rate-limited right now — try again in a moment." };
      }
      if (res.status === 404) {
        return { error: `Model "${model}" is not available on this key.` };
      }
      return { error: `AI request failed (${res.status}). ${body.slice(0, 160)}` };
    }

    const json = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
      promptFeedback?: { blockReason?: string };
    };

    if (json.promptFeedback?.blockReason) {
      return { error: `The AI declined that request (${json.promptFeedback.blockReason}).` };
    }
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) {
      const reason = json.candidates?.[0]?.finishReason;
      return {
        error:
          reason === "MAX_TOKENS"
            ? "The AI ran out of room before finishing — try a shorter brief."
            : "AI returned an empty response.",
      };
    }
    return { text };
  } catch {
    return { error: "Could not reach the AI service. Check the server's connectivity." };
  }
}

/* ── Anthropic ────────────────────────────────────────────────────────────── */

async function callAnthropic(req: AiRequest): Promise<AiResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "AI is not configured — set ANTHROPIC_API_KEY on the server." };
  }

  try {
    const client = new Anthropic();
    const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: req.user }];
    for (const a of req.attachments ?? []) {
      if (a.mimeType.startsWith("image/")) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: a.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: a.dataBase64,
          },
        });
      } else if (a.mimeType === "application/pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: a.dataBase64 },
        });
      }
    }

    const response = await client.messages.create({
      model: activeModel(),
      max_tokens: req.maxTokens ?? 8000,
      system: req.system,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text ? { text } : { error: "AI returned an empty response." };
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
    return { error: "Could not reach the AI service." };
  }
}

/**
 * Send one request to whichever backend is configured. Never throws — callers
 * get either text or a message safe to show a user.
 */
export async function generate(req: AiRequest): Promise<AiResult> {
  return activeProvider() === "gemini" ? callGemini(req) : callAnthropic(req);
}

/** Pull the first balanced-looking JSON object out of a model response. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}
