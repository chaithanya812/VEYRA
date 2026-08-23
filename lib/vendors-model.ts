/**
 * Client-safe vendors model — enums and types with NO server-only import, so
 * both client components (forms) and the server data module can share them.
 * The server logic lives in lib/data/vendors.ts.
 *
 * A vendor is conceptually "a Party with the vendor role" (the platform has a
 * `parties` table). v1 builds a dedicated `vendors` table; later consolidation
 * into parties+roles maps 1:1 onto these fields.
 */

/** Common construction / interior supplier categories. Seeds the category
 *  select and the list filter; stored as free text so tenants aren't boxed in. */
export const VENDOR_CATEGORIES = [
  "Hardware",
  "Plywood",
  "Laminates",
  "Electrical",
  "Plumbing",
  "Paint",
  "Tiles & Sanitary",
  "Glass & Aluminium",
  "Furniture Fittings",
  "Tools & Equipment",
  "Services & Labour",
  "Logistics & Transport",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export interface Vendor {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  category: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  /** Computed from PO/GRN history later — always null until then, never faked. */
  rating: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorRateContract {
  id: string;
  vendor_id: string;
  item_id: string | null;
  item_name: string | null;
  uom: string | null;
  /** CONFIG the user typed — never an LLM output. */
  rate: number;
  moq: number | null;
  lead_time_days: number | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
}

/** Rating display: null means "no history yet", never a zero. */
export function vendorRatingLabel(r: number | null): string {
  return r == null ? "Not rated" : `${r.toFixed(1)} ★`;
}
