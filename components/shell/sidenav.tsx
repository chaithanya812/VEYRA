"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-4 border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 overflow-y-auto">
      <div className="px-2 pb-2">
        <span className="text-xl font-bold tracking-tight text-[var(--color-ink)]">
          VEYRA
        </span>
      </div>

      {NAV.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.heading && (
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-disabled)]">
              {section.heading}
            </p>
          )}
          {section.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            if (item.soon) {
              return (
                <div
                  key={item.href}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-ink-disabled)] cursor-not-allowed select-none"
                  title="Coming soon"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="size-4" />
                    {item.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide">soon</span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--color-red-tint)] text-[var(--color-red-hover)] font-medium"
                    : "text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]",
                )}
              >
                <Icon
                  className="size-4"
                  color={active ? "var(--color-red)" : undefined}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
