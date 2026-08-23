"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Client-built CSV blob download — the page renders fully without it; the
 * button only serialises rows already fetched on the server.
 */
export function ExportCsvButton({
  filename,
  headers,
  rows,
  disabled,
}: {
  filename: string;
  headers: string[];
  rows: string[][];
  disabled?: boolean;
}) {
  function download() {
    const esc = (v: string) =>
      /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
    const csv = [headers, ...rows]
      .map((r) => r.map(esc).join(","))
      .join("\r\n");
    // BOM so Excel opens the UTF-8 file (₹, Indian names) correctly.
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="secondary" onClick={download} disabled={disabled}>
      <Download className="size-4" /> Export CSV
    </Button>
  );
}
