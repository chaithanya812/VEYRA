"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Lock } from "lucide-react";
import {
  CLAUSES,
  VOCAB,
  assemblePrompt,
  defaultClauseIds,
  extractVariables,
  needsReferenceImage,
} from "@/lib/prompt-library-model";
import { Card, StatusChip } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Fill a template's blanks, choose the guard clauses, copy the result.
 *
 * The whole thing is local: `assemblePrompt` is a pure function from the model,
 * so nothing here calls a server action and nothing calls an AI. Copying costs
 * nothing to run, which is why this feature works in production while every
 * other AI surface is dark for want of a key.
 *
 * ⚠ Vocabulary and clause text live in the MODEL, never in this "use client"
 * module — an exported const here would be a client reference on the server,
 * `tsc` passes, `next build` passes, and every request throws (§6 React/Next).
 */

export interface PromptRow {
  id: string;
  name: string;
  prompt: string;
  is_system: boolean;
}

export function PromptComposer({ prompts }: { prompts: PromptRow[] }) {
  const [selectedId, setSelectedId] = useState(prompts[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [clauseIds, setClauseIds] = useState<string[]>(defaultClauseIds());
  const [copied, setCopied] = useState(false);

  const selected = prompts.find((p) => p.id === selectedId) ?? prompts[0];
  const variables = useMemo(
    () => (selected ? extractVariables(selected.prompt) : []),
    [selected],
  );
  const needsRef = selected ? needsReferenceImage(selected.prompt) : false;

  const assembled = useMemo(
    () =>
      selected
        ? assemblePrompt({
            body: selected.prompt,
            values,
            clauseIds,
            needsReference: needsRef,
          })
        : { text: "", missing: [] as string[] },
    [selected, values, clauseIds, needsRef],
  );

  function pick(id: string) {
    setSelectedId(id);
    // A value only means something against the template it was typed for.
    setValues({});
    setCopied(false);
  }

  function toggleClause(id: string) {
    const clause = CLAUSES.find((c) => c.id === id);
    if (clause?.locked) return;
    setClauseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(assembled.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (permissions, insecure origin). Say what to
      // do instead of failing silently.
      setCopied(false);
      alert("Your browser blocked the clipboard — select the prompt text and copy it manually.");
    }
  }

  if (!selected) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* ── Template list ─────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Templates</h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
            {prompts.length} in your library
          </p>
        </div>
        <ul className="max-h-[520px] overflow-y-auto">
          {prompts.map((p) => {
            const vars = extractVariables(p.prompt);
            const active = p.id === selected.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p.id)}
                  aria-current={active}
                  className={cn(
                    "w-full border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors",
                    active
                      ? "bg-[var(--color-red-tint)] shadow-[inset_3px_0_0_var(--color-red)]"
                      : "hover:bg-[var(--color-surface-sunken)]",
                  )}
                >
                  <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                    {p.name}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {vars.slice(0, 3).map((v) => (
                      <span
                        key={v}
                        className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2 py-px font-mono text-[10px] text-[var(--color-ink-secondary)]"
                      >
                        {v}
                      </span>
                    ))}
                    {vars.length > 3 && (
                      <span className="px-1 text-[10px] text-[var(--color-ink-disabled)]">
                        +{vars.length - 3}
                      </span>
                    )}
                    {!p.is_system && <StatusChip tone="green" label="Ours" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ── Composer ──────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              {selected.name}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
              {variables.length === 0
                ? "No blanks to fill"
                : `${variables.length} ${variables.length === 1 ? "blank" : "blanks"} to fill`}
              {needsRef && " · needs a reference photo"}
            </p>
          </div>
          <Button type="button" variant="primary" onClick={copy}>
            {copied ? (
              <>
                <Check className="size-4" /> Copied
              </>
            ) : (
              <>
                <ClipboardCopy className="size-4" /> Copy prompt
              </>
            )}
          </Button>
        </div>

        {/* Blanks */}
        {variables.length > 0 && (
          <div className="grid gap-3 border-b border-[var(--color-border)] p-4 sm:grid-cols-2">
            {variables.map((v) => {
              const options = VOCAB[v] ?? [];
              const value = values[v] ?? "";
              const id = `var_${v}`;
              return (
                <div key={v} className="flex flex-col gap-1">
                  <label
                    htmlFor={id}
                    className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-disabled)]"
                  >
                    {v}
                  </label>
                  {options.length > 0 ? (
                    <select
                      id={id}
                      value={value}
                      onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                      className={cn(
                        "rounded-md border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]",
                        value
                          ? "border-[var(--color-border-strong)]"
                          : "border-[var(--color-amber)]",
                      )}
                    >
                      <option value="">— choose —</option>
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      value={value}
                      placeholder="Type a value"
                      onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                      className={cn(
                        "rounded-md border bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]",
                        value
                          ? "border-[var(--color-border-strong)]"
                          : "border-[var(--color-amber)]",
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Clauses */}
        <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] p-4">
          {CLAUSES.map((c) => {
            const on = clauseIds.includes(c.id) || !!c.locked;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleClause(c.id)}
                aria-pressed={on}
                disabled={c.locked}
                title={
                  c.locked
                    ? "Always on — this is what keeps it an edit of the client's room rather than a new room"
                    : c.text
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  on
                    ? "border-[color-mix(in_srgb,var(--color-info)_35%,white)] bg-[var(--color-info-tint)] text-[var(--color-info)]"
                    : "border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]",
                  c.locked && "cursor-default",
                )}
              >
                {c.locked && <Lock aria-hidden className="size-3" />}
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Output */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-[var(--color-ink-secondary)]">
          <span className="tabular">
            {assembled.text.length} characters
            {assembled.missing.length > 0 &&
              ` · ${assembled.missing.length} blank${assembled.missing.length > 1 ? "s" : ""} left`}
          </span>
          <span className="flex gap-1.5">
            {[
              ["Gemini", "https://gemini.google.com/app"],
              ["ChatGPT", "https://chatgpt.com"],
              ["AI Studio", "https://aistudio.google.com"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-[var(--color-border)] px-2 py-1 hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
              >
                {label} ↗
              </a>
            ))}
          </span>
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-[var(--color-surface-sunken)] px-4 py-3 font-mono text-[11.5px] leading-relaxed text-[var(--color-ink)]">
          {assembled.text}
        </pre>
      </Card>
    </div>
  );
}
