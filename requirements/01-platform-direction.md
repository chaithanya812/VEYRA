# REQ-01 — Platform direction

**Source:** Client, verbatim. The founding brief for the whole re-platform.
**Status:** Accepted. This is the north star.

---

## Client's message

> Hi, I'm thinking of making a bigger shift in the direction of the platform.
>
> Instead of developing it mainly for our own internal work, I want us to build it as a complete B2B SaaS platform for the entire construction, architecture, interior and furniture industry.
>
> It should not be limited to dealers. The platform should eventually work for:
>
> - Builders & Developers
> - Contractors
> - Architects
> - Interior Designers
> - Turnkey Interior Companies
> - Modular Furniture Businesses
> - Modular Kitchen/Wardrobe Dealers
> - Furniture Factories & Manufacturers
> - Carpenters
> - Vendors & Suppliers
> - Site/Project Management Teams
> - Other related businesses
>
> The idea is to cover the complete journey — building/construction → architecture → interior design → estimation & quotation → procurement → modular/furniture manufacturing → site execution → billing → handover, with different modules and workflows depending on the type of business using the platform.
>
> For now, I think we should not spend too much time on AI features. If WhatsApp AI, AI calling, AI agents, automated conversations or any other AI integration is taking too much development time or becoming difficult, we can skip those features in the first version and add them later.
>
> I would rather first make the core SaaS platform, CRM, quotations, estimation, project management, team management, operations, procurement, production and billing extremely strong and stable.
>
> Also, wherever AI is actually required in the platform, please use Claude only for now. I don't want other AI models integrated unless we discuss it first, because I haven't been satisfied with the results we've received from the alternatives.
>
> Our own company can use the platform as one account, but the architecture should be multi-company and scalable from the beginning, so different types of businesses can subscribe and configure the platform according to their work.
>
> I'll give you a complete deep-detailed draft of the entire workflow along with a master development prompt. That will explain every user type, feature, calculation, quotation system, CRM, project workflow, production, procurement, team roles, permissions and other requirements.
>
> So before doing major additional development, please keep this broader direction in mind. I want us to build a serious industry SaaS product rather than software made only around our own current workflow.

---

## What this pins down

| Requirement | Implication |
|---|---|
| 12 business types, one platform | Industry profiles as a configuration layer, not 12 products |
| Complete journey, construction → handover | The Scope Item spine — one record flowing through every module |
| "Different modules and workflows depending on the type of business" | Module registry + per-profile workflow config |
| **"Multi-company and scalable from the beginning"** | Tenancy is a Wave 0 data-layer requirement, not a later feature |
| Their own company as one account | They become tenant #1; no special-casing |
| AI de-prioritised, skippable in v1 | Core modules first. Existing AI stays gated, not removed. |
| **Claude only** | No other model providers without explicit discussion |

## Open thread

The client promised "a complete deep-detailed draft of the entire workflow along with a master development prompt." **As of 2026-08-17 this has not arrived.** Planning proceeded without it, structured so that when it lands it acts as a validation and gap-check pass rather than forcing a restart.
