"use client";

import { useRef, useState, useTransition } from "react";
import { Bookmark, Paperclip, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PromptTemplate } from "@/lib/data/quotation-studio";
import {
  deletePromptAction,
  generateBoqAction,
  savePromptAction,
  type AiBoqState,
} from "./ai-boq-actions";

/**
 * The AI quotation generator.
 *
 * Three things the owner asked for, all here: worked prompt examples you can
 * start from, a library where you save your own, and attachments — because the
 * best brief is often a floor plan or the client's own list rather than a
 * paragraph someone retypes.
 *
 * The line under the button is the honest part: the AI writes the SCOPE, and
 * every rate stays yours. Lines land at ₹0 with your default GST and the
 * engine prices them.
 */
export function AiBoqPanel({
  quotationId,
  prompts,
  context,
  configured,
  provider,
  model,
}: {
  quotationId: string;
  prompts: PromptTemplate[];
  /** Scope carried over from the lead — rooms, theme, layout size. */
  context?: string | null;
  configured: boolean;
  provider: string;
  model: string;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<AiBoqState>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setState(undefined);
    setSaving(false);
    setSaveName("");
  }

  function submit() {
    const fd = new FormData();
    fd.set("quotationId", quotationId);
    fd.set("brief", brief);
    if (context) fd.set("context", context);
    for (const f of files) fd.append("attachments", f);

    start(async () => {
      const res = await generateBoqAction(undefined, fd);
      setState(res);
      if (res?.count) {
        setBrief("");
        setFiles([]);
        if (!res.error) setOpen(false);
      }
    });
  }

  function saveCurrentPrompt() {
    const fd = new FormData();
    fd.set("name", saveName);
    fd.set("prompt", brief);
    fd.set("quotationId", quotationId);
    start(async () => {
      const res = await savePromptAction(undefined, fd);
      if (res?.error) setState({ error: res.error });
      else {
        setSaving(false);
        setSaveName("");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Sparkles className="size-4" /> Generate with AI
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Generate a BOQ with AI</DialogTitle>
          <DialogDescription>
            Describe the project, or attach the floor plan and the client&apos;s list.
            The AI drafts the rooms, items and quantities — you set every rate.
            It never produces a price.
          </DialogDescription>
        </DialogHeader>

        {!configured ? (
          <p className="rounded-md border border-[color-mix(in_srgb,var(--color-amber)_30%,white)] bg-[var(--color-amber-tint)] px-3 py-2 text-[13px] text-[var(--color-amber)]">
            AI is not configured on this server yet. Add the provider key and redeploy.
          </p>
        ) : (
          <p className="text-xs text-[var(--color-ink-secondary)]">
            Using {provider} · {model}
          </p>
        )}

        {/* Start from something. Yours or the examples. */}
        {prompts.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
              Start from a saved prompt
            </p>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
              {prompts.map((p) => (
                <div key={p.id} className="group flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setBrief(p.prompt)}
                    className={cn(
                      "flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-[13px] transition-colors",
                      "hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-sunken)]",
                    )}
                  >
                    <span className="font-medium text-[var(--color-ink)]">{p.name}</span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-[var(--color-ink-secondary)]">
                      {p.prompt}
                    </span>
                  </button>
                  <form action={deletePromptAction} className="pt-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      title="Remove from library"
                      className="rounded p-1 text-[var(--color-ink-disabled)] opacity-0 transition-opacity hover:text-[var(--color-red)] group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label="Project brief" required>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={6}
            maxLength={6000}
            placeholder="2BHK flat, 1100 sq ft. Modular kitchen 10x8 ft with tall units, acrylic finish. Wardrobes in both bedrooms. False ceiling in living and dining with cove lighting. Paint throughout."
          />
        </Field>
        <p className="-mt-2 text-right text-xs text-[var(--color-ink-secondary)] tabular">
          {brief.length}/6000
        </p>

        {/* Attachments — a plan says more than a paragraph. */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-3.5" /> Attach plan or list
            </Button>
            <span className="text-xs text-[var(--color-ink-secondary)]">
              Images or PDF · up to 4 files · 4 MB each
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []).slice(0, 4));
              e.target.value = "";
            }}
          />
          {files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2.5 py-1 text-xs text-[var(--color-ink-secondary)]"
                >
                  {f.name}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="hover:text-[var(--color-red)]"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Save this brief for next time. */}
        {brief.trim().length > 20 && (
          <div className="rounded-md border border-[var(--color-border)] p-3">
            {saving ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-44 flex-1">
                  <Input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Name this prompt"
                    className="h-8 text-[13px]"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending || !saveName.trim()}
                  onClick={saveCurrentPrompt}
                >
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSaving(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSaving(true)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
              >
                <Bookmark className="size-3.5" /> Save this brief to your prompt library
              </button>
            )}
          </div>
        )}

        {state?.error && (
          <p role="alert" className="text-sm text-[var(--color-red)]">
            {state.error}
          </p>
        )}
        {state?.count === 0 && !state.error && (
          <p className="text-sm text-[var(--color-ink-secondary)]">
            No lines were generated — try a more specific brief.
          </p>
        )}
        {!!state?.count && state.count > 0 && (
          <p className="text-sm text-[var(--color-green)]">
            Added {state.count} line{state.count === 1 ? "" : "s"} across {state.rooms} room
            {state.rooms === 1 ? "" : "s"}, all at ₹0 — set your rates next.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={submit}
            disabled={pending || !configured || !brief.trim()}
          >
            {pending ? "Generating…" : "Generate BOQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
