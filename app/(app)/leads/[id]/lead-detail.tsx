"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  FileText,
  History,
  IdCard,
  MapPin,
  Phone,
  Plus,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn, fmtDate, inr } from "@/lib/utils";
import {
  FOLLOW_UP_KIND_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUS_TONE,
  effectiveFollowUpStatus,
  formatTalkTime,
  proposeFromOutcome,
  statusLabelOf,
  statusToneOf,
  type FollowUpRow,
  type LeadStatusDef,
  type OutcomeRule,
} from "@/lib/lead-management-model";
import { STATUS_META } from "@/lib/interactions-model";
import { optionLabel, type WorkspaceOption } from "@/lib/workspace-model";
import type { LeadDetail } from "@/lib/data/lead-management";
import type { Member } from "@/lib/data/team";
import {
  addRemarkAction,
  cancelFollowUpAction,
  completeFollowUpAction,
  createFollowUpAction,
  logCallAction,
  promoteToProjectAction,
  setAssigneesAction,
  setStatusAction,
  updateLeadAction,
  type FormState,
} from "../actions";
import {
  Avatar,
  Chip,
  Disclosure,
  Empty,
  FormError,
  FormGrid,
  List,
  Row,
  RowAction,
  Section,
  StatTile,
  SubmitButton,
  TabBar,
  TileGrid,
  type TabDef,
} from "../../dashboard/workspace-ui";

/**
 * The 360° lead.
 *
 * Five tabs — Details, Follow-ups, Call logs, Activity, Location — swapped in
 * place, same as the workspace: pressing one never navigates. Everything the
 * competitor's lead screen captures is here, but the fields that matter to a
 * quotation (budget band, scope, layout size, rooms, theme) are typed values
 * chosen from tenant-configured lists rather than free text, so they can flow
 * downstream instead of being retyped.
 */

const initial: FormState = undefined;

const TABS: TabDef[] = [
  { id: "details", label: "Details", icon: <IdCard className="size-4" /> },
  { id: "followups", label: "Follow-ups", icon: <CalendarClock className="size-4" /> },
  { id: "calls", label: "Call logs", icon: <Phone className="size-4" /> },
  { id: "activity", label: "Activity", icon: <History className="size-4" /> },
  { id: "location", label: "Location", icon: <MapPin className="size-4" /> },
];

function opts(options: WorkspaceOption[], kind: WorkspaceOption["kind"]) {
  return options.filter((o) => o.kind === kind && o.is_active);
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";
}

export function LeadDetailView({ detail }: { detail: LeadDetail }) {
  const {
    lead, statuses, options, members, assignees, followUps, calls, activities,
    outcomeRules, followUpAssignees,
  } = detail;
  const [tab, setTab] = useState("details");

  // Deep links from the list ("Add follow-up") land on the right tab.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, []);

  const select = useCallback((id: string) => {
    setTab(id);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const now = new Date();
  const overdue = followUps.filter(
    (f) => effectiveFollowUpStatus(f, now) === "missed",
  ).length;

  const tabs = TABS.map((t) =>
    t.id === "followups"
      ? { ...t, badge: overdue, alert: true }
      : t.id === "calls"
        ? { ...t, badge: calls.filter((c) => c.channel === "call").length }
        : t,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <LeadHeader detail={detail} />

      <div className="sticky top-0 z-10 -mx-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1 pt-1">
        <TabBar tabs={tabs} active={tab} onSelect={select} />
      </div>

      <div className="pt-6">
        {tab === "details" && (
          <DetailsTab
            lead={lead}
            statuses={statuses}
            options={options}
            members={members}
            assignees={assignees}
          />
        )}
        {tab === "followups" && (
          <FollowUpsTab
            leadId={lead.id}
            leadName={lead.name}
            followUps={followUps}
            members={members}
            options={options}
            statuses={statuses}
            outcomeRules={outcomeRules}
            currentStatus={lead.status}
            assigneesByFollowUp={followUpAssignees}
          />
        )}
        {tab === "calls" && (
          <CallsTab leadId={lead.id} phone={lead.phone} calls={calls} options={options} />
        )}
        {tab === "activity" && <ActivityTab leadId={lead.id} activities={activities} />}
        {tab === "location" && <LocationTab lead={lead} />}
      </div>
    </div>
  );
}

/* ── Header ───────────────────────────────────────────────────────────────── */

function LeadHeader({ detail }: { detail: LeadDetail }) {
  const { lead, statuses, assignees } = detail;
  const [promoteState, promote] = useActionState(promoteToProjectAction, initial);

  return (
    <div className="mb-5">
      <Link
        href="/leads"
        className="text-[13px] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)] hover:underline"
      >
        ← Lead Management
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
              {lead.name}
            </h1>
            <Chip
              tone={statusToneOf(statuses, lead.status)}
              label={statusLabelOf(statuses, lead.status)}
            />
            {lead.project_id && <Chip tone="green" label="Promoted" />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-ink-secondary)]">
            {lead.phone && <span className="tabular">{lead.phone}</span>}
            {lead.email && <span>{lead.email}</span>}
            {lead.project_name && <span>{lead.project_name}</span>}
            <span>Created {fmtDate(lead.created_at)}</span>
          </p>
          {assignees.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              {assignees.map((a) => (
                <Avatar key={a.id} name={a.name} />
              ))}
              <span className="ml-1 text-xs text-[var(--color-ink-secondary)]">
                {assignees.map((a) => a.name).join(", ")}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {lead.project_id ? (
            <Link href={`/projects/${lead.project_id}`}>
              <Button variant="secondary" size="sm">
                Open project <ArrowUpRight className="size-3.5" />
              </Button>
            </Link>
          ) : (
            <form action={promote}>
              <input type="hidden" name="id" value={lead.id} />
              <SubmitButton size="sm" pendingLabel="Promoting…">
                Promote to project
              </SubmitButton>
            </form>
          )}
          <FormError error={promoteState?.error} />
        </div>
      </div>
    </div>
  );
}

/* ── Details ──────────────────────────────────────────────────────────────── */

function DetailsTab({
  lead,
  statuses,
  options,
  members,
  assignees,
}: {
  lead: LeadDetail["lead"];
  statuses: LeadStatusDef[];
  options: WorkspaceOption[];
  members: Member[];
  assignees: Member[];
}) {
  const [state, save] = useActionState(updateLeadAction, initial);
  const [assignState, saveAssignees] = useActionState(setAssigneesAction, initial);
  const assignedIds = new Set(assignees.map((a) => a.id));

  return (
    <>
      <Section
        title="Who and what"
        description="The brief this lead is carrying. These values flow into the quotation, so they are picked from lists rather than typed."
      >
        <form action={save} className="flex flex-col gap-5">
          <input type="hidden" name="id" value={lead.id} />
          <FormError error={state?.error} />

          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
              Contact
            </p>
            <FormGrid>
              <Field label="Client name" htmlFor="name" required>
                <Input id="name" name="name" defaultValue={lead.name} />
              </Field>
              <Field label="Phone" htmlFor="phone" hint="Deduped across the workspace">
                <Input id="phone" name="phone" defaultValue={lead.phone ?? ""} />
              </Field>
              <Field label="Alternate contact" htmlFor="alt_phone">
                <Input id="alt_phone" name="alt_phone" defaultValue={lead.alt_phone ?? ""} />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={lead.email ?? ""} />
              </Field>
              <Field label="Speaking to" htmlFor="contact_role">
                <Select id="contact_role" name="contact_role" defaultValue={lead.contact_role ?? ""}>
                  <option value="">—</option>
                  {opts(options, "contact_role").map((o) => (
                    <option key={o.id} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Organisation" htmlFor="org_type">
                <Select id="org_type" name="org_type" defaultValue={lead.org_type ?? "residential"}>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                </Select>
              </Field>
            </FormGrid>
          </div>

          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
              Project brief
            </p>
            <FormGrid>
              <Field label="Project name" htmlFor="project_name">
                <Input id="project_name" name="project_name" defaultValue={lead.project_name ?? ""} placeholder="B-1023 / Anil Residence" />
              </Field>
              <Field label="Property type" htmlFor="project_type">
                <Select id="project_type" name="project_type" defaultValue={lead.project_type ?? ""}>
                  <option value="">—</option>
                  {opts(options, "project_type").map((o) => (
                    <option key={o.id} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Budget" htmlFor="budget_band">
                <Select id="budget_band" name="budget_band" defaultValue={lead.budget_band ?? ""}>
                  <option value="">—</option>
                  {opts(options, "budget_band").map((o) => (
                    <option key={o.id} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Scope of work" htmlFor="scope">
                <Select id="scope" name="scope" defaultValue={lead.scope ?? ""}>
                  <option value="">—</option>
                  {opts(options, "lead_scope").map((o) => (
                    <option key={o.id} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Layout size (sq ft)" htmlFor="layout_sqft">
                <Input id="layout_sqft" name="layout_sqft" type="number" step="0.01" min="0" defaultValue={lead.layout_sqft ?? ""} />
              </Field>
              <Field label="Interior theme" htmlFor="theme">
                <Input id="theme" name="theme" defaultValue={lead.theme ?? ""} placeholder="Modern minimal, warm woods" />
              </Field>
              <Field label="Rooms in scope" htmlFor="rooms" hint="Comma separated — these seed the quotation's sections.">
                <Input id="rooms" name="rooms" defaultValue={(lead.rooms ?? []).join(", ")} placeholder="Kitchen, Master bedroom, Living" />
              </Field>
              <Field label="Deal value (₹)" htmlFor="value">
                <Input id="value" name="value" type="number" step="0.01" min="0" defaultValue={lead.value ?? ""} />
              </Field>
              <Field label="Tentative start" htmlFor="tentative_start">
                <Input id="tentative_start" name="tentative_start" type="date" defaultValue={lead.tentative_start ?? ""} />
              </Field>
              <Field label="Source" htmlFor="source">
                <Select id="source" name="source" defaultValue={lead.source}>
                  {opts(options, "lead_source").map((o) => (
                    <option key={o.id} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Sales owner" htmlFor="sales_owner_id">
                <Select id="sales_owner_id" name="sales_owner_id" defaultValue={lead.sales_owner_id ?? ""}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Qualification rating" htmlFor="rating" hint="0–5, your read on how real this is.">
                <Select id="rating" name="rating" defaultValue={String(lead.rating ?? "")}>
                  <option value="">—</option>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{"★".repeat(n) || "Unrated"}</option>
                  ))}
                </Select>
              </Field>
            </FormGrid>

            <div className="mt-4">
              <Field label="Requirements" htmlFor="description">
                <Textarea id="description" name="description" rows={3} defaultValue={lead.description ?? ""} placeholder="What the client actually asked for, in their words." />
              </Field>
            </div>

            <label className="mt-4 flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                name="client_portal"
                defaultChecked={lead.client_portal}
                className="size-4 rounded border-[var(--color-border-strong)] accent-[var(--color-ink)]"
              />
              Give this client portal access
            </label>
          </div>

          <div className="flex items-center gap-2">
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
            {state?.ok && (
              <span className="text-[13px] text-[var(--color-green)]">Saved.</span>
            )}
          </div>
        </form>
      </Section>

      <Section
        title="Assigned to"
        description="More than one person can own a lead — a designer and a sales executive usually both do."
      >
        <form action={saveAssignees} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={lead.id} />
          <FormError error={assignState?.error} />
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  assignedIds.has(m.id)
                    ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)]"
                    : "border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
                )}
              >
                <input
                  type="checkbox"
                  name="member_id"
                  value={m.id}
                  defaultChecked={assignedIds.has(m.id)}
                  className="size-3.5 rounded border-[var(--color-border-strong)] accent-[var(--color-ink)]"
                />
                {m.name}
              </label>
            ))}
          </div>
          <div>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Update assignees
            </SubmitButton>
          </div>
        </form>
      </Section>

      <Section title="Status">
        <form action={setStatusAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={lead.id} />
          <div className="min-w-52">
            <Field label="Move this lead to" htmlFor="status">
              <Select id="status" name="status" defaultValue={lead.status}>
                {statuses
                  .filter((s) => s.is_active || s.value === lead.status)
                  .map((s) => (
                    <option key={s.id} value={s.value}>{s.label}</option>
                  ))}
              </Select>
            </Field>
          </div>
          <RowAction variant="secondary">Update status</RowAction>
        </form>
      </Section>
    </>
  );
}

/* ── Follow-ups ───────────────────────────────────────────────────────────── */

export function FollowUpForm({
  leadId,
  leadName,
  members,
  compact,
  onDone,
}: {
  leadId: string;
  leadName?: string;
  members: Member[];
  compact?: boolean;
  /** Called once the follow-up is actually written — the dialog closes on it. */
  onDone?: () => void;
}) {
  const [state, create] = useActionState(createFollowUpAction, initial);
  const [kind, setKind] = useState<"callback" | "meeting">("callback");
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={create} className="flex flex-col gap-4">
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="kind" value={kind} />
      <FormError error={state?.error} />

      {/* Callback vs meeting. A callback is a REMINDER to phone someone — the
          app does not dial, it just makes sure nobody forgets. */}
      <div className="inline-flex w-fit rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1">
        {(["callback", "meeting"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              kind === k
                ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
            )}
          >
            {k === "callback" ? <Phone className="size-3.5" /> : <CalendarClock className="size-3.5" />}
            {FOLLOW_UP_KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-[var(--color-ink-secondary)]">
        {kind === "callback"
          ? "A reminder to phone this client at the chosen time. VEYRA does not place the call."
          : "A scheduled meeting — it lands on the assignee's workspace as a task."}
      </p>

      <Field label="Title" htmlFor="fu_title">
        <Input
          id="fu_title"
          name="title"
          defaultValue={leadName ? `${leadName}${leadName ? "" : ""}` : ""}
          placeholder="What is this about?"
        />
      </Field>

      <FormGrid>
        <Field label="Date" htmlFor="fu_date" required>
          <Input id="fu_date" name="due_date" type="date" defaultValue={today} />
        </Field>
        <Field label="Time" htmlFor="fu_time">
          <Input id="fu_time" name="due_time" type="time" defaultValue="17:30" />
        </Field>
        <Field label="Assign to" htmlFor="fu_member">
          <Select id="fu_member" name="member_id">
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="fu_priority">
          <Select id="fu_priority" name="priority" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
      </FormGrid>

      {!compact && (
        <Field label="Notes" htmlFor="fu_note">
          <Textarea id="fu_note" name="note" rows={2} placeholder="Any context or remarks" />
        </Field>
      )}

      <div>
        <SubmitButton pendingLabel="Scheduling…">Create</SubmitButton>
      </div>
    </form>
  );
}

/**
 * A lead carries as many follow-ups as the conversation needs — that is the
 * normal case, not the exception. This used to be a `Disclosure` that folded
 * shut the moment one follow-up existed, so the screen read "one and done".
 * Now the primary sits at the top-right of the tab and stays there: the answer
 * to "can I add another?" is always visibly yes.
 */
function NewFollowUpDialog({
  leadId,
  leadName,
  members,
}: {
  leadId: string;
  leadName: string;
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="size-4" /> Add follow-up
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New follow-up</DialogTitle>
          <DialogDescription>
            A callback is a reminder to phone this client — VEYRA never dials.
            Add as many as the conversation needs.
          </DialogDescription>
        </DialogHeader>
        <FollowUpForm
          leadId={leadId}
          leadName={leadName}
          members={members}
          onDone={close}
        />
      </DialogContent>
    </Dialog>
  );
}

function FollowUpRowView({
  fu,
  options,
  statuses,
  outcomeRules,
  currentStatus,
  assigneeNames,
  leadName,
}: {
  fu: FollowUpRow;
  options: WorkspaceOption[];
  statuses: LeadStatusDef[];
  outcomeRules: OutcomeRule[];
  currentStatus: string;
  assigneeNames: string[];
  leadName?: string;
}) {
  const status = effectiveFollowUpStatus(fu);
  const open = status === "upcoming" || status === "missed";

  return (
    <Row
      alert={status === "missed"}
      title={fu.title || leadName || FOLLOW_UP_KIND_LABELS[fu.kind === "meeting" ? "meeting" : "callback"]}
      chips={
        <>
          <Chip tone={FOLLOW_UP_STATUS_TONE[status]} label={FOLLOW_UP_STATUS_LABELS[status]} />
          <Chip
            tone="neutral"
            label={FOLLOW_UP_KIND_LABELS[fu.kind === "meeting" ? "meeting" : "callback"]}
          />
        </>
      }
      meta={[
        fmtWhen(fu.due_at),
        // Many people can carry one follow-up now; the owner is simply first.
        assigneeNames.join(", ") || null,
        fu.outcome ? optionLabel(options, "followup_outcome", fu.outcome) : null,
        fu.note,
      ]
        .filter(Boolean)
        .join(" · ")}
      right={
        open ? (
          <>
            <CompleteFollowUpDialog
              fu={fu}
              options={options}
              statuses={statuses}
              outcomeRules={outcomeRules}
              currentStatus={currentStatus}
            />
            <form action={cancelFollowUpAction}>
              <input type="hidden" name="id" value={fu.id} />
              <RowAction title="Cancel">Cancel</RowAction>
            </form>
          </>
        ) : undefined
      }
    />
  );
}

/**
 * Closing a follow-up is where the lead actually moves.
 *
 * The owner: *"based on those follow-ups, you got to change the status… once
 * you finish with the follow-up… you even had to do multiple follow-ups."*
 * Choosing an outcome looks up the tenant's rule and PRESELECTS both halves —
 * the next status and a date for the next conversation. Both are visible, both
 * are editable, and nothing is written until this form is submitted. A status
 * that changed on its own is a status nobody trusts.
 */
function CompleteFollowUpDialog({
  fu,
  options,
  statuses,
  outcomeRules,
  currentStatus,
}: {
  fu: FollowUpRow;
  options: WorkspaceOption[];
  statuses: LeadStatusDef[];
  outcomeRules: OutcomeRule[];
  currentStatus: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, complete] = useActionState(completeFollowUpAction, initial);
  const [outcome, setOutcome] = useState("");

  const proposal = useMemo(
    () => proposeFromOutcome(outcomeRules, outcome || null, statuses, currentStatus),
    [outcomeRules, outcome, statuses, currentStatus],
  );
  const [nextStatus, setNextStatus] = useState("");
  const [bookNext, setBookNext] = useState(false);
  const [followOn, setFollowOn] = useState("");

  // The rule proposes; these fields are what the user is about to confirm.
  useEffect(() => {
    setNextStatus(proposal.nextStatus ?? "");
    setFollowOn(proposal.followOnDate ?? "");
    setBookNext(!!proposal.followOnDate);
  }, [proposal]);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  const outcomeOptions = options.filter(
    (o) => o.kind === "followup_outcome" && o.is_active,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Mark done
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete follow-up</DialogTitle>
          <DialogDescription>
            What came of it — and what happens to the lead next.
          </DialogDescription>
        </DialogHeader>

        <form action={complete} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={fu.id} />
          <input type="hidden" name="lead_id" value={fu.lead_id} />
          <FormError error={state?.error} />

          <Field label="Outcome" htmlFor={`outcome-${fu.id}`}>
            <Select
              id={`outcome-${fu.id}`}
              name="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option value="">Select an outcome…</option>
              {outcomeOptions.map((o) => (
                <option key={o.id} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What happened" htmlFor={`note-${fu.id}`}>
            <Input
              id={`note-${fu.id}`}
              name="note"
              placeholder="Asked for a revised quote on the wardrobe"
            />
          </Field>

          {proposal.reason && (
            <p className="rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-xs text-[var(--color-ink-secondary)]">
              {proposal.reason} Change or clear either one — nothing moves until
              you save.
            </p>
          )}

          <Field label="Move the lead to" htmlFor={`status-${fu.id}`}>
            <Select
              id={`status-${fu.id}`}
              name="next_status"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
            >
              <option value="">Leave the status unchanged</option>
              {statuses
                .filter((st) => st.is_active)
                .map((st) => (
                  <option key={st.id} value={st.value}>
                    {st.label}
                  </option>
                ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={bookNext}
                onChange={(e) => setBookNext(e.target.checked)}
                className="size-4 accent-[var(--color-red)]"
              />
              Book the next follow-up
            </label>
            {bookNext && (
              <Input
                type="date"
                name="follow_on_date"
                aria-label="Next follow-up date"
                value={followOn}
                onChange={(e) => setFollowOn(e.target.value)}
              />
            )}
          </div>

          <div>
            <SubmitButton pendingLabel="Saving…">Complete follow-up</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpsTab({
  leadId,
  leadName,
  followUps,
  members,
  options,
  statuses,
  outcomeRules,
  currentStatus,
  assigneesByFollowUp,
}: {
  leadId: string;
  leadName: string;
  followUps: FollowUpRow[];
  members: Member[];
  options: WorkspaceOption[];
  statuses: LeadStatusDef[];
  outcomeRules: OutcomeRule[];
  currentStatus: string;
  assigneesByFollowUp: Record<string, string[]>;
}) {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const namesFor = (f: FollowUpRow): string[] => {
    const ids = assigneesByFollowUp[f.id] ?? (f.member_id ? [f.member_id] : []);
    return ids.map((id) => nameById.get(id)).filter((n): n is string => !!n);
  };
  const now = new Date();
  const open = followUps.filter((f) => {
    const s = effectiveFollowUpStatus(f, now);
    return s === "upcoming" || s === "missed";
  });
  const closed = followUps.filter((f) => !open.includes(f));

  return (
    <>
      <Section
        title="Open"
        description="Anything still owed to this client."
        action={
          <NewFollowUpDialog
            leadId={leadId}
            leadName={leadName}
            members={members}
          />
        }
      >
        {open.length === 0 ? (
          <Empty
            message="Nothing scheduled"
            hint="Use “Add follow-up” to book the next callback or meeting."
          />
        ) : (
          <List>
            {open.map((f) => (
              <FollowUpRowView
                key={f.id}
                fu={f}
                options={options}
                statuses={statuses}
                outcomeRules={outcomeRules}
                currentStatus={currentStatus}
                assigneeNames={namesFor(f)}
                leadName={leadName}
              />
            ))}
          </List>
        )}
      </Section>

      {closed.length > 0 && (
        <Section title="History">
          <List>
            {closed.map((f) => (
              <FollowUpRowView
                key={f.id}
                fu={f}
                options={options}
                statuses={statuses}
                outcomeRules={outcomeRules}
                currentStatus={currentStatus}
                assigneeNames={namesFor(f)}
                leadName={leadName}
              />
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

/* ── Call logs ────────────────────────────────────────────────────────────── */

function CallsTab({
  leadId,
  phone,
  calls,
  options,
}: {
  leadId: string;
  phone: string | null;
  calls: LeadDetail["calls"];
  options: WorkspaceOption[];
}) {
  const [state, log] = useActionState(logCallAction, initial);
  const callRows = calls.filter((c) => c.channel === "call");
  const connected = callRows.filter(
    (c) => c.status === "connected" || c.status === "completed",
  );
  const talk = connected.reduce((s, c) => s + (Number(c.duration_sec) || 0), 0);

  return (
    <>
      <TileGrid>
        <StatTile label="Dialed" value={callRows.length} />
        <StatTile label="Connected" value={connected.length} tone={connected.length > 0 ? "green" : "neutral"} />
        <StatTile label="Not received" value={callRows.length - connected.length} />
        <StatTile label="Talk time" value={formatTalkTime(talk)} />
      </TileGrid>

      <Section
        title="Log a call"
        description="Record a call that already happened. VEYRA does not dial — this is the log, not a phone."
      >
        <Disclosure label="Log a call">
          <form action={log} className="flex flex-col gap-4">
            <input type="hidden" name="lead_id" value={leadId} />
            <FormError error={state?.error} />
            <FormGrid>
              <Field label="Direction" htmlFor="direction">
                <Select id="direction" name="direction" defaultValue="outbound">
                  <option value="outbound">Outgoing</option>
                  <option value="inbound">Incoming</option>
                </Select>
              </Field>
              <Field label="Outcome" htmlFor="call_status">
                <Select id="call_status" name="status" defaultValue="connected">
                  <option value="connected">Connected</option>
                  <option value="not_connected">Not connected</option>
                  <option value="no_answer">No answer</option>
                  <option value="failed">Failed</option>
                </Select>
              </Field>
              <Field label="Duration (minutes)" htmlFor="duration_min">
                <Input id="duration_min" name="duration_min" type="number" min="0" step="0.5" defaultValue="0" />
              </Field>
              <Field label="Number" htmlFor="customer_no">
                <Input id="customer_no" name="customer_no" defaultValue={phone ?? ""} />
              </Field>
            </FormGrid>
            <Field label="What was said" htmlFor="call_note" hint="Becomes this lead's latest remark.">
              <Input id="call_note" name="note" placeholder="Interested in 3BHK, asked to send a quote" />
            </Field>
            <div>
              <SubmitButton pendingLabel="Logging…">Log call</SubmitButton>
            </div>
          </form>
        </Disclosure>
      </Section>

      <Section title="Call history">
        {callRows.length === 0 ? (
          <Empty message="No calls logged" hint="Log one above once you have spoken to them." />
        ) : (
          <List>
            {callRows.map((c) => {
              const meta = STATUS_META[c.status as keyof typeof STATUS_META];
              return (
                <Row
                  key={c.id}
                  title={c.direction === "inbound" ? "Incoming call" : "Outgoing call"}
                  chips={
                    <Chip
                      tone={
                        meta?.tone === "positive" ? "green" : meta?.tone === "warning" ? "amber" : "neutral"
                      }
                      label={meta?.label ?? c.status}
                    />
                  }
                  meta={[
                    fmtWhen(c.occurred_at),
                    c.customer_no,
                    formatTalkTime(Number(c.duration_sec) || 0),
                    c.disposition ? optionLabel(options, "followup_outcome", c.disposition) : null,
                    c.note,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}

/* ── Activity ─────────────────────────────────────────────────────────────── */

function ActivityTab({
  leadId,
  activities,
}: {
  leadId: string;
  activities: LeadDetail["activities"];
}) {
  const [state, add] = useActionState(addRemarkAction, initial);

  return (
    <>
      <Section title="Add a remark" description="Also becomes this lead's latest remark on the list.">
        <form action={add} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={leadId} />
          <div className="min-w-64 flex-1">
            <Input name="note" placeholder="Spoke to the client — sending revised quote Monday" />
          </div>
          <SubmitButton variant="secondary" pendingLabel="Adding…">Add</SubmitButton>
          <FormError error={state?.error} />
        </form>
      </Section>

      <Section title="Timeline">
        {activities.length === 0 ? (
          <Empty message="Nothing has happened yet" />
        ) : (
          <List>
            {activities.map((a) => (
              <Row
                key={a.id}
                title={a.note ?? a.kind}
                chips={<Chip tone="neutral" label={a.kind.replace(/_/g, " ")} />}
                meta={fmtWhen(a.created_at)}
              />
            ))}
          </List>
        )}
      </Section>
    </>
  );
}

/* ── Location ─────────────────────────────────────────────────────────────── */

function LocationTab({ lead }: { lead: LeadDetail["lead"] }) {
  const [state, save] = useActionState(updateLeadAction, initial);
  const mapsUrl =
    lead.lat != null && lead.lng != null
      ? `https://www.google.com/maps?q=${lead.lat},${lead.lng}`
      : [lead.address_line, lead.city, lead.state, lead.pincode].filter(Boolean).length > 0
        ? `https://www.google.com/maps/search/${encodeURIComponent(
            [lead.address_line, lead.city, lead.state, lead.pincode].filter(Boolean).join(", "),
          )}`
        : null;

  return (
    <Section
      title="Property location"
      description="Where the work happens. A purchase order's ship-to reads this once the lead becomes a project."
    >
      <form action={save} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={lead.id} />
        <FormError error={state?.error} />
        <Field label="Address" htmlFor="address_line">
          <Textarea id="address_line" name="address_line" rows={2} defaultValue={lead.address_line ?? ""} />
        </Field>
        <FormGrid>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={lead.city ?? ""} />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" name="state" defaultValue={lead.state ?? ""} />
          </Field>
          <Field label="PIN code" htmlFor="pincode">
            <Input id="pincode" name="pincode" defaultValue={lead.pincode ?? ""} />
          </Field>
          <Field label="Coordinates" htmlFor="lat" hint="Optional — enables the site geofence later.">
            <div className="flex gap-2">
              <Input id="lat" name="lat" placeholder="Latitude" defaultValue={lead.lat ?? ""} />
              <Input name="lng" placeholder="Longitude" defaultValue={lead.lng ?? ""} />
            </div>
          </Field>
        </FormGrid>
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Saving…">Save location</SubmitButton>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-ink)] hover:underline"
            >
              <MapPin className="size-3.5" /> Open in Maps
            </a>
          )}
        </div>
      </form>
    </Section>
  );
}

export const leadIcons = { FileText, Star, inr };
