import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Building2,
  Hash,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { Card, PageHeader, StatusChip } from "@/components/ui/primitives";

/**
 * The one config surface (DESIGN-DIRECTION §7 — no "old" duplicate tiles).
 * Live layers link through; unbuilt layers are shown as grey disabled
 * "soon" cards so the surface mirrors the real product shape.
 */

interface ConfigCard {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

const LIVE_CARDS: ConfigCard[] = [
  {
    title: "Numbering series",
    description:
      "Document prefixes, Indian FY segments and zero-padding for quotations, RFQs, POs, GRNs and invoices.",
    icon: Hash,
    href: "/settings/numbering",
  },
  {
    title: "Users",
    description:
      "Who has a seat, who is deactivated, and who reports to whom — the reporting line that decides whose leave lands on whose desk.",
    icon: UserCog,
    href: "/settings/users",
  },
  {
    title: "Roles & permissions",
    description:
      "One matrix per role: view, create, edit, delete, approve — each grant scoped to own, team, branch or org.",
    icon: ShieldCheck,
    href: "/settings/roles",
  },
  {
    title: "Workspace & people",
    description:
      "Who works here, and every dropdown the app offers them — task types, expense categories, leave types, lead sources, budget bands and more.",
    icon: Users,
    href: "/settings/workspace",
  },
  {
    title: "Quotations",
    description:
      "Default GST rate, margin and validity; the terms & conditions library; the AI prompt library and its activity log.",
    icon: FileText,
    href: "/settings/quotations",
  },
];

const SOON_CARDS: ConfigCard[] = [
  {
    title: "Branches & teams",
    description:
      "Branch master, team grouping and default assignment for new records.",
    icon: Building2,
  },
  {
    title: "Company profile",
    description:
      "Legal name, GSTIN, logo and the footer used across exported PDFs.",
    icon: Briefcase,
  },
  {
    title: "Field visibility",
    description:
      "Hide cost columns per role on site-facing screens — design the hidden state, not a broken layout.",
    icon: SlidersHorizontal,
  },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Settings"
        subtitle="Workspace-wide configuration — how documents are numbered and who can do what"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {LIVE_CARDS.map((card) => (
          <Link key={card.title} href={card.href!} className="group h-full">
            <Card className="h-full p-5 transition-colors group-hover:border-[var(--color-border-strong)]">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-md bg-[var(--color-surface-sunken)] text-[var(--color-ink)]">
                  <card.icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-[var(--color-ink-disabled)] transition-colors group-hover:text-[var(--color-ink)]" />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-[var(--color-ink)]">
                {card.title}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-secondary)]">
                {card.description}
              </p>
            </Card>
          </Link>
        ))}

        {SOON_CARDS.map((card) => (
          <div key={card.title} className="h-full cursor-not-allowed opacity-60">
            <Card className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-md bg-[var(--color-surface-sunken)] text-[var(--color-ink-secondary)]">
                  <card.icon className="size-4" />
                </span>
                <StatusChip tone="neutral" label="Soon" />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-[var(--color-ink)]">
                {card.title}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-secondary)]">
                {card.description}
              </p>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
