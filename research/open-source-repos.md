# Open-source repos worth reading

*Organised by which module of our build each one serves. 2026-08-17*

> Licence note: check each repo before using code. Reading for architecture is always fine; copying into a commercial product is not, for GPL/AGPL projects. Frappe-ecosystem apps are typically AGPL or MIT — verify individually.

---

## WhatsApp — yes, Frappe CRM does inline chats

Answering the question directly: **Frappe CRM has a WhatsApp tab on both the Lead and Deal pages, with a real-time chat window.** Full conversation history sits against the record.

| Repo | What it gives |
|---|---|
| [shridarpatil/frappe_whatsapp](https://github.com/shridarpatil/frappe_whatsapp) | The widely used one. Meta Cloud API direct, no third party. Multi-account, two-way messaging with full conversation tracking, template management, **WhatsApp Flows**, interactive messages, notifications triggered by record events, bulk messaging with variable substitution, webhooks for delivery and read status, media (image/doc/video/audio). |
| [frappe/waba_integration](https://github.com/frappe/waba_integration) | Frappe's own WhatsApp Business Cloud API integration. Smaller scope, official. |
| `whatsapp_chat` (Frappe marketplace) | Messenger-style chat UI on top. |

**Worth reading even though we're not on Frappe.** The webhook handling, template management and status-tracking patterns are exactly what our own outbox needs, and it's a working reference for the Cloud API contract.

---

## Cutlist & nesting → Production module

This is the highest-value category for us. Cutting optimisation is genuinely hard, and it's the thing Dzylo doesn't have.

| Repo | Notes |
|---|---|
| [bozokopic/opcut](https://github.com/bozokopic/opcut) | **Best architectural fit.** Cutting-stock optimiser with multiple panels and guillotine cuts. Several back-end optimiser implementations, a CLI, **a REST service with an OpenAPI definition**, and a single-page web front end. Because it exposes an API, it can run as a service our platform calls — no need to embed it. |
| [geri1701/freecut](https://github.com/geri1701/freecut) | Rust rewrite (v2.0). Editable cut lists, **configurable kerf width**, visual previews, PDF export. Kerf handling is the detail amateur implementations always miss. |
| [mru00/cutlet](https://github.com/mru00/cutlet) | Java, guillotine panel cut optimisation. Simple and readable — good for understanding the algorithm before choosing one. |
| [gcalero/CuttingOptimizer](https://github.com/gcalero/CuttingOptimizer) | Distributes rectangular panels over one or more fixed-size sheets. |

**Recommendation:** read `cutlet` to understand guillotine cutting, then evaluate `opcut` as a callable service. Do not write a nesting algorithm from scratch — it's a well-studied 2D bin-packing problem and these are years ahead of a first attempt.

---

## Floor plans & 3D → Design module

Deferred in v1, but this is what's available when it comes back.

| Repo | Notes |
|---|---|
| [charmlinn/blueprint3d-modern](https://github.com/charmlinn/blueprint3d-modern) | **Best starting point.** TypeScript rewrite of blueprint3d, actively maintained. Drag-and-drop from a categorised furniture catalogue, resize/rotate controls, texture customisation, room templates, save/load. |
| [furnishup/blueprint3d](https://github.com/furnishup/blueprint3d) | The original, on three.js. Worth reading for its **clean separation**: `floorplanner` (2D editing), `items` (catalogue objects), `model` (shared data model), `three` (3D view). That structure is the right one to copy regardless of which library you use. |
| [theLodgeBots/open3dFloorplan](https://github.com/theLodgeBots/open3dFloorplan) | SvelteKit + Three.js. Click-to-place walls with auto-snapping, door and window styles, stairs, **auto-detected rooms**, 140+ furniture items, material editor, undo/redo. |
| [laanlabs/openPlan3D](https://github.com/laanlabs/openPlan3D) | Same lineage, **with iOS LiDAR support** — genuinely interesting for the site-measurement workflow, since an iPhone can scan a room and produce dimensions. |
| [mehanix/arcada](https://github.com/mehanix/arcada) | React + Pixi.js + Zustand interior design / floor plan creator. Closest to our stack. |
| [ekymo/homeRoughEditor](https://github.com/ekymo/homeRoughEditor) | SVG-based floor plan editor, vanilla JS. Lightweight and easy to read. |
| [CodeHole7/threejs-3d-room-designer](https://github.com/CodeHole7/threejs-3d-room-designer) | React + Three.js room planner and **product configurator** — the configurator angle is relevant to modular modules. |
| Sweet Home 3D | Desktop, Java, mature. Reference for features rather than code. |

**The auto room detection in `open3dFloorplan` and the LiDAR scanning in `openPlan3D` are the two ideas worth stealing.** Room detection gives you the Space entity for free from a drawn plan; LiDAR attacks the site-measurement variance problem that costs the client real money.

---

## ERP / CRM foundations

Covered in `COMPETITOR-AND-FOUNDATIONS.md`. Short version:

| | |
|---|---|
| [frappe/erpnext](https://github.com/frappe/erpnext) | GPL-3. Mine the **item master, UOM conversion, BOM explosion and stock valuation** models — a decade of refinement, and every trap in `PLAN.md` §4 is already solved there. |
| [frappe/crm](https://github.com/frappe/crm) | AGPL-3. Vue 3. Read its **Exotel and Twilio telephony integration** — working open-source code for the click-to-call-plus-webhook pattern, including recording. |
| [OpenConstructionERP](https://openconstructionerp.com/) | AGPL-3. Estimates, BOQ, tenders, contracts, site tasks, 120,000+ priced cost items, DWG/RVT/IFC import. **AGPL means network use triggers source disclosure** — read only. |
| [MarkoBL/AndroidCallLogSync](https://github.com/MarkoBL/AndroidCallLogSync) | GPL-3. The Android call-log sync loop, proven. Read, never copy. |

---

## What I'd actually read first

1. **ERPNext item master + UOM + BOM models** — biggest time saving, directly de-risks the hardest component in the plan.
2. **frappe/crm's Exotel integration** — settles the call-tracking implementation question with working code.
3. **opcut** — decides whether cutlist optimisation is a build or an integration.
4. **blueprint3d's module separation** — the right architecture for the design module whenever it returns.
