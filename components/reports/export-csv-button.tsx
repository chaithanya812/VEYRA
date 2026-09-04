"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCsv, describeExport } from "@/lib/saved-views-model";

/**
 * Client-built CSV blob download — the page renders fully without it; the
 * button only serialises rows already fetched on the server.
 *
 * Part 4 Unit 2 extended this one component rather than writing a second
 * exporter, and added three things:
 *
 * 1. **IT SAYS HOW MANY ROWS IT WROTE**, with the columns and the applied
 *    filter, before you press it and again after. An export that silently
 *    ignores the filter is worse than no export, and a count with no
 *    denominator is untrustworthy (§11) — so the button carries both.
 * 2. **THE SERIALISER LIVES IN THE PURE MODEL** (`buildCsv` / `csvCell`),
 *    matching `lib/hr-model.ts::attendanceCsv`'s convention rather than
 *    inventing a second one. ₹ figures and dates arrive already formatted in
 *    Indian style from the screen, so the file reads exactly like the table.
 * 3. **`onExported` METERS THE EXPORT SERVER-SIDE.** It re-checks the screen's
 *    own `can()` capability, so the export cannot become a second read path
 *    that bypasses permissions, and it appends to the `exports` usage metric.
 *    The download is NOT blocked on it — the rows are already in the browser,
 *    so pretending otherwise would be theatre.
 */
export function ExportCsvButton({
  filename,
  headers,
  rows,
  disabled,
  filterChip,
  onExported,
}: {
  filename: string;
  headers: string[];
  rows: string[][];
  disabled?: boolean;
  /** The screen's applied-filter chip, in the screen's own words. */
  filterChip?: string | null;
  /** Server action that re-checks `can()` and meters the export. */
  onExported?: (rowCount: number) => Promise<{ error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [wrote, setWrote] = useState<string | null>(null);
  const summary = describeExport(rows.length, headers.length, filterChip);

  function download() {
    const csv = buildCsv(headers, rows);
    // BOM so Excel opens the UTF-8 file (₹, Indian names) correctly.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setWrote(summary);
    if (onExported) start(() => void onExported(rows.length));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        onClick={download}
        disabled={disabled || pending}
        title={`Exports ${summary} — exactly what is on screen`}
        data-testid="export-csv"
      >
        <Download className="size-4" /> Export CSV
      </Button>
      <span
        data-testid="export-summary"
        className="text-[12px] text-[var(--color-ink-secondary)]"
      >
        {wrote ? `Wrote ${wrote}` : summary}
      </span>
    </div>
  );
}
