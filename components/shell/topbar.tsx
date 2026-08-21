import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function TopBar({
  orgName,
  userEmail,
}: {
  orgName: string;
  userEmail: string | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
      <span className="text-sm font-semibold text-[var(--color-ink)]">
        {orgName}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--color-ink-secondary)]">
          {userEmail}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
