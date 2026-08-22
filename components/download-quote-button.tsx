"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuotationPdfData } from "@/lib/quotations-pdf";

/**
 * One-click customer quotation PDF. jsPDF is code-split behind the click so it
 * never weighs down the initial page load (matters on the public /q/<token>
 * page, which a customer opens on mobile).
 */
export function DownloadQuoteButton({
  data,
  variant = "secondary",
  label = "Download PDF",
}: {
  data: QuotationPdfData;
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
          const { generateQuotationPdf } = await import("@/lib/quotations-pdf");
          generateQuotationPdf(data);
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
