"use client";

import { useActionState, useState } from "react";
import { Copy, Link2, Mail } from "lucide-react";
import { setVendorPortalShareAction, type FormState } from "../actions";
import { Button } from "@/components/ui/button";

/**
 * Per-vendor portal URL: Create link / Copy link / mailto / Disable.
 * Copy and mailto run in the browser (need window.location.origin). Create
 * and Disable post to the guarded server action. Sending the email is out
 * of scope — mailto: is the most we do.
 */
export function VendorPortalLink({
  rfqId,
  vendorId,
  vendorName,
  rfqTitle,
  shareToken,
  shareEnabled,
  canMint,
}: {
  rfqId: string;
  vendorId: string;
  vendorName: string;
  rfqTitle: string;
  shareToken: string | null;
  shareEnabled: boolean;
  canMint: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setVendorPortalShareAction,
    undefined,
  );
  const [copied, setCopied] = useState(false);

  const path = shareToken ? `/rfq-bid/${shareToken}` : null;

  function absoluteUrl(): string | null {
    if (!path) return null;
    return `${window.location.origin}${path}`;
  }

  async function copyLink() {
    const url = absoluteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this bid link", url);
    }
  }

  function mailLink() {
    const url = absoluteUrl();
    if (!url) return;
    const subject = encodeURIComponent(`Quote request: ${rfqTitle}`);
    const body = encodeURIComponent(
      `Please submit your bid for ${rfqTitle} here:\n${url}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  if (!shareEnabled || !shareToken) {
    if (!canMint) {
      return <span className="text-xs text-[var(--color-ink-disabled)]">—</span>;
    }
    return (
      <form action={formAction} className="inline-flex items-center gap-2">
        <input type="hidden" name="rfqId" value={rfqId} />
        <input type="hidden" name="vendorId" value={vendorId} />
        <input type="hidden" name="enabled" value="true" />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Link2 className="size-3.5" />
          {pending ? "Creating…" : "Create link"}
        </Button>
        {state?.error && (
          <span className="text-xs text-[var(--color-red)]">{state.error}</span>
        )}
      </form>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="rfqId" value={rfqId} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-ink)] hover:underline"
        aria-label={`Copy bid link for ${vendorName}`}
      >
        <Copy className="size-3.5" />
        {copied ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        onClick={mailLink}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-ink-secondary)] hover:underline"
        aria-label={`Email bid link to ${vendorName}`}
      >
        <Mail className="size-3.5" />
        Email
      </button>
      <Button
        type="submit"
        name="enabled"
        value="false"
        variant="danger"
        size="sm"
        disabled={pending}
      >
        {pending ? "Disabling…" : "Disable"}
      </Button>
      {state?.error && (
        <span className="text-xs text-[var(--color-red)]">{state.error}</span>
      )}
    </form>
  );
}
