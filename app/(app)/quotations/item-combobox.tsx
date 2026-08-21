"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronsUpDown } from "lucide-react";
import { searchItemsAction } from "./actions";
import type { ItemRef } from "@/lib/items-model";
import { typeLabel } from "@/lib/items-ui";
import { inr } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Catalogue autocomplete — server-searches the items master (FEATURE-REGISTER
 * PROC-MR-003: a line is a reference to a catalogue Item). Selecting fills the
 * line's rate / UOM / tax / HSN from the item so prices come from config.
 */
export function ItemCombobox({
  onSelect,
}: {
  onSelect: (item: ItemRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemRef[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const id = ++seq.current;
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchItemsAction(q);
      if (id === seq.current) {
        setResults(rows);
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  const empty = useMemo(
    () => (loading ? "Searching…" : query.trim() ? "No matching items." : "Type to search the catalogue."),
    [loading, query],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)]"
        >
          <span className="inline-flex items-center gap-2">
            <Search className="size-4" /> Pick from catalogue
          </span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search name or code…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            {results.length > 0 && (
              <CommandGroup>
                {results.map((it) => (
                  <CommandItem
                    key={it.id}
                    value={it.id}
                    onSelect={() => {
                      onSelect(it);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium text-[var(--color-ink)]">{it.name}</span>
                      <span className="text-xs text-[var(--color-ink-secondary)]">
                        {it.code ? `${it.code} · ` : ""}
                        {typeLabel[it.type]}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular text-[var(--color-ink-secondary)]">
                      {it.base_rate == null ? "—" : inr(it.base_rate)} · {it.tax_rate}%
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
