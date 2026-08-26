import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Phone,
  KanbanSquare,
  CalendarClock,
  FileText,
  FolderKanban,
  ShoppingCart,
  Boxes,
  Wallet,
  Factory,
  Package,
  Truck,
  ClipboardList,
  ClipboardCheck,
  Landmark,
  Image,
  BarChart3,
  HardHat,
  CheckCircle2,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** false = built and reachable; true = placeholder, shown disabled. */
  soon?: boolean;
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

/**
 * The module map. Only Leads is wired to real data in this foundation build;
 * the rest are shown disabled ("soon") so the shell reflects the real product
 * shape without faking functionality. Each becomes a slice as features land.
 */
export const NAV: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    heading: "Sales",
    items: [
      { label: "Lead Management", href: "/leads", icon: Users },
      { label: "Pipeline", href: "/pipeline", icon: KanbanSquare },
      { label: "Follow-ups", href: "/followups", icon: CalendarClock },
      { label: "Communication", href: "/communication", icon: Phone },
      { label: "Quotations", href: "/quotations", icon: FileText },
    ],
  },
  {
    heading: "Catalogue",
    items: [{ label: "Items", href: "/items", icon: Package }],
  },
  {
    heading: "Operations",
    items: [
      { label: "Vendors", href: "/vendors", icon: Truck },
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Procurement", href: "/procurement", icon: ShoppingCart },
      { label: "RFQ", href: "/rfq", icon: ClipboardList },
      { label: "Orders", href: "/orders", icon: ClipboardCheck },
      { label: "Inventory", href: "/inventory", icon: Boxes },
      { label: "Design", href: "/design", icon: Image },
      { label: "Site", href: "/site", icon: HardHat },
      { label: "Production", href: "/production", icon: Factory },
    ],
  },
  {
    heading: "Finance",
    items: [
      { label: "Finance", href: "/finance", icon: Landmark },
      { label: "Billing", href: "/billing", icon: Wallet },
    ],
  },
  {
    heading: "Admin",
    items: [
      { label: "Approvals", href: "/approvals", icon: CheckCircle2 },
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
