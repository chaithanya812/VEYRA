import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUsersBoard } from "@/lib/data/team";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { UsersView, type UsersTab } from "./users-view";

/**
 * Users (PLAN-V4 §11, frame `110349`) — the people in this workspace, and the
 * reporting line as a real column rather than a label.
 *
 * THE TAB IS RESOLVED HERE, on the server, from `?tab=`. A client component
 * that picked it in an effect would server-render the Active list for a
 * `?tab=deactivated` link, which makes the deactivated half unverifiable by
 * fetching HTML and lands a shared link on the wrong table.
 *
 * This is not a second People editor. Display names, designations and role
 * tiers are still edited on Workspace & people; this screen owns the seat
 * count, the membership status and `org_members.manager_id`, and links there
 * rather than growing a duplicate set of fields.
 */

const TABS: UsersTab[] = ["active", "deactivated"];

function tabOf(value: string | undefined): UsersTab {
  return (TABS as string[]).includes(String(value)) ? (value as UsersTab) : "active";
}

export default async function UsersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const board = await getUsersBoard();

  const managed = Object.values(board.reports).filter((n) => n > 0).length;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Back to settings
      </Link>

      <PageHeader
        title="Users"
        subtitle={`${board.counts.active} active · ${
          managed === 0
            ? "no reporting line set yet"
            : `${managed} ${managed === 1 ? "person has" : "people have"} direct reports`
        }`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/settings/workspace">
              <Button variant="secondary" size="sm">
                Names &amp; roles
              </Button>
            </Link>
            <Link href="/settings/roles">
              <Button variant="secondary" size="sm">
                Roles &amp; permissions
              </Button>
            </Link>
          </div>
        }
      />

      <UsersView board={board} initialTab={tabOf(tab)} />

      <Card className="mt-5 p-4">
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-secondary)]">
          A manager here is the person who approves this member&rsquo;s leave and
          work-from-home requests, so the picker refuses a loop: nobody may manage
          themselves, and nobody may report to somebody who already reports to
          them. Date of birth, mobile number and last-login are not shown because
          nothing stores them &mdash; four columns of &ldquo;&mdash;&rdquo; would
          suggest the data exists and is merely missing. Adding a person needs an
          invite flow that login has not returned for yet.
        </p>
      </Card>
    </div>
  );
}
