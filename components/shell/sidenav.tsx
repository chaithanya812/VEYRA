"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  NAV,
  activeGroupId,
  activeHref,
  isGroup,
  type NavGroup,
  type NavLeaf,
} from "@/lib/nav";
import { MODULE_COLOR } from "@/lib/palette";
import { cn } from "@/lib/utils";

/**
 * The rail.
 *
 * Two levels, accordion: one group open at a time, and the group that owns the
 * current route opens itself. Forty modules under five static headings was a
 * wall to scroll; this is a map you can hold in your head (PLAN-V4 §2).
 *
 * Red is spent on exactly one thing here — the active child. The open parent is
 * ink-black, so the rail never has two red things competing
 * (DESIGN-DIRECTION §2).
 *
 * Collapse state rides a cookie so the server renders the right width on the
 * first paint; which group is open is local UI state and lives in
 * localStorage, never the DB.
 */

const GROUP_KEY = "veyra.nav.group";
const COLLAPSE_COOKIE = "veyra_nav_collapsed";

export function SideNav({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const pathname = usePathname();
  const href = activeHref(pathname);
  const activeGroup = activeGroupId(pathname);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [openId, setOpenId] = useState<string | null>(activeGroup);

  // On a route change the owning group opens itself. On Dashboard (no owning
  // group) whatever the user last opened is restored instead.
  useEffect(() => {
    if (activeGroup) {
      setOpenId(activeGroup);
      return;
    }
    try {
      const stored = window.localStorage.getItem(GROUP_KEY);
      if (stored) setOpenId(stored);
    } catch {
      /* private mode / storage disabled — the rail just starts closed. */
    }
  }, [activeGroup]);

  const toggleGroup = useCallback((id: string) => {
    setOpenId((prev) => {
      const next = prev === id ? null : id;
      try {
        if (next) window.localStorage.setItem(GROUP_KEY, next);
        else window.localStorage.removeItem(GROUP_KEY);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <nav
      aria-label="Modules"
      className={cn(
        "flex shrink-0 flex-col gap-1 overflow-y-auto overflow-x-visible border-r border-[var(--color-border)] bg-[var(--color-surface)] py-4 transition-[width] duration-150",
        collapsed ? "w-16 px-2" : "w-60 px-3",
      )}
    >
      <div
        className={cn(
          "flex items-center pb-3",
          collapsed ? "justify-center" : "justify-between px-2",
        )}
      >
        {!collapsed && (
          <span className="text-xl font-bold tracking-tight text-[var(--color-ink)]">
            VEYRA
          </span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="rounded-md p-1.5 text-[var(--color-ink-secondary)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      {NAV.map((entry) =>
        isGroup(entry) ? (
          <Group
            key={entry.id}
            group={entry}
            open={openId === entry.id}
            collapsed={collapsed}
            activeHref={href}
            onToggle={toggleGroup}
          />
        ) : (
          <Leaf
            key={entry.href}
            item={entry}
            active={href === entry.href}
            collapsed={collapsed}
          />
        ),
      )}
    </nav>
  );
}

/* ── Group ────────────────────────────────────────────────────────────────── */

function Group({
  group,
  open,
  collapsed,
  activeHref: current,
  onToggle,
}: {
  group: NavGroup;
  open: boolean;
  collapsed: boolean;
  activeHref: string | null;
  onToggle: (id: string) => void;
}) {
  const Icon = group.icon;
  const owns = group.items.some((i) => i.href === current);

  // Collapsed rail: the group is an icon, and its children arrive in a flyout
  // on hover or keyboard focus. Nothing becomes unreachable at 64px.
  if (collapsed) {
    return (
      <div className="group/nav relative">
        <button
          type="button"
          aria-label={group.label}
          title={group.label}
          className={cn(
            "flex w-full items-center justify-center rounded-md p-2.5 transition-colors",
            owns
              ? "bg-[var(--color-surface-sunken)] text-[var(--color-ink)]"
              : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]",
          )}
        >
          <Icon className="size-4" style={{ color: MODULE_COLOR[group.id] }} />
        </button>
        <div className="invisible absolute left-full top-0 z-50 ml-1 w-56 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 opacity-0 shadow-lg transition-opacity group-focus-within/nav:visible group-focus-within/nav:opacity-100 group-hover/nav:visible group-hover/nav:opacity-100">
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-disabled)]">
            {group.label}
          </p>
          {group.items.map((item) => (
            <Leaf
              key={item.href}
              item={item}
              active={current === item.href}
              collapsed={false}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        aria-expanded={open}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors",
          // The open/owning parent is ink-black and medium — never red. Red in
          // the rail means "you are here", and that is the child's job.
          owns || open
            ? "font-medium text-[var(--color-ink)]"
            : "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]",
          "hover:bg-[var(--color-surface-sunken)]",
        )}
      >
        <span className="flex items-center gap-2.5">
          {/* Module identity colour (PLAN-V4 §4.3) — it makes six groups
              scannable at a glance and costs red nothing. */}
          <Icon
            className="size-4 shrink-0"
            style={{ color: MODULE_COLOR[group.id] }}
          />
          {group.label}
        </span>
        <span className="flex items-center gap-1.5">
          {/* A closed group still says something is live inside it. */}
          {!open && owns && (
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[var(--color-red)]"
            />
          )}
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-[var(--color-ink-disabled)] transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="ml-[19px] flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-2 pt-0.5">
          {group.items.map((item) => (
            <Leaf
              key={item.href}
              item={item}
              active={current === item.href}
              collapsed={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Leaf ─────────────────────────────────────────────────────────────────── */

function Leaf({
  item,
  active,
  collapsed,
}: {
  item: NavLeaf;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  // "Soon" is shown, not hidden: the rail should describe the real product
  // shape, and a module that quietly does not exist is harder to plan around
  // than one that says so.
  if (item.soon) {
    return (
      <div
        aria-disabled
        title={`${item.label} — coming soon`}
        className={cn(
          "flex cursor-not-allowed select-none items-center gap-2.5 rounded-md py-2 text-sm text-[var(--color-ink-disabled)]",
          collapsed ? "justify-center px-2.5" : "justify-between px-2",
        )}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="size-4 shrink-0" />
          {!collapsed && item.label}
        </span>
        {!collapsed && (
          <span className="rounded-full bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            soon
          </span>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md py-2 text-sm transition-colors",
        collapsed ? "justify-center px-2.5" : "px-2",
        active
          ? "bg-[var(--color-red-tint)] font-medium text-[var(--color-red-hover)]"
          : "text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active && "text-[var(--color-red)]")}
      />
      {!collapsed && item.label}
    </Link>
  );
}
