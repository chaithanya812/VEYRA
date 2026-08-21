# Dzylo, and what to build on

*Competitor analysis + open-source foundations. 2026-08-17*

---

## 1. What Dzylo actually is

An AI-positioned business management platform for interior designers, architects and contractors. Operating across India, UAE, Qatar, Portugal, Malaysia and Uganda.

**Their modules:**

| | |
|---|---|
| Lead Management | Multi-channel capture, assignment, tracking |
| Quotation Generator | Material, labour and tax breakdowns |
| Project Management | Tasks, teams, progress, budget control |
| Procurement | Suppliers, purchase orders, delivery tracking |
| Invoice Generator | Financial documents |
| **Client App** | Branded mobile app for progress tracking and approvals |
| Attendance | Geolocation-based |
| Inventory Control | Real-time stock |
| Expense & Finance Approvals | Financial workflow |
| **WhatsApp Automation** | Meta-verified Business API |
| Virtual Tour | 3D |
| **Imagino AI** | AI designer canvas |
| **Supplier Ecosystem** | Network of verified material suppliers |
| Dzylo Dialer | Separate Android app for call tracking |

**No downloadable or open-source version exists** — it's closed commercial SaaS. Which is fine, because reverse-engineering it would be aiming at the wrong target anyway. See §4.

## 2. What Dzylo does NOT have — and this is the whole point

Read that list again against the client's own business. Dzylo is **CRM + project + quotation software for design firms**. It stops where the factory starts.

Missing entirely:

- **BOM explosion** from a quoted scope item into actual materials
- **Cutlist generation** — roomwise, panel-wise, with edge-band and grain rules
- **Sheet nesting / cutting optimisation** and wastage reporting
- **Panel-level QR traceability** — cut → edgebanded → drilled → QC → packed → dispatched → installed
- **Work centers, job routing, factory capacity**
- **CNC/DXF export**
- **Site measurement variance** — measured vs quoted, triggering a priced revision
- **Modular module configurator** with parametric dimensional rules
- **Rate basis** per sq ft of shutter area / per running ft / per panel

That gap is not an oversight on their part. It's a different product. Dzylo serves the *designer*; the client's own business is **modular manufacturing**, where the money is made and lost in the factory and on site.

**So the answer to "am I building a duplicate?" is no — not unless you choose to.** The overlap is CRM, quotations and projects, which is table stakes everybody has. The wedge is everything downstream of the quote, and it's the half nobody in this market has built.

Worth copying from them regardless: the **branded client app** (high perceived value, low build cost) and the **supplier ecosystem** (a genuine moat that gets stronger with scale).

## 3. Open-source foundations — the real find

There is no free Dzylo. There is something considerably more useful.

### ERPNext (Frappe) — GPL-3.0

India's largest open-source project, built by an Indian company, so **GST is native rather than bolted on**. 30+ modules, and the overlap with the v1 plan is close to total:

| Our v1 module | ERPNext ships |
|---|---|
| Platform & Admin | Users, roles, permissions, custom fields, workflows, multi-company |
| Master Data & Catalogue | Item master, variants, **UOM conversions**, price lists |
| CRM & Sales | Leads, opportunities, pipeline |
| Estimation & Quotation | Quotations, sales orders |
| Projects | Tasks, timelines, resource allocation |
| Procurement | RFQ, purchase orders, supplier management |
| Inventory | Multi-warehouse, movements, valuation |
| Production | **BOM, work orders, subcontracting, quality** |
| Finance & Billing | Full accounting + **India Compliance: GST returns, TDS, e-Way Bill, HSN/SAC** |
| Reporting | Report builder, dashboards |

That is roughly **twelve to eighteen months of undifferentiated work**, already built, tested over a decade, and free.

### Others worth knowing

- **OpenConstructionERP** — construction-specific: estimates, BOQ, tenders, contracts, site tasks, 120,000+ priced cost items, DWG/RVT/IFC import, AI PDF takeoff. **AGPL-3.0** — see the licence warning below.
- **Odoo** — CRM, sales, projects, invoicing, inventory, manufacturing. Large ecosystem; community edition is materially thinner than enterprise.
- **Dolibarr** — ERP/CRM for small businesses. Lighter, less depth.
- **OpenProject / Redmine / Tuleap** — project management only, no commercial or manufacturing depth.

### The licence trap — read this before deciding

**GPL-3.0 (ERPNext)** is triggered by *distribution*. Running modified software as a hosted SaaS is generally not distribution, which is why a commercial SaaS on ERPNext is a viable model.

**AGPL-3.0 (OpenConstructionERP)** closes exactly that gap — network use counts, so offering it as a service **does** trigger the obligation to publish source.

That distinction decides whether a codebase is usable as a commercial foundation. **Get a lawyer to confirm before committing** — I'm describing the licences, not giving legal advice.

## 4. The decision this creates

This is a genuine fork for the whole project, and bigger than any module decision in `PLAN.md`.

**Option A — build fresh on Next.js + Supabase** *(the current plan)*
Full control of the data model and UX, modern stack the team already knows, and the product feels like a 2026 SaaS product. Cost: you build accounting, stock valuation, GST returns, multi-company and the BOM engine yourself — a year or more of work that differentiates nothing.

**Option B — build on ERPNext/Frappe**
Seventy percent exists on day one, including Indian GST. You write interior-specific Frappe apps on top. Cost: a Python/Frappe stack the team doesn't use, and ERPNext's interface is enterprise-shaped and dated — a real problem when the buyer is a small interior firm choosing on how the product feels.

### My recommendation: neither purely — take Option A, but mine ERPNext's data model

Build fresh, because for an SMB design-led buyer the UX *is* the product and inheriting ERPNext's interface undermines the thing you're selling.

But **read ERPNext's schema before designing yours.** Their item master, UOM conversion, BOM explosion and stock valuation models have been refined over a decade against thousands of real businesses, and every trap identified in `PLAN.md` §4 — multi-UOM, variants, valuation, batch tracking — is already solved there. Reading those models is worth weeks of design time and costs nothing.

Use it as a **reference architecture, not a foundation.**

The exception: if speed to first paying tenant matters more than product feel, Option B is genuinely faster and that trade is defensible. Decide it deliberately rather than by default.

---

## Sources

- [Dzylo](https://dzylo.ai/) · [Dzylo Dialer on Google Play](https://play.google.com/store/apps/details?id=com.dzylo)
- [ERPNext modules](https://frappe.io/erpnext/modules) · [ERPNext for India](https://frappe.io/erpnext/india) · [GST features in ERPNext](https://docs.frappe.io/erpnext/v13/user/manual/en/regional/india/gst-setup)
- [Open source construction management tools 2026](https://www.fuzen.io/posts/open-source-construction-management-software) · [OpenConstructionERP](https://openconstructionerp.com/)
