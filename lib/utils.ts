import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names — clsx for conditional joining, tailwind-merge to resolve
 * conflicting Tailwind utilities (last one wins). This is the shadcn/ui `cn`,
 * and it stays backward-compatible with every existing caller.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Normalise a phone number to a dedupe key (PLAN §6.1 — the phone_key that
 * fixed the forked-customer bug in INTERIOR). Strips spaces/punctuation, keeps
 * the last 10 digits (Indian numbers) so +91, 0-prefix and spacing variants of
 * the same number collapse to one key.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return digits || null;
  return digits.slice(-10);
}

/**
 * Normalise an item name to a dedupe key (mirrors phoneKey for the catalogue).
 * Lower-cases, trims, and collapses internal whitespace so "MDF  Board" and
 * "mdf board" collapse to one key — matching Dzylo's "Item name already exists".
 */
export function nameKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalise an optional SKU/code: trim + upper-case, or null when blank. */
export function codeKey(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  return v || null;
}

/** Format ₹ with Indian digit grouping. */
export function inr(value: number | null | undefined): string {
  if (value == null) return "—";
  return "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Format a date as e.g. "20 Aug 2026". */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
