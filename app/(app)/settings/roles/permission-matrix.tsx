"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  MODULE_LABELS,
  SCOPES,
  SCOPE_LABELS,
  type Permission,
  type PermissionAction,
  type PermissionModule,
  type PermissionScope,
} from "@/lib/permissions-model";
import {
  removePermissionAction,
  setPermissionAction,
} from "../actions";
import { Card } from "@/components/ui/primitives";

/**
 * The permission matrix for ONE role: rows = modules, columns = actions.
 * Each cell is a neutral checkbox (red is reserved — DESIGN-DIRECTION §2);
 * when granted, a small scope select appears beneath it. Toggles call the
 * server actions directly and reconcile with fresh props after revalidation.
 */

type GrantKey = string; // `${module}:${action}`

const keyOf = (module: PermissionModule, action: PermissionAction): GrantKey =>
  `${module}:${action}`;

function seedGrants(permissions: Permission[]): Record<GrantKey, PermissionScope> {
  const grants: Record<GrantKey, PermissionScope> = {};
  for (const p of permissions) {
    if ((SCOPES as readonly string[]).includes(p.scope)) {
      grants[keyOf(p.module, p.action)] = p.scope as PermissionScope;
    }
  }
  return grants;
}

export function PermissionMatrix({
  roleId,
  roleName,
  permissions,
}: {
  roleId: string;
  roleName: string;
  permissions: Permission[];
}) {
  const [grants, setGrants] = useState<Record<GrantKey, PermissionScope>>(() =>
    seedGrants(permissions),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // After each write the action revalidates the path and this component
  // receives fresh props — resync so server state stays the source of truth.
  useEffect(() => {
    setGrants(seedGrants(permissions));
    setError(null);
  }, [permissions]);

  const grantedCount = useMemo(() => Object.keys(grants).length, [grants]);

  function grant(module: PermissionModule, action: PermissionAction, scope: PermissionScope) {
    setError(null);
    setGrants((prev) => ({ ...prev, [keyOf(module, action)]: scope }));
    startTransition(async () => {
      const result = await setPermissionAction({
        role_id: roleId,
        module,
        action,
        scope,
      });
      if (result.error) setError(result.error);
    });
  }

  function revoke(module: PermissionModule, action: PermissionAction) {
    const key = keyOf(module, action);
    setError(null);
    setGrants((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    startTransition(async () => {
      const result = await removePermissionAction({
        role_id: roleId,
        module,
        action,
      });
      if (result.error) setError(result.error);
    });
  }

  const th =
    "sticky top-0 z-10 bg-[var(--color-surface-sunken)] px-3 py-3 text-left text-[13px] font-medium text-[var(--color-ink-secondary)]";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-medium text-[var(--color-ink)]">
          {roleName}
          <span className="ml-2 text-[13px] font-normal text-[var(--color-ink-secondary)]">
            {grantedCount} grant{grantedCount === 1 ? "" : "s"}
          </span>
        </h2>
        {pending && (
          <span className="text-xs text-[var(--color-ink-secondary)]">
            Saving…
          </span>
        )}
      </div>

      {error && (
        <p className="border-b border-[var(--color-border)] bg-[var(--color-red-tint)] px-4 py-2 text-[13px] text-[var(--color-red-hover)]">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left">
              <th className={th}>Module</th>
              {ACTIONS.map((a) => (
                <th key={a} className={`${th} w-24`}>
                  {ACTION_LABELS[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m, i) => (
              <tr
                key={m}
                className={
                  "border-b border-[var(--color-border)] last:border-0 " +
                  (i % 2 === 1 ? "bg-[var(--color-surface-sunken)]" : "")
                }
              >
                <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">
                  {MODULE_LABELS[m]}
                </td>
                {ACTIONS.map((a) => {
                  const key = keyOf(m, a);
                  const has = key in grants;
                  return (
                    <td key={a} className="px-3 py-2.5 align-top">
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="checkbox"
                          checked={has}
                          disabled={pending}
                          onChange={() =>
                            has ? revoke(m, a) : grant(m, a, "org")
                          }
                          aria-label={`${ACTION_LABELS[a]} ${MODULE_LABELS[m]}`}
                          className="size-4 accent-[var(--color-ink)]"
                        />
                        {has && (
                          <select
                            value={grants[key]}
                            disabled={pending}
                            onChange={(e) =>
                              grant(m, a, e.target.value as PermissionScope)
                            }
                            aria-label={`Scope for ${ACTION_LABELS[a]} ${MODULE_LABELS[m]}`}
                            className="h-7 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-1.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-red)] outline-none"
                          >
                            {SCOPES.map((s) => (
                              <option key={s} value={s}>
                                {SCOPE_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-ink-secondary)]">
        Scope — Own: records the user created · Team: their team · Branch:
        their branch · Org: everything in the organisation. New grants default
        to Org.
      </p>
    </Card>
  );
}
