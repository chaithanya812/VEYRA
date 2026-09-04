import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui/primitives";
import { PermissionLimited } from "@/components/ui/permission-limited";
import { StatTile, TileGrid } from "@/app/(app)/dashboard/workspace-ui";
import { can } from "@/lib/data/permissions";
import { pettyFinanceData } from "@/lib/data/petty-finance";
import {
  DELETED_PROJECT,
  PETTY_KIND_LABELS,
  PETTY_KIND_NOUNS,
  PETTY_KINDS,
  PETTY_TABS,
  filterClaims,
  isPettyKind,
  isPettyTab,
  kindForTab,
  matchesUserSearch,
  monthLabel,
  pettyLedgers,
  pettySummary,
  pettyUserCards,
  projectNameFor,
  resolveMonth,
  shortId,
  stepMonth,
  type PettyClaim,
  type PettyKind,
  type PettyMonth,
  type PettyTab,
  type PettyUserCard,
} from "@/lib/petty-finance-model";
import type { LedgerView } from "@/lib/payments-ledger-model";
import { formatPhotoDate } from "@/lib/site-photos-model";
import { cn, fmtDate, inr } from "@/lib/utils";
import { RecordPettyEntry, ReversedToggle, RowApprovals } from "./petty-controls";

/**
 * Petty Finance — frame `110521`, PLAN-V4 §12.2.
 *
 * Four things about the shape of this file.
 *
 * 1. **It computes no money.** Balances, side totals, the overdrawn band and
 *    the reversal rules all come from `lib/petty-finance-model.ts`, which sits
 *    on `buildLedger` — the same function the project payment ledger uses. Two
 *    screens that hide reversals differently would eventually disagree about
 *    how much a person owes.
 *
 * 2. **Every piece of state is in the URL**, resolved on the SERVER: the tab,
 *    the month, the expense/fund toggle, the person the page is scoped to, the
 *    user search and the reversed-transactions checkbox. A tab or a filter
 *    resolved in a `useEffect` server-renders the wrong screen and cannot be
 *    verified by fetching HTML (HANDOFF-V8 §11). It also means clicking a
 *    person's name produces a link somebody can send to them.
 *
 * 3. **The ledger is the same table `/dashboard` writes.** `expense_claims`,
 *    seen per person instead of per project. Petty Finance did not get a
 *    ledger of its own.
 *
 * 4. **Refusal is per-tab, not per-route.** Somebody who may not see the
 *    company's petty spend may always see their own — gating the whole route
 *    would lock a member out of claiming back money they have already spent.
 */

interface Params {
  tab?: string;
  y?: string;
  m?: string;
  side?: string;
  member?: string;
  q?: string;
  reversed?: string;
}

export default async function PettyFinancePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;

  const tab: PettyTab = isPettyTab(sp.tab) ? sp.tab : "dashboard";
  const month = resolveMonth({ y: sp.y, m: sp.m }, new Date());
  const showReversed = sp.reversed === "1";
  const search = sp.q?.trim() ?? "";
  // On a "my" tab the side is the tab; on the dashboard it is the frame's
  // centre toggle. One value, two ways of being chosen.
  const side: PettyKind =
    tab === "dashboard" ? (isPettyKind(sp.side) ? sp.side : "expense") : kindForTab(tab);

  const data = await pettyFinanceData();
  const scopedMemberId =
    tab === "dashboard" ? (sp.member?.trim() || null) : data.actingMemberId;

  const monthClaims = filterClaims(data.claims, { month });
  const visibleClaims = filterClaims(data.claims, { month, memberId: scopedMemberId });

  // Cards are built from the whole month so the rail keeps its shape when the
  // page is scoped to one person — a rail that collapsed to a single card would
  // leave no way back to everybody else.
  const allCards = pettyUserCards(monthClaims, data.members);
  const cards = allCards.filter((c) => matchesUserSearch(c.name, search));
  const scopedCard = scopedMemberId
    ? (allCards.find((c) => c.memberId === scopedMemberId) ?? null)
    : null;
  // The band sums the VISIBLE people: all of them, or the one being looked at.
  const summary = pettySummary(scopedCard ? [scopedCard] : cards);

  const ledgers = pettyLedgers(visibleClaims, showReversed);
  const view = ledgers[side];
  const byId = new Map(data.claims.map((c) => [c.id, c]));
  const categoryLabels = Object.fromEntries(
    data.categories.map((c) => [c.value, c.label]),
  );

  const href = (over: Partial<Params>) => {
    const next: Params = {
      tab,
      y: String(month.year),
      m: String(month.month),
      side,
      member: scopedMemberId ?? undefined,
      q: search || undefined,
      reversed: showReversed ? "1" : undefined,
      ...over,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, String(v));
    return `/finance/petty?${qs.toString()}`;
  };

  const monthHref = (m: PettyMonth) =>
    href({ y: String(m.year), m: String(m.month) });

  const maySeeEveryone = await can("billing.payment.view");
  const mayApprove = await can("billing.payment.approve");

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Petty Finance"
        subtitle={`${monthLabel(month)} · every figure derives from expense_claims — nothing here is stored as a total`}
        actions={
          <Link href="/approvals?module=expense">
            <Button variant="secondary">Approvals</Button>
          </Link>
        }
      />

      {/* Tabs and the centre toggle, both plain links: the URL IS the state. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Petty Finance views" className="flex items-center gap-1">
          {PETTY_TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key, side: undefined, member: undefined })}
              aria-current={t.key === tab ? "page" : undefined}
              data-testid={`tab-${t.key}`}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-medium",
                t.key === tab
                  ? "bg-[var(--color-ink)] text-white"
                  : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)]",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === "dashboard" && (
          <div
            role="group"
            aria-label="Expenses or funds"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1"
          >
            {PETTY_KINDS.map((k) => (
              <Link
                key={k}
                href={href({ side: k })}
                aria-current={k === side ? "true" : undefined}
                data-testid={`side-${k}`}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13px] font-medium",
                  k === side
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(23,23,26,0.08)]"
                    : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
                )}
              >
                {PETTY_KIND_LABELS[k]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {tab === "dashboard" && !maySeeEveryone ? (
        <PermissionLimited capability="billing.payment.view" />
      ) : tab === "dashboard" ? (
        <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <MonthStepper month={month} monthHref={monthHref} />

            {/* ⚠ THE `key` IS LOAD-BEARING — see /finance/payments. Every tab,
                month and side control on this screen is a LINK, so arriving
                here is a client-side navigation that re-renders this form
                without remounting it; `defaultValue` applies on mount only, so
                the box would keep the previous month's search term while the
                ledger showed the new month. */}
            <form
              method="get"
              key={`${tab}|${month.year}-${month.month}|${side}|${search}`}
              className="flex items-center gap-2"
            >
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="y" value={month.year} />
              <input type="hidden" name="m" value={month.month} />
              <input type="hidden" name="side" value={side} />
              {showReversed && <input type="hidden" name="reversed" value="1" />}
              <Input
                name="q"
                defaultValue={search}
                placeholder="Search a person"
                aria-label="Search a person"
              />
              <Button type="submit" variant="secondary" aria-label="Search">
                <Search className="size-4" />
              </Button>
            </form>

            <Card className="p-4">
              <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-[var(--color-ink-secondary)]">
                Summary{scopedCard ? ` · ${scopedCard.name}` : ""}
              </p>
              <SummaryLine label="Balance" value={summary.balance} emphasis />
              <SummaryLine label="Expense" value={summary.expense} />
              <SummaryLine label="Fund" value={summary.fund} />
              <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[12px] text-[var(--color-ink-secondary)]">
                {scopedCard
                  ? "Scoped to one person."
                  : `Across ${summary.members} ${summary.members === 1 ? "person" : "people"}${search ? ` matching “${search}”` : ""}.`}
              </p>
            </Card>

            <div className="space-y-2">
              {scopedMemberId && (
                <Link href={href({ member: undefined })} data-testid="clear-scope">
                  <Button variant="ghost" size="sm">← Everybody</Button>
                </Link>
              )}
              {cards.length === 0 ? (
                <p className="px-1 text-[13px] text-[var(--color-ink-secondary)]">
                  Nobody matches “{search}”.
                </p>
              ) : (
                cards.map((c) => (
                  <UserCard
                    key={c.memberId}
                    card={c}
                    active={c.memberId === scopedMemberId}
                    href={href({ member: c.memberId })}
                  />
                ))
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <TileGrid>
              <StatTile
                label="Overdrawn Balance"
                value={inr(summary.overdrawn)}
                hint={
                  summary.overdrawnMembers === 0
                    ? "Nobody has spent more than they were funded"
                    : `${summary.overdrawnMembers} of ${summary.members} ${summary.members === 1 ? "person" : "people"} spent more than they were funded`
                }
                hero
                tone={summary.overdrawn > 0 ? "negative" : "neutral"}
              />
              <StatTile label="Total Expenses" value={inr(summary.expense)} />
              <StatTile label="Total Funds" value={inr(summary.fund)} />
            </TileGrid>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <ReversedToggle
                checked={showReversed}
                onHref={href({ reversed: "1" })}
                offHref={href({ reversed: undefined })}
                hiddenCount={view.hiddenCount}
              />
              <p className="text-[13px] text-[var(--color-ink-secondary)]">
                {PETTY_KIND_LABELS[side]} ·{" "}
                <span className="font-medium text-[var(--color-ink)]">
                  {inr(view.total)}
                </span>{" "}
                over {view.rows.length} row{view.rows.length === 1 ? "" : "s"}
                {showReversed && view.hiddenCount > 0
                  ? " — the total excludes reversed pairs in both modes"
                  : ""}
              </p>
            </div>

            <Ledger
              view={view}
              byId={byId}
              projectNames={data.projectNames}
              vendorNames={data.vendorNames}
              memberNames={Object.fromEntries(data.members.map((m) => [m.id, m.name]))}
              categoryLabels={categoryLabels}
              side={side}
              month={monthLabel(month)}
              mayApprove={mayApprove}
            />
          </section>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="p-5">
            <h2 className="mb-1 text-base font-semibold text-[var(--color-ink)]">
              Record {PETTY_KIND_NOUNS[side].toLowerCase()}
            </h2>
            <p className="mb-4 text-[13px] text-[var(--color-ink-secondary)]">
              {side === "fund"
                ? "Petty cash the company handed you. It raises your balance."
                : "Money you spent out of pocket or out of your float. It lowers your balance."}
            </p>
            <RecordPettyEntry
              kind={side}
              kindNoun={PETTY_KIND_NOUNS[side]}
              today={todayInIndia()}
              categories={data.categories.map((c) => ({ value: c.value, label: c.label }))}
              projects={data.projects}
            />
          </Card>

          <section className="space-y-4">
            <TileGrid>
              <StatTile
                label={`My ${PETTY_KIND_NOUNS[side].toLowerCase()}s · ${monthLabel(month)}`}
                value={inr(view.total)}
                hero
              />
              <StatTile label="My balance this month" value={inr(summary.balance)} />
              <StatTile label="Entries" value={String(view.rows.length)} />
            </TileGrid>

            <ReversedToggle
              checked={showReversed}
              onHref={href({ reversed: "1" })}
              offHref={href({ reversed: undefined })}
              hiddenCount={view.hiddenCount}
            />

            <Ledger
              view={view}
              byId={byId}
              projectNames={data.projectNames}
              vendorNames={data.vendorNames}
              memberNames={Object.fromEntries(data.members.map((m) => [m.id, m.name]))}
              categoryLabels={categoryLabels}
              side={side}
              month={monthLabel(month)}
              mayApprove={mayApprove}
            />
          </section>
        </div>
      )}
    </div>
  );
}

/** `YYYY-MM-DD` in IST, so the form defaults to the day the user is having. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function MonthStepper({
  month,
  monthHref,
}: {
  month: PettyMonth;
  monthHref: (m: PettyMonth) => string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
      <Link
        href={monthHref(stepMonth(month, -1))}
        aria-label="Previous month"
        data-testid="month-prev"
        className="rounded-md p-1.5 text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <span
        data-testid="month-label"
        className="text-[13px] font-medium text-[var(--color-ink)]"
      >
        {monthLabel(month)}
      </span>
      <Link
        href={monthHref(stepMonth(month, 1))}
        aria-label="Next month"
        data-testid="month-next"
        className="rounded-md p-1.5 text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-[13px] text-[var(--color-ink-secondary)]">{label}</span>
      <span
        className={cn(
          "tabular",
          emphasis ? "text-[15px] font-semibold" : "text-[13px]",
          value < 0 ? "text-[var(--color-red)]" : "text-[var(--color-ink)]",
        )}
      >
        {inr(value)}
      </span>
    </div>
  );
}

function UserCard({
  card,
  active,
  href,
}: {
  card: PettyUserCard;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      data-testid={`user-card-${card.memberId}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "block rounded-[var(--radius-card)] border px-3 py-2.5 transition-colors",
        active
          ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-sunken)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
          {card.name}
        </span>
        {/* A chip, never colour alone — the figure is in the label. */}
        <StatusChip
          tone={card.balance < 0 ? "red" : card.balance > 0 ? "green" : "neutral"}
          label={inr(card.balance)}
        />
      </div>
      <p className="mt-1 text-[12px] text-[var(--color-ink-secondary)]">
        Expense {inr(card.expense)} · Fund {inr(card.fund)}
      </p>
    </Link>
  );
}

const STATUS_TONE: Record<string, "neutral" | "amber" | "green" | "red"> = {
  submitted: "amber",
  approved: "green",
  reimbursed: "green",
  rejected: "red",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  reimbursed: "Reimbursed",
  rejected: "Rejected",
};

function Ledger({
  view,
  byId,
  projectNames,
  vendorNames,
  memberNames,
  categoryLabels,
  side,
  month,
  mayApprove,
}: {
  view: LedgerView;
  byId: Map<string, PettyClaim>;
  projectNames: Record<string, string>;
  vendorNames: Record<string, string>;
  memberNames: Record<string, string>;
  categoryLabels: Record<string, string>;
  side: PettyKind;
  month: string;
  mayApprove: boolean;
}) {
  if (view.rows.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="size-8" />}
        title={`No ${PETTY_KIND_NOUNS[side].toLowerCase()}s in ${month}`}
        description={
          view.hiddenCount > 0
            ? `${view.hiddenCount} reversed row${view.hiddenCount === 1 ? " is" : "s are"} hidden — tick View Reversed Transactions to see them.`
            : "Step the month, or record the first entry from My Expense."
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* The scroll lives INSIDE the card — the page body never scrolls sideways. */}
      <div className="max-h-[62vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-left text-[var(--color-ink-secondary)]">
              {["ID", "User Name", "Project Name", "Transaction Date", "Recorded Date"].map((h) => (
                <th key={h} scope="col"
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2.5 font-medium">
                  {h}
                </th>
              ))}
              <th scope="col"
                className="sticky top-0 z-10 whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2.5 text-right font-medium">
                Amount
              </th>
              {["Category", "Vendor", "Status"].map((h) => (
                <th key={h} scope="col"
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2.5 font-medium">
                  {h}
                </th>
              ))}
              {mayApprove && (
                <th scope="col"
                  className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2.5 text-right font-medium">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const claim = byId.get(row.id);
              const isReversal = view.reversalIds.has(row.id);
              const wasReversed = view.reversedIds.has(row.id);
              const project = claim
                ? projectNameFor(claim, projectNames)
                : DELETED_PROJECT;
              const status = claim?.status ?? "submitted";
              return (
                <tr
                  key={row.id}
                  data-testid={`ledger-row-${row.id}`}
                  className={cn(
                    "align-top",
                    (isReversal || wasReversed) && "bg-[var(--color-surface-sunken)]",
                  )}
                >
                  <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5 font-mono text-[12px] text-[var(--color-ink-secondary)]">
                    {shortId(row.id)}
                    {isReversal && (
                      <span className="ml-1.5 rounded bg-[var(--color-amber-tint)] px-1.5 text-[11px] font-medium text-[var(--color-amber)]">
                        Reversal
                      </span>
                    )}
                    {wasReversed && (
                      <span className="ml-1.5 rounded bg-[var(--color-amber-tint)] px-1.5 text-[11px] font-medium text-[var(--color-amber)]">
                        Reversed
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5 text-[var(--color-ink)]">
                    {memberNames[row.member_id ?? ""] ?? "Former member"}
                  </td>
                  <td
                    className={cn(
                      "border-b border-[var(--color-border)] px-3 py-2.5",
                      project === DELETED_PROJECT
                        ? "text-[var(--color-ink-secondary)] italic"
                        : "text-[var(--color-ink)]",
                    )}
                  >
                    {project}
                  </td>
                  {/* Two columns, two facts: the date typed, and the stamp. */}
                  <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5 text-[var(--color-ink)]">
                    {row.paid_on ? formatPhotoDate(row.paid_on) : "—"}
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5 text-[var(--color-ink-secondary)]">
                    {fmtDate(row.created_at)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5 text-right tabular font-medium",
                      Number(row.amount) < 0
                        ? "text-[var(--color-red)]"
                        : "text-[var(--color-ink)]",
                    )}
                  >
                    {inr(Number(row.amount))}
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5 text-[var(--color-ink-secondary)]">
                    {categoryLabels[row.category ?? ""] ?? row.category ?? "—"}
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5 text-[var(--color-ink-secondary)]">
                    {claim?.vendor_id ? (vendorNames[claim.vendor_id] ?? "Unlisted vendor") : "—"}
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5">
                    <StatusChip
                      tone={STATUS_TONE[status] ?? "neutral"}
                      label={STATUS_LABEL[status] ?? status}
                    />
                  </td>
                  {mayApprove && (
                    <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2.5">
                      <RowApprovals
                        id={row.id}
                        status={status}
                        reversed={isReversal || wasReversed}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
