"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, StatusChip } from "@/components/ui/primitives";
import { capabilityTree, type CapabilityDef } from "@/lib/can-model";
import type { RoleDetail } from "@/lib/data/roles";
import {
  createRoleAction,
  deleteRoleAction,
  setCapabilityAction,
  setGroupAction,
  updateRoleAction,
} from "./actions";

/**
 * Edit Role — frames `110403` and `110413`–`110429`.
 *
 * The tree comes from `capabilityTree()` in the pure model, NOT from a shape
 * declared here. A screen that keeps its own list of permissions drifts from
 * the one `can()` checks, and the drift is invisible: a box the tenant ticks
 * that grants nothing, or a capability enforced that nobody can find.
 *
 * INHERITED capabilities render ticked but DISABLED, with the parent named.
 * Letting somebody untick an inherited box would either lie (nothing happens)
 * or silently rewrite the parent role for every other role that inherits it.
 * It is the parent's to remove, and the row says so.
 */

type Busy = { key: string } | null;

export function RoleEditor({
  roles,
  active,
  own,
  inherited,
  chainError,
  grantsAll,
  canEdit,
}: {
  roles: RoleDetail[];
  active: RoleDetail | null;
  own: string[];
  inherited: string[];
  chainError: string | null;
  grantsAll: boolean;
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const ownSet = useMemo(() => new Set(own), [own]);
  const inheritedSet = useMemo(() => new Set(inherited), [inherited]);
  const parent = active?.inherits_from
    ? (roles.find((r) => r.id === active.inherits_from) ?? null)
    : null;

  const tree = useMemo(() => {
    const q = query.trim().toLowerCase();
    const full = capabilityTree();
    if (!q) return full;
    return full
      .map((g) => ({
        group: g.group,
        parents: g.parents
          .map((p) => ({
            parent: p.parent,
            caps: p.caps.filter((c) =>
              [c.label, c.group, c.parent, c.key].some((f) => f.toLowerCase().includes(q)),
            ),
          }))
          .filter((p) => p.caps.length > 0),
      }))
      .filter((g) => g.parents.length > 0);
  }, [query]);

  const run = useCallback(
    (key: string, fn: () => Promise<{ error?: string }>) => {
      setError(null);
      setBusy({ key });
      startTransition(async () => {
        const r = await fn();
        setBusy(null);
        if (r.error) {
          setError(r.error);
          return;
        }
        // `revalidatePath` in the action invalidates the CACHE; it does not
        // re-run this client component, which still holds the grant lists it
        // was rendered with. Without this the write lands in Postgres and the
        // checkbox springs back — the worst possible feedback, because it says
        // the save failed when it succeeded.
        router.refresh();
      });
    },
    [router],
  );

  const readOnly = !canEdit || !active || active.is_system;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[260px_1fr]">
      <RoleList roles={roles} activeId={active?.id ?? null} canEdit={canEdit} onError={setError} />

      {active && (
        <div className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-card)] border border-[var(--color-red)] bg-[var(--color-red-tint)] px-3 py-2 text-sm text-[var(--color-red-hover)]"
            >
              {error}
            </p>
          )}

          {chainError && (
            <p className="rounded-[var(--radius-card)] border border-[var(--color-amber)] bg-[var(--color-amber-tint)] px-3 py-2 text-sm text-[var(--color-ink)]">
              This role&apos;s inheritance is broken ({chainError}), so it currently
              grants <strong>nothing at all</strong> — a broken chain fails closed
              rather than guessing. Fix the <em>Inherit from</em> setting below.
            </p>
          )}

          <RoleMeta
            key={active.id}
            role={active}
            roles={roles}
            readOnly={readOnly}
            onRun={run}
          />

          {active.is_system && (
            <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2 text-sm text-[var(--color-ink-secondary)]">
              <Lock className="size-4 shrink-0" />
              View only — global roles cannot be edited or deleted.
              {grantsAll && " This role grants every permission."}
            </p>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-disabled)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search permissions"
              aria-label="Search permissions"
              className="w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-disabled)]"
            />
          </div>

          {tree.length === 0 ? (
            <Card className="p-6 text-center text-sm text-[var(--color-ink-secondary)]">
              No permission matches “{query}”.
            </Card>
          ) : (
            tree.map((g) => (
              <GroupCard
                key={g.group}
                group={g.group}
                parents={g.parents}
                ownSet={ownSet}
                inheritedSet={inheritedSet}
                parentName={parent?.name ?? null}
                grantsAll={grantsAll}
                readOnly={readOnly}
                roleId={active.id}
                busyKey={busy?.key ?? null}
                onRun={run}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── The role list — Custom above, Global below (frame `110403`) ──────────── */

function RoleList({
  roles,
  activeId,
  canEdit,
  onError,
}: {
  roles: RoleDetail[];
  activeId: string | null;
  canEdit: boolean;
  onError: (m: string | null) => void;
}) {
  const custom = roles.filter((r) => !r.is_system);
  const global = roles.filter((r) => r.is_system);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-[13px] font-medium text-[var(--color-ink-secondary)]">
            Custom roles
          </span>
          {canEdit && <NewRoleButton roles={roles} onError={onError} />}
        </div>
        {custom.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-[var(--color-ink-secondary)]">
            No custom role yet. A custom role is how you give somebody less than
            their tier allows — a supervisor who sees the BOQ without its costs,
            say.
          </p>
        ) : (
          <ul>
            {custom.map((r) => (
              <RoleRow key={r.id} role={r} selected={r.id === activeId} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-4 py-3 text-[13px] font-medium text-[var(--color-ink-secondary)]">
          Global roles
        </div>
        <ul>
          {global.map((r) => (
            <RoleRow key={r.id} role={r} selected={r.id === activeId} />
          ))}
        </ul>
        <p className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-ink-secondary)]">
          View only — global roles cannot be edited or deleted.
        </p>
      </Card>
    </div>
  );
}

function RoleRow({ role, selected }: { role: RoleDetail; selected: boolean }) {
  return (
    <li>
      <a
        href={`/settings/roles?role=${role.id}`}
        aria-current={selected ? "true" : undefined}
        className={
          "block border-l-2 px-4 py-2.5 text-sm transition-colors " +
          (selected
            ? "border-[var(--color-red)] bg-[var(--color-red-tint)] font-medium text-[var(--color-red-hover)]"
            : "border-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]")
        }
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{role.name}</span>
          {role.is_system && <StatusChip tone="neutral" label="System" />}
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--color-ink-secondary)]">
          {role.userCount} {role.userCount === 1 ? "user" : "users"}
          {role.description ? ` · ${role.description}` : ""}
        </span>
      </a>
    </li>
  );
}

function NewRoleButton({
  roles,
  onError,
}: {
  roles: RoleDetail[];
  onError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inherits, setInherits] = useState("");
  const [, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New role
      </Button>
    );
  }

  return (
    <form
      className="w-full space-y-2 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        onError(null);
        startTransition(async () => {
          const r = await createRoleAction({
            name,
            description: description || undefined,
            inherits_from: inherits || null,
          });
          if (r.error) onError(r.error);
          else {
            setOpen(false);
            setName("");
            setDescription("");
            setInherits("");
            if (r.id) window.location.href = `/settings/roles?role=${r.id}`;
          }
        });
      }}
    >
      <Field label="Role name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </Field>
      <Field label="Inherit from" hint="Starts with everything that role can do.">
        <Select value={inherits} onChange={(e) => setInherits(e.target.value)}>
          <option value="">Nothing — start empty</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Create
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ── Name · Inherit From · Description (frame `110413`) ───────────────────── */

function RoleMeta({
  role,
  roles,
  readOnly,
  onRun,
}: {
  role: RoleDetail;
  roles: RoleDetail[];
  readOnly: boolean;
  onRun: (key: string, fn: () => Promise<{ error?: string }>) => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [inherits, setInherits] = useState(role.inherits_from ?? "");

  // A role may not inherit from itself; longer loops are refused by the writer,
  // which is where the whole chain is visible.
  const candidates = roles.filter((r) => r.id !== role.id);
  const dirty =
    name !== role.name ||
    description !== (role.description ?? "") ||
    inherits !== (role.inherits_from ?? "");

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
          />
        </Field>
        <Field
          label="Inherit from"
          hint="This role also gets everything the parent can do."
        >
          <Select
            value={inherits}
            onChange={(e) => setInherits(e.target.value)}
            disabled={readOnly}
          >
            <option value="">Nothing — this role stands alone</option>
            {candidates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Description"
        hint={`${description.length}/155 — what this role is for, in a sentence.`}
      >
        <Textarea
          value={description}
          maxLength={155}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
          disabled={readOnly}
        />
      </Field>

      {!readOnly && dirty && (
        <Button
          size="sm"
          onClick={() =>
            onRun("meta", () =>
              updateRoleAction({
                role_id: role.id,
                name,
                description: description || null,
                inherits_from: inherits || null,
              }),
            )
          }
        >
          Save details
        </Button>
      )}
    </Card>
  );
}

/* ── One permission group card ────────────────────────────────────────────── */

function GroupCard({
  group,
  parents,
  ownSet,
  inheritedSet,
  parentName,
  grantsAll,
  readOnly,
  roleId,
  busyKey,
  onRun,
}: {
  group: string;
  parents: { parent: string; caps: CapabilityDef[] }[];
  ownSet: Set<string>;
  inheritedSet: Set<string>;
  parentName: string | null;
  grantsAll: boolean;
  readOnly: boolean;
  roleId: string;
  busyKey: string | null;
  onRun: (key: string, fn: () => Promise<{ error?: string }>) => void;
}) {
  const [open, setOpen] = useState(true);
  const caps = parents.flatMap((p) => p.caps);
  const grantable = caps.filter((c) => !c.destructive);
  const allOn =
    grantable.length > 0 && grantable.every((c) => ownSet.has(c.key) || inheritedSet.has(c.key));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]"
        >
          <ChevronDown
            className={"size-4 transition-transform " + (open ? "" : "-rotate-90")}
            aria-hidden
          />
          {group}
        </button>
        {!readOnly && !grantsAll && (
          <button
            type="button"
            disabled={busyKey === `group:${group}`}
            onClick={() =>
              onRun(`group:${group}`, () =>
                setGroupAction({ role_id: roleId, group, on: !allOn }),
              )
            }
            className="text-[12px] font-medium text-[var(--color-ink-secondary)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline disabled:opacity-50"
          >
            {allOn ? "Disable all" : "Enable all"}
          </button>
        )}
      </div>

      {open && (
        <div className="divide-y divide-[var(--color-border)]">
          {parents.map((p) => (
            <div key={p.parent} className="px-4 py-2.5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-secondary)]">
                {p.parent}
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {p.caps.map((c) => (
                  <CapabilityRow
                    key={c.key}
                    cap={c}
                    own={ownSet.has(c.key)}
                    inherited={inheritedSet.has(c.key)}
                    parentName={parentName}
                    grantsAll={grantsAll}
                    readOnly={readOnly}
                    roleId={roleId}
                    busy={busyKey === c.key}
                    onRun={onRun}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CapabilityRow({
  cap,
  own,
  inherited,
  parentName,
  grantsAll,
  readOnly,
  roleId,
  busy,
  onRun,
}: {
  cap: CapabilityDef;
  own: boolean;
  inherited: boolean;
  parentName: string | null;
  grantsAll: boolean;
  readOnly: boolean;
  roleId: string;
  busy: boolean;
  onRun: (key: string, fn: () => Promise<{ error?: string }>) => void;
}) {
  const checked = grantsAll || own || inherited;
  // Inherited is ticked but LOCKED: it is the parent's grant to remove, and a
  // box that appears to revoke something it cannot is worse than a locked one.
  const locked = readOnly || grantsAll || (inherited && !own);

  return (
    <li className="flex items-start gap-2">
      <input
        id={cap.key}
        type="checkbox"
        checked={checked}
        disabled={locked || busy}
        onChange={(e) =>
          onRun(cap.key, () =>
            setCapabilityAction({
              role_id: roleId,
              capability: cap.key,
              on: e.target.checked,
            }),
          )
        }
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-red)] disabled:opacity-60"
      />
      <label htmlFor={cap.key} className="min-w-0 text-[13px] text-[var(--color-ink)]">
        {cap.label}
        {cap.destructive && (
          <span className="ml-1.5 align-middle">
            <StatusChip tone="neutral" label="Destructive" />
          </span>
        )}
        {inherited && !own && (
          <span className="block text-[11px] text-[var(--color-ink-secondary)]">
            Inherited{parentName ? ` from ${parentName}` : ""} — remove it there
          </span>
        )}
      </label>
    </li>
  );
}

/* ── Delete, for a custom role nobody holds ───────────────────────────────── */

export function DeleteRoleButton({ role }: { role: RoleDetail }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await deleteRoleAction({ role_id: role.id });
            if (r.error) setError(r.error);
            else window.location.href = "/settings/roles";
          });
        }}
      >
        <Trash2 className="size-4" /> Delete role
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-red-hover)]">
          {error}
        </p>
      )}
    </div>
  );
}
