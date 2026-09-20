"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PoPdfData, PoPdfTemplateConfig } from "@/lib/po-pdf";

/**
 * One-click purchase-order PDF. jsPDF is code-split behind the click so it
 * never weighs down the initial page load — the same split as
 * DownloadQuoteButton. Pass `previewTemplate` (Settings) to render the
 * shared sample payload through the same generatePoPdf.
 */
export function DownloadPoButton({
  data,
  previewTemplate,
  variant = "secondary",
  label = "Download PDF",
}: {
  data?: PoPdfData;
  previewTemplate?: PoPdfTemplateConfig;
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { generatePoPdf, samplePoPdfData, DEFAULT_PO_TEMPLATE } = await import(
            "@/lib/po-pdf"
          );
          generatePoPdf(data ?? samplePoPdfData(previewTemplate ?? DEFAULT_PO_TEMPLATE));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {label}
    </Button>
  );
}
