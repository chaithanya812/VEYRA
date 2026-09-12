"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError } from "../../dashboard/workspace-ui";
import { addVendorsToRfqAction } from "../actions";
import { nameKey } from "@/lib/utils";

/**
 * Invite more vendors to an existing RFQ (PROC-04). Mirrors the create form's
 * checkbox multi-select, but lists ONLY active vendors not already invited —
 * the server page filters the candidates, so double-invitation is impossible
 * from the UI as well as in the data module.
 *
 * This is a client component, so `revalidatePath` in the action does NOT
 * re-render the page it sits on (Part 6 · React/Next). On success it closes and
 * calls `router.refresh()`, which is what actually pulls the new vendor rows in.
 */
export function AddVendorsDialog({
  rfqId,
  candidates,
}: {
  rfqId: string;
  candidates: { id: string; name: string; category: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(fd: FormData) {
    fd.set("vendor_ids", JSON.stringify([...selected]));
    setPending(true);
    const r = await addVendorsToRfqAction(undefined, fd);
    setPending(false);
    if (r?.error) {
      setError(r.error);
      return;
    }
    setError(undefined);
    setSelected(new Set());
    setQuery("");
    setOpen(false);
    router.refresh();
  }

  const q = nameKey(query);
  const filtered = q
    ? candidates.filter((c) => nameKey(c.name).includes(q))
    : candidates;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <UserPlus className="size-4" /> Add vendors
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite more vendors</DialogTitle>
          <DialogDescription>
            Only active vendors not already invited are listed. Their quotes join
            the comparison as they arrive.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={rfqId} />
          <FormError error={error} />

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter vendors"
            placeholder="Filter vendors…"
            autoComplete="off"
            className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)] outline-none focus:border-[var(--color-red)]"
          />

          <div className="grid max-h-64 grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto sm:grid-cols-2">
            {filtered.map((v) => (
              <label
                key={v.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-sunken)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  onChange={() => toggle(v.id)}
                  className="size-4 accent-[var(--color-ink)]"
                />
                <span className="truncate font-medium text-[var(--color-ink)]">
                  {v.name}
                </span>
                {v.category && (
                  <span className="shrink-0 text-xs text-[var(--color-ink-secondary)]">
                    {v.category}
                  </span>
                )}
              </label>
            ))}
          </div>

          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={pending || selected.size === 0}
            >
              {pending
                ? "Inviting…"
                : `Invite${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
