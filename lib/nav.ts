import type { LucideIcon } from "lucide-react";
import {
  BadgeIndianRupee,
  BarChart3,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderKanban,
  HardHat,
  Image,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  LineChart,
  Package,
  Phone,
  Ruler,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  Factory,
  Briefcase,
  CalendarCheck,
} from "lucide-react";

/**
 * The module map — a two-level tree, not a flat list.
 *
 * The owner's instruction (PLAN-V4 §2): *"do you see how execution … has
 * projects, it has project insights and MB sheets. I need you to do it in that
 * way … sales has leads, lead management, and follow-ups. You got to create
 * these kind of top-down menus."* Forty modules under five static headings is
 * a wall; six collapsible groups is a map.
 *
 * Red discipline (DESIGN-DIRECTION §2): the active *child* is red — that is
 * "active navigation", one of red's five jobs. The active *parent* is
 * ink-black. Exactly one thing in the rail is red at a time.
 */

export interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
  /** false = built and reachable; true = shown disabled with a "soon" chip. */
  soon?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

export const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },

  {
    id: "sales",
    label: "Sales",
    icon: Briefcase,
    items: [
      { label: "Lead Management", href: "/leads", icon: Users },
      { label: "Lead Insights", href: "/leads/insights", icon: LineChart },
      // The Kanban is being replaced by a funnel over a grouped table
      // (PLAN-V4 §6). It stays in the rail meanwhile — a live screen that
      // nothing links to is worse than one that is about to change.
      { label: "Pipeline", href: "/pipeline", icon: KanbanSquare },
      { label: "Follow-ups", href: "/followups", icon: CalendarClock },
      { label: "Quotations", href: "/quotations", icon: FileText },
      { label: "Communication", href: "/communication", icon: Phone },
    ],
  },

  {
    id: "execution",
    label: "Execution",
    icon: HardHat,
    items: [
      { label: "Projects", href: "/projects", icon: FolderKanban },
      {
        label: "Project Insights",
        href: "/projects/insights",
        icon: BarChart3,
        soon: true,
      },
      // Kept visible on the owner's instruction, deliberately inert: neither
      // has a spec yet, and the rail should show the real product shape rather
      // than pretend these do not exist (PLAN-V4 §14.2/§14.3).
      { label: "MB Sheets", href: "/projects/mb-sheets", icon: Ruler, soon: true },
      { label: "2D → 3D Renders", href: "/projects/renders", icon: Boxes, soon: true },
      { label: "Site", href: "/site", icon: HardHat },
      { label: "Production", href: "/production", icon: Factory },
      { label: "Design", href: "/design", icon: Image },
    ],
  },

  {
    id: "operations",
    label: "Operations",
    icon: ShoppingCart,
    items: [
      // Requests / RFQ / Orders / Acceptance become sub-tabs of /procurement in
      // PLAN-V4 §10.1. Until they do, RFQ and Orders keep their own entries so
      // the shipped screens stay reachable.
      { label: "Procurement", href: "/procurement", icon: ClipboardList },
      { label: "RFQ", href: "/rfq", icon: ClipboardCheck },
      { label: "Orders", href: "/orders", icon: ShoppingCart },
      { label: "Inventory", href: "/inventory", icon: Boxes },
      { label: "Vendors", href: "/vendors", icon: Truck },
      { label: "Items", href: "/items", icon: Package },
    ],
  },

  {
    id: "accounting",
    label: "Accounting",
    icon: Landmark,
    items: [
      { label: "Finance", href: "/finance", icon: Landmark },
      // The company-wide money matrix (PLAN-V4 §12.1). It sits above Billing
      // because it is the screen a principal opens first: every project's
      // receivables and payables on one row each, with a drill-through into the
      // project it came from.
      { label: "Payments Dashboard", href: "/finance/payments", icon: BadgeIndianRupee },
      { label: "Billing", href: "/billing", icon: Wallet },
      {
        label: "Account Receivables",
        href: "/finance/receivables",
        icon: BadgeIndianRupee,
        soon: true,
      },
    ],
  },

  {
    id: "hr",
    label: "HR",
    icon: CalendarCheck,
    items: [
      { label: "Attendance", href: "/hr/attendance", icon: CalendarCheck },
      // Role-gated rather than hidden: HR is "the same screens, plus the
      // approver's controls" (PLAN-V4 §11), and the page itself refuses a
      // non-manager with an explanation. A rail that quietly dropped the
      // entry would leave a manager unable to find the queue at all.
      { label: "Approvals", href: "/hr/attendance/admin", icon: CheckCircle2 },
    ],
  },

  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    items: [
      // Two entries, not one "Users & Roles": people and permissions are
      // separate screens now that the reporting line is a real column, and a
      // single label that lands on only one of them hides the other.
      { label: "Users", href: "/settings/users", icon: UserCog },
      { label: "Roles & permissions", href: "/settings/roles", icon: ShieldCheck },
      { label: "Approvals", href: "/approvals", icon: CheckCircle2 },
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/**
 * Longest-prefix match, so `/leads/insights` lights Lead Insights rather than
 * also lighting Lead Management. Returns the href of the one active leaf.
 */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  const consider = (href: string) => {
    if (pathname === href || pathname.startsWith(href + "/")) {
      if (!best || href.length > best.length) best = href;
    }
  };
  for (const entry of NAV) {
    if (isGroup(entry)) entry.items.forEach((i) => consider(i.href));
    else consider(entry.href);
  }
  return best;
}

/** The group that owns the current route — it auto-expands. */
export function activeGroupId(pathname: string): string | null {
  const href = activeHref(pathname);
  if (!href) return null;
  for (const entry of NAV) {
    if (isGroup(entry) && entry.items.some((i) => i.href === href)) return entry.id;
  }
  return null;
}
