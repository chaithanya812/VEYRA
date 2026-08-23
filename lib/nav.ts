import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderKanban,
  ShoppingCart,
  Boxes,
  Wallet,
  Factory,
  Package,
  Truck,
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
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, soon: true }],
  },
  {
    heading: "Sales",
    items: [
      { label: "Leads", href: "/leads", icon: Users },
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
      { label: "Inventory", href: "/inventory", icon: Boxes, soon: true },
      { label: "Production", href: "/production", icon: Factory, soon: true },
    ],
  },
  {
    heading: "Finance",
    items: [{ label: "Billing", href: "/billing", icon: Wallet }],
  },
  {
    heading: "Admin",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];
