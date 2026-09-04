"use client";

import { useEffect, useState, useTransition } from "react";
import { KeyRound, UserCheck, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Card, EmptyState, StatusChip } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/patterns";
import { StatTile, TileGrid, Avatar } from "../../dashboard/workspace-ui";
import {
  ROLE_LABELS,
  asMemberRole,
  eligibleManagers,
  isActiveMember,
  managerChain,
  memberStatusLabel,
  memberStatusTone,
  type Member,
} from "@/lib/workspace-model";
import type { UsersBoard } from "@/lib/data/team";
import { setManagerAction, setMemberStatusAction } from "./actions";

/**
 * Users (frame `110349`) — the workspace's people, and the one screen where
 * the reporting line is a COLUMN rather than a label.
 *
 * What this screen deliberately does not show, and why:
 *
 * • **DOB, Mobile No., Last Login and Last Active.** Nothing stores them.
 *   `org_members` is (org, user, role, manager, status, display name,
 *   designation) and `app_users` is (email, full name) — there is no phone, no
 *   date of birth and no activity stamp anywhere. Four columns of "—" would
 *   teach people the data exists and is merely missing.
 * • **The Global / 2FA chips.** Same reason: no column backs either.
 * • **Groups.** Not modelled. A tab that never has content teaches people to
 *   ignore tabs.
 * • **Role Management.** It already exists at `/settings/roles`; a second one
 *   here would be a second answer to the same question.
 *
 * RED APPEARS ONCE, on Deactivate — a destructive action, one of red's five
 * allowed jobs. There is no red page-primary: `Add new user` cannot be built
 * until people can be invited (there is no auth flow), and a red button that
 * opens nothing is worse than no button.
 */

export type UsersTab = "active" | "deactivated";

/* ── Table plumbing (matches the HR tables) ───────────────────────────────── */

function Th({ children, numeric }: { children: React.ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)] ${
        numeric ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
  muted,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2.5 align-top text-[13px] ${
        numeric ? "text-right tabular" : "text-left"
      } ${muted ? "text-[var(--color-ink-secondary)]" : "text-[var(--color-ink)]"}`}
    >
      {children}
    </td>
  );
}

/* ── The Manager cell ─────────────────────────────────────────────────────── */

/**
 * The reporting-line picker. It offers only `eligibleManagers` — everybody who
 * cannot close a loop — so the option that would be refused is never on the
 * list. The writer runs the same `wouldCycle` again regardless: a missing
 * option is a courtesy, and the control has to survive somebody posting to the
 * action directly.
 */
function ManagerCell({
  member,
  members,
  canEdit,
  onError,
}: {
  member: Member;
  members: Member[];
  canEdit: boolean;
  onError: (message: string | null) => void;
}) {
  const [value, setValue] = useState(member.manager_id ?? "");
  const [pending, startTransition] = useTransition();

  // The action revalidates and fresh props arrive — resync so the server stays
  // the source of truth even when a write was refused.
  useEffect(() => {
    setValue(member.manager_id ?? "");
  }, [member.manager_id]);

  const chain = managerChain(members, member.id);
  const options = eligibleManagers(members, member.id).filter((m) =>
    isActiveMember(m.status),
  );

  if (!canEdit) {
    return (
      <span className={chain[0] ? "" : "text-[var(--color-ink-secondary)]"}>
        {chain[0]?.name ?? "No manager"}
      </span>
    );
  }

  function choose(next: string) {
    const previous = value;
    setValue(next);
    onError(null);
    startTransition(async () => {
      const result = await setManagerAction({
        member_id: member.id,
        manager_id: next || null,
      });
      if (result.error) {
        setValue(previous);
        onError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value}
        disabled={pending}
        aria-label={`Manager for ${member.name}`}
        onChange={(e) => choose(e.target.value)}
        className="h-8 min-w-44 text-[13px]"
      >
        <option value="">No manager</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
      {chain.length > 1 && (
        <span className="text-[11px] text-[var(--color-ink-secondary)]">
          via {chain.map((m) => m.name).join(" → ")}
        </span>
      )}
    </div>
  );
}

/* ── The status action ────────────────────────────────────────────────────── */

function StatusAction({
  member,
  isSelf,
  reports,
  canEdit,
  onError,
}: {
  member: Member;
  isSelf: boolean;
  reports: number;
  canEdit: boolean;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  if (!canEdit) {
    return <span className="text-[13px] text-[var(--color-ink-secondary)]">View only</span>;
  }

  const active = isActiveMember(member.status);
  const blocked = active && (isSelf || reports > 0);

  function flip() {
    onError(null);
    startTransition(async () => {
      const result = await setMemberStatusAction({
        member_id: member.id,
        status: active ? "disabled" : "active",
      });
      if (result.error) onError(result.error);
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "danger" : "secondary"}
      disabled={pending || blocked}
      onClick={flip}
      title={
        isSelf
          ? "You cannot deactivate the membership you are signed in as"
          : reports > 0
            ? `${member.name} still has ${reports} direct report${reports === 1 ? "" : "s"} — move them first`
            : undefined
      }
    >
      {active ? (
        <>
          <UserMinus className="size-3.5" /> Deactivate
        </>
      ) : (
        <>
          <UserCheck className="size-3.5" /> Reactivate
        </>
      )}
    </Button>
  );
}

/* ── The screen ───────────────────────────────────────────────────────────── */

export function UsersView({
  board,
  initialTab,
}: {
  board: UsersBoard;
  initialTab: UsersTab;
}) {
  const [tab, setTab] = useState<UsersTab>(initialTab);
  const [error, setError] = useState<string | null>(null);

  const { members, reports, counts, seats, actor, canEdit } = board;
  const shown = members.filter((m) =>
    tab === "active" ? isActiveMember(m.status) : !isActiveMember(m.status),
  );

  const seatValue = seats.licensed == null ? "Unlimited" : String(seats.licensed);
  const freeValue = seats.free == null ? "Unlimited" : String(seats.free);

  return (
    <div className="flex flex-col gap-5">
      {/* The frame's three counters. "Purchased licences" is the plan's own
          `limits.users`, so the figure has a source; when a plan does not cap
          users it says Unlimited rather than printing a misleading 0. */}
      <TileGrid>
        <StatTile
          label="Licensed seats"
          value={seatValue}
          hint={seats.planName ? `${seats.planName} plan` : "No plan on file"}
          icon={<KeyRound className="size-4" />}
        />
        <StatTile
          label="Active"
          value={counts.active}
          hint={`of ${counts.total} membership${counts.total === 1 ? "" : "s"}`}
          tone={seats.over ? "warning" : "neutral"}
          icon={<Users className="size-4" />}
        />
        <StatTile
          label="Seats free"
          value={freeValue}
          hint={
            seats.over && seats.licensed != null
              ? `${counts.active - seats.licensed} over the plan`
              : "Unused licences"
          }
          tone={seats.over ? "warning" : "neutral"}
        />
        <StatTile
          label="Deactivated"
          value={counts.deactivated + counts.invited}
          hint={
            counts.invited > 0
              ? `${counts.deactivated} deactivated · ${counts.invited} invited`
              : "Kept, never deleted"
          }
        />
      </TileGrid>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<UsersTab>
          label="Which memberships to show"
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: "Active", badge: counts.active },
            {
              value: "deactivated",
              label: "Deactivated",
              badge: counts.deactivated + counts.invited,
            },
          ]}
        />
        {!canEdit && (
          <StatusChip
            tone="neutral"
            label={`View only — ${ROLE_LABELS[asMemberRole(actor.role)]}`}
          />
        )}
      </div>

      {error && (
        <p className="rounded-md border border-[var(--color-red)] bg-[var(--color-red-tint)] px-3 py-2 text-[13px] text-[var(--color-red-hover)]">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title={tab === "active" ? "Nobody is active" : "Nobody is deactivated"}
          description={
            tab === "active"
              ? "Every membership in this workspace is currently switched off."
              : "Deactivating somebody keeps their tasks, attendance and approvals — the membership is switched off, never deleted."
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Manager</Th>
                <Th numeric>Reports</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => (
                <tr
                  key={m.id}
                  className={
                    "border-b border-[var(--color-border)] last:border-0 " +
                    (i % 2 === 1 ? "bg-[var(--color-surface-sunken)]" : "")
                  }
                >
                  <Td>
                    <span className="flex items-start gap-2">
                      <Avatar name={m.name} />
                      <span className="flex flex-col">
                        <span className="font-medium">
                          {m.name}
                          {m.id === actor.id && (
                            <span className="ml-2 text-[11px] font-normal text-[var(--color-ink-secondary)]">
                              you
                            </span>
                          )}
                        </span>
                        <span className="text-[12px] text-[var(--color-ink-secondary)]">
                          {m.email ?? m.designation ?? "No email on file"}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td>
                    <StatusChip tone="neutral" label={ROLE_LABELS[asMemberRole(m.role)]} />
                  </Td>
                  <Td>
                    <StatusChip
                      tone={memberStatusTone(m.status)}
                      label={memberStatusLabel(m.status)}
                    />
                  </Td>
                  <Td>
                    <ManagerCell
                      member={m}
                      members={members}
                      canEdit={canEdit}
                      onError={setError}
                    />
                  </Td>
                  <Td numeric muted={!(reports[m.id] ?? 0)}>
                    {reports[m.id] ?? 0}
                  </Td>
                  <Td>
                    <StatusAction
                      member={m}
                      isSelf={m.id === actor.id}
                      reports={reports[m.id] ?? 0}
                      canEdit={canEdit}
                      onError={setError}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
