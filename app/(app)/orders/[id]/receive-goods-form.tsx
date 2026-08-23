"use client";

import { useActionState, useEffect, useState } from "react";
import { PackageCheck } from "lucide-react";
import { recordReceiptAction, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Receive goods against a PO (PROC-DELIV-001): enter how much of each line
 * actually arrived — partial receipts welcome; the fulfilment state derives
 * from received-vs-ordered totals on the server. A red border flags an
 * invalid (negative/non-numeric) entry.
 */

export interface ReceivableLine {
  id: string;
  item_name: string;
  uom: string | null;
  qty_ordered: number;
  qty_outstanding: number;
}

export function ReceiveGoodsForm({
  poId,
  disabled,
  lines,
}: {
  poId: string;
  disabled?: boolean;
  lines: ReceivableLine[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    recordReceiptAction,
    undefined,
  );
  const [qtys, setQtys] = useState<Record<string, string>>({});

  // A clean result clears the grid; an error keeps what was typed.
  useEffect(() => {
    if (!pending && state === undefined) setQtys({});
  }, [pending, state]);

  const invalid = (line: ReceivableLine) => {
    const v = (qtys[line.id] ?? "").trim();
    if (!v) return false;
    const n = Number(v);
    return Number.isNaN(n) || n < 0;
  };

  const anyEntry = Object.values(qtys).some((v) => Number(v) > 0);

  if (disabled) {
    return (
      <p className="text-sm text-[var(--color-ink-secondary)]">
        This order is cancelled — goods cannot be received against it.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="poId" value={poId} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          lines.map((l) => ({
            po_line_id: l.id,
            qty_received: Number(qtys[l.id]) || 0,
          })),
        )}
      />

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_88px_110px] items-end gap-2 px-0.5 text-xs font-medium text-[var(--color-ink-secondary)]">
          <span>Item</span>
          <span className="text-right">Outstanding</span>
          <span>Qty received</span>
        </div>
        {lines.map((l) => (
          <div
            key={l.id}
            className="grid grid-cols-[minmax(0,1fr)_88px_110px] items-center gap-2"
          >
            <p className="truncate text-sm font-medium text-[var(--color-ink)]">
              {l.item_name}
              {l.uom ? (
                <span className="ml-1.5 text-xs font-normal text-[var(--color-ink-secondary)]">
                  ({l.uom})
                </span>
              ) : null}
            </p>
            <p className="text-right text-sm tabular text-[var(--color-ink-secondary)]">
              {l.qty_outstanding}
            </p>
            <Input
              value={qtys[l.id] ?? ""}
              onChange={(e) => setQtys((q) => ({ ...q, [l.id]: e.target.value }))}
              placeholder="0"
              inputMode="decimal"
              aria-label={`Qty received — ${l.item_name}`}
              className={cn(
                "h-9 text-right tabular",
                invalid(l) ? "border-[var(--color-red)]" : "",
              )}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Mode" htmlFor="mode">
          <Select id="mode" name="mode" defaultValue="admin_override" className="h-10">
            <option value="admin_override">Logged by us</option>
            <option value="vendor">Confirmed by vendor</option>
          </Select>
        </Field>
        <Field label="Note" htmlFor="note">
          <Input id="note" name="note" placeholder="Optional — e.g. challan 4412" />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-ink-secondary)]">
          Partial quantities are fine — the order state derives from what has arrived.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending || !anyEntry}
        >
          <PackageCheck className="size-4" />
          {pending ? "Saving…" : "Receive goods"}
        </Button>
      </div>

      {state?.error && (
        <p className="text-xs text-[var(--color-red)]">{state.error}</p>
      )}
    </form>
  );
}
