import { enterBidAction } from "../actions";
import {
  BidForm,
  type BidFormItem,
} from "@/components/bid-line-fields";

/**
 * Proxy bid entry (PROC-RFQ-004): the purchase team types a vendor's quote on
 * their behalf. The line grid lives in components/bid-line-fields.tsx — this
 * file is the internal host (the <details> wrapper). Rates are human-entered
 * CONFIG — landed totals are computed by the engine, never here and never by
 * an LLM. Unquoted items are simply left blank.
 */

export type { BidFormItem };

export function EnterBidForm({
  rfqId,
  vendorId,
  vendorName,
  items,
  defaultOpen = false,
}: {
  rfqId: string;
  vendorId: string;
  vendorName: string;
  items: BidFormItem[];
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
        Enter bid — {vendorName}
      </summary>
      <div className="border-t border-[var(--color-border)] p-4">
        <BidForm
          action={enterBidAction}
          hidden={{ rfqId, vendorId }}
          items={items}
          idPrefix={vendorId}
          submitLabel="Save bid"
          footnote="Saving marks the vendor “submitted”. Re-entering a bid adds a newer version — history is kept."
        />
      </div>
    </details>
  );
}
