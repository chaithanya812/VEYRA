"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { generateBoqAction, type AiBoqState } from "./ai-boq-actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * AI prompt-to-BOQ entry point (REQ-01). The user describes the project; Claude
 * structures the scope into rooms → items with qty/uom (never a price) and the
 * lines are appended at ₹0 for the user/engine to rate. If the server has no
 * ANTHROPIC_API_KEY the action returns a clear "not configured" message.
 */
export function AiBoqPanel({ quotationId }: { quotationId: string }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [state, setState] = useState<AiBoqState>(undefined);
  const [pending, start] = useTransition();

  function submit() {
    const fd = new FormData();
    fd.set("quotationId", quotationId);
    fd.set("brief", brief);
    start(async () => {
      const res = await generateBoqAction(undefined, fd);
      setState(res);
      if (res && !res.error && res.count) {
        setOpen(false);
        setBrief("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setState(undefined); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Sparkles className="size-4" /> Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Generate a BOQ with AI</DialogTitle>
          <DialogDescription>
            Describe the project — rooms, sizes, finishes. AI drafts the scope items and
            quantities; you set the rates (AI never prices).
          </DialogDescription>
        </DialogHeader>

        <Field label="Project brief" required>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder={"e.g. 2BHK flat. Modular kitchen 10x8 ft with tall units. Wardrobes in both bedrooms (7x8 ft each). False ceiling in living + dining."}
          />
        </Field>

        {state?.error && <p className="text-sm text-[var(--color-red)]">{state.error}</p>}
        {state?.count === 0 && !state.error && (
          <p className="text-sm text-[var(--color-ink-secondary)]">No lines were generated — try a more specific brief.</p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={pending || !brief.trim()}>
            {pending ? "Generating…" : "Generate BOQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
