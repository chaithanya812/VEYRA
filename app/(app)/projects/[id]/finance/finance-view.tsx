"use client";

import { useActionState, useCallback, useState } from "react";
import { AuditTimeline, type AuditEntry } from "@/components/ui/audit-timeline";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, FileText, History, IndianRupee, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MultiValueCell } from "@/components/ui/patterns";
import {
  StatTile,
  TabBar,
  FormError,
  SubmitButton,
  type TabDef,
} from "../../../dashboard/workspace-ui";
import { ScheduleEditor } from "./schedule-editor";
import type { ContractWithDetail, ProjectFinancialPlan } from "@/lib/data/finance";
import {
  addContractAction,
  deleteContractAction,
  recordPaymentAction,
  type FinState,
} from "./actions";
import { cn, fmtDate, inr } from "@/lib/utils";

/**
 * Financial Planning (PLAN-V4 §9.3, frames `105238` / `105325`).
 *
 * **Inflow is money the client owes us; Outflow is money we owe vendors.** They
 * are the same table with `source` flipped, and the same arithmetic seen from
 * opposite ends — which is why one `rollupContract` serves both and there is no
 * second implementation to drift.
 *
 * The header band is entirely derived. Nothing on this screen is a stored
 * total, because a stored total is wrong the moment someone ticks Work Done.
 */
const initial: FinState = undefined;

const TABS: TabDef[] = [
  { id: "inflow", label: "Inflow", icon: <ArrowDownRight className="size-4" /> },
  { id: "outflow", label: "Outflow", icon: <ArrowUpRight className="size-4" /> },
  { id: "documents", label: "Documents", icon: <FileText className="size-4" /> },
  { id: "audit", label: "Audit", icon: <History className="size-4" /> },
];

export function FinanceView({
  projectId,
  plan,
  initialTab,
  audit,
}: {
  projectId: string;
  plan: ProjectFinancialPlan;
  initialTab: string;
  /** `audit_events` for this project's contracts and milestones (0035). */
  audit: AuditEntry[];
}) {
  const [tab, setTab] = useState(
    TABS.some((t) => t.id === initialTab) ? initialTab : "inflow",
  );

  const select = useCallback((id: string) => {
    setTab(id);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const s = plan.summary;

  return (
    <>
      {/* ── The band: where this project's money stands right now ── */}
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Inflow · what the client owes
          </h2>
          {/*
            `Contracted` and `Billed` used to share one label, "Total
            receivables", and meant two different things here and on the project
            Summary band. Settled 2026-09-04 (§10.8), exactly as the payables
            side below: keep both figures, name them apart, print what each is.
          */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Figure label="Project value" value={s.projectValue} />
            <Figure
              label="Contracted"
              value={s.contracted}
              hint="Σ client contracts"
            />
            <Figure
              label="Billed"
              value={s.receivableBilled}
              hint="Client work signed off"
            />
            <Figure label="Funds received" value={s.funds} tone="green" />
            <Figure
              label="Receivable dues"
              value={s.receivableDues}
              tone="amber"
              hint="Billed less received"
            />
          </div>

          <h2 className="mb-3 mt-5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Outflow · what we owe vendors
          </h2>
          {/*
            `Committed` and `Billed` used to share one label, "Total payables",
            and meant two different things here and on Vendor Projects. Settled
            2026-09-04: keep both figures, name them apart, and print what each
            one is rather than expecting the reader to know.
          */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Figure label="Estimated expenses" value={s.estimatedExpenses} />
            <Figure label="Disbursed" value={s.disbursed} />
            <Figure
              label="Committed"
              value={s.committed}
              hint="Agreed less disbursed"
            />
            <Figure
              label="Billed"
              value={s.billed}
              hint="Work signed off"
            />
            <Figure
              label="Dues"
              value={s.payableDues}
              tone="amber"
              hint="Billed less disbursed"
            />
          </div>
        </Card>

        {/*
          NOT TileGrid here. That grid is lg:grid-cols-4, written for the
          dashboard's four tiles; this band has TWO, inside an already narrow
          minmax(0,2fr) column. Four columns for two tiles left each figure
          about 45px of a 140px number, so "Cash flow ₹5,60,000" rendered as
          "₹5,6" — a truncated rupee figure on the finance screen, which is the
          one place a half-shown number is indistinguishable from a real one.
        */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            hero
            label="Cash flow"
            value={inr(s.cashFlow)}
            hint="Funds received less disbursed"
            tone={s.cashFlow < 0 ? "negative" : "positive"}
            icon={<Wallet className="size-4" />}
          />
          <StatTile
            label="Expected P&L"
            value={inr(s.expectedPnl)}
            hint="Project value less estimated expenses"
            tone={s.expectedPnl < 0 ? "negative" : "info"}
            icon={<IndianRupee className="size-4" />}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabBar tabs={TABS} active={tab} onSelect={select} />
        {tab !== "documents" && tab !== "audit" && (
          <AddContractDialog
            projectId={projectId}
            source={tab === "outflow" ? "vendor" : "client"}
            vendors={plan.vendors}
            categories={plan.categories}
          />
        )}
      </div>

      {tab === "inflow" && (
        <ContractList
          projectId={projectId}
          contracts={plan.inflow}
          source="client"
          empty="No client contract yet. A contract is what turns a project value into a payment schedule the client can be invoiced against."
        />
      )}

      {tab === "outflow" && (
        <ContractList
          projectId={projectId}
          contracts={plan.outflow}
          source="vendor"
          empty="No vendor contract yet. Add one per vendor — and keep an unlisted one for miscellaneous spend."
        />
      )}

      {tab === "documents" && <DocumentList projectId={projectId} plan={plan} />}

      {tab === "audit" && (
        <Card className="p-4">
          <AuditTimeline
            entries={audit}
            emptyTitle="No recorded changes yet"
            emptyDescription="Marking a milestone's work done, or deleting a contract, is recorded here with who did it and what moved. The ledger starts from when it was switched on — it does not reconstruct earlier history."
          />
        </Card>
      )}
    </>
  );
}

/* ── Figures ──────────────────────────────────────────────────────────────── */

function Figure({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber";
  /** The two numbers a difference came from, printed beside it (§11). */
  hint?: string;
}) {
  // A negative figure is the one worth noticing, so it gets red — and it also
  // keeps its minus sign, which is the label a colour-blind reader relies on.
  const negative = value < 0;
  return (
    <div>
      <p className="text-[11px] text-[var(--color-ink-secondary)]">{label}</p>
      <p
        className={cn(
          "tabular text-[15px] font-semibold",
          negative
            ? "text-[var(--color-red)]"
            : tone === "green"
              ? "text-[var(--color-green)]"
              : tone === "amber"
                ? "text-[var(--color-amber)]"
                : "text-[var(--color-ink)]",
        )}
      >
        {inr(value)}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-tight text-[var(--color-ink-secondary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ── Contracts ────────────────────────────────────────────────────────────── */

function ContractList({
  projectId,
  contracts,
  source,
  empty,
}: {
  projectId: string;
  contracts: ContractWithDetail[];
  source: "client" | "vendor";
  empty: string;
}) {
  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="size-8" />}
        title={source === "client" ? "No client contracts yet" : "No vendor contracts yet"}
        description={empty}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {contracts.map((c) => (
        <ContractCard key={c.contract.id} projectId={projectId} detail={c} source={source} />
      ))}
    </div>
  );
}

function ContractCard({
  projectId,
  detail,
  source,
}: {
  projectId: string;
  detail: ContractWithDetail;
  source: "client" | "vendor";
}) {
  const { contract, rollup } = detail;
  const client = source === "client";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">
            {contract.name}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-ink-secondary)]">
            <span className="tabular">{inr(contract.amount)}</span>
            {!client && (
              <>
                <span>·</span>
                <span
                  className={cn(
                    detail.vendorName ? "" : "italic text-[var(--color-ink-disabled)]",
                  )}
                  title={
                    detail.vendorName
                      ? undefined
                      : "Ad-hoc spend that belongs to no vendor — a real state, kept on purpose"
                  }
                >
                  {detail.vendorName ?? "Unlisted vendor / miscellaneous"}
                </span>
              </>
            )}
            {detail.categories.length > 0 && (
              <>
                <span>·</span>
                <MultiValueCell values={detail.categories} max={2} />
              </>
            )}
          </p>
          {contract.notes && (
            <p className="mt-1 text-[12px] text-[var(--color-ink-secondary)]">
              {contract.notes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-4">
            <Figure
              label={client ? "Funds received" : "Disbursed"}
              value={rollup.settled}
              tone="green"
            />
            {/* Same words as the band above, for the same arithmetic — narrower
                scope, one contract instead of the project. A card that said
                "Total receivables ₹12,60,000" under a band reading "Billed
                ₹12,60,000" is the one-label-two-meanings bug in miniature, on
                a single screen.

                These deliberately no longer branch on client/vendor. §10.1
                settled the outflow side and §10.8 settled the inflow side on
                the SAME words, so Billed and Dues mean the same thing on both
                — and the card's own heading already says which side it is. */}
            <Figure label="Billed" value={rollup.billable} />
            <Figure label="Dues" value={rollup.due} tone="amber" />
          </div>
          <div className="flex items-center gap-1">
            <RecordPaymentDialog
              projectId={projectId}
              detail={detail}
              source={source}
            />
            <form action={deleteContractAction}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="id" value={contract.id} />
              <Button type="submit" variant="ghost" size="sm" title="Delete contract">
                <Trash2 className="size-3.5" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <ScheduleEditor
        projectId={projectId}
        contractId={contract.id}
        contractAmount={Number(contract.amount) || 0}
        milestones={detail.milestones}
      />

      {detail.payments.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
            Cash recorded
          </h4>
          <ul className="flex flex-col gap-1 text-[12px]">
            {detail.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span className="text-[var(--color-ink)]">
                  {fmtDate(p.paid_on ?? p.created_at)}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.note ? ` — ${p.note}` : ""}
                </span>
                <span
                  className={cn(
                    "shrink-0 tabular font-medium",
                    client ? "text-[var(--color-green)]" : "text-[var(--color-ink)]",
                  )}
                >
                  {client ? "+" : "−"}
                  {inr(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────────────────── */

function AddContractDialog({
  projectId,
  source,
  vendors,
  categories,
}: {
  projectId: string;
  source: "client" | "vendor";
  vendors: { id: string; name: string }[];
  categories: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, add] = useActionState(addContractAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="size-4" /> {source === "vendor" ? "Add vendor" : "Add contract"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {source === "vendor" ? "New vendor contract" : "New client contract"}
          </DialogTitle>
          <DialogDescription>
            {source === "vendor"
              ? "What we have agreed to pay a vendor. Leave the vendor blank for miscellaneous spend — that row is deliberate."
              : "What the client has agreed to pay. The payment schedule goes underneath it."}
          </DialogDescription>
        </DialogHeader>
        <form action={add} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="source" value={source} />
          <FormError error={state?.error} />

          <Field label="Name" htmlFor="ct_name" required>
            <Input
              id="ct_name"
              name="name"
              placeholder={source === "vendor" ? "Civil works" : "Civil"}
              required
            />
          </Field>

          <Field label="Agreed amount" htmlFor="ct_amount" required>
            <Input
              id="ct_amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              required
              className="tabular"
            />
          </Field>

          {source === "vendor" && (
            <>
              <Field
                label="Vendor"
                htmlFor="ct_vendor"
                hint="Leave blank for unlisted / miscellaneous spend."
              >
                <Select id="ct_vendor" name="vendor_id" defaultValue="">
                  <option value="">Unlisted vendor / miscellaneous</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium text-[var(--color-ink-secondary)]">
                  Categories
                </legend>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <label
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[12px] text-[var(--color-ink)]"
                    >
                      <input
                        type="checkbox"
                        name="categories"
                        value={c}
                        className="size-3.5 accent-[var(--color-red)]"
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          <Field label="Notes" htmlFor="ct_notes">
            <Textarea id="ct_notes" name="notes" rows={2} />
          </Field>

          <div>
            <SubmitButton pendingLabel="Adding…">Add contract</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({
  projectId,
  detail,
  source,
}: {
  projectId: string;
  detail: ContractWithDetail;
  source: "client" | "vendor";
}) {
  const [open, setOpen] = useState(false);
  const [state, record] = useActionState(recordPaymentAction, initial);
  if (state?.ok && open) setTimeout(() => setOpen(false), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          {source === "client" ? "Record receipt" : "Record payment"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {source === "client" ? "Money received" : "Money paid"} — {detail.contract.name}
          </DialogTitle>
          <DialogDescription>
            Recorded against this contract, and appended to the ledger. A mistake
            is corrected with a reversing entry, never a delete.
          </DialogDescription>
        </DialogHeader>
        <form action={record} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="contract_id" value={detail.contract.id} />
          <input type="hidden" name="source" value={source} />
          <FormError error={state?.error} />

          <Field label="Amount" htmlFor={`pay_amt_${detail.contract.id}`} required>
            <Input
              id={`pay_amt_${detail.contract.id}`}
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              className="tabular"
            />
          </Field>

          <Field label="Against milestone" htmlFor={`pay_ms_${detail.contract.id}`}>
            <Select id={`pay_ms_${detail.contract.id}`} name="milestone_id" defaultValue="">
              <option value="">Not tied to a milestone</option>
              {detail.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {inr(m.amount)}
                  {m.work_done ? "" : " (work not done)"}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor={`pay_on_${detail.contract.id}`}>
              <Input id={`pay_on_${detail.contract.id}`} name="paid_on" type="date" />
            </Field>
            <Field label="Mode" htmlFor={`pay_mode_${detail.contract.id}`}>
              <Select id={`pay_mode_${detail.contract.id}`} name="mode" defaultValue="bank_transfer">
                <option value="bank_transfer">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>

          <Field label="Reference" htmlFor={`pay_ref_${detail.contract.id}`}>
            <Input id={`pay_ref_${detail.contract.id}`} name="reference" placeholder="UTR / cheque no." />
          </Field>

          <div>
            <SubmitButton pendingLabel="Recording…">Record</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Documents ────────────────────────────────────────────────────────────── */

/**
 * *"You get to store your documents per vendor, per contract."*
 *
 * These are `project_files` rows carrying a `contract_id` — the same storage
 * layer, versions and comment thread as Designs & Documents, so a contract
 * document is not a second-class file with its own rules.
 */
function DocumentList({
  projectId,
  plan,
}: {
  projectId: string;
  plan: ProjectFinancialPlan;
}) {
  const byContract = new Map(
    [...plan.inflow, ...plan.outflow].map((c) => [c.contract.id, c.contract.name]),
  );

  if (plan.documents.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="size-8" />}
        title="No contract documents yet"
        description="Upload in Designs & documents and file it against a contract — same storage, same versions, same review thread."
        action={
          <Link href={`/projects/${projectId}/documents`}>
            <Button variant="secondary">Go to documents</Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul>
        {plan.documents.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5 last:border-0"
          >
            <Link
              href={`/projects/${projectId}/documents/${d.id}`}
              className="text-[13px] font-medium text-[var(--color-ink)] hover:underline"
            >
              {d.name}
            </Link>
            <span className="flex items-center gap-3 text-[12px] text-[var(--color-ink-secondary)]">
              <span>{byContract.get(d.contract_id) ?? "Removed contract"}</span>
              <span className="tabular">{fmtDate(d.created_at)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
