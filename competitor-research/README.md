# competitor-research/

A frame-by-frame teardown of **Dzylo** — the closest competitor to VEYRA — built from
two of their product-demo videos that a prior Gemini pass had already timestamped and
screenshotted. The output feeds VEYRA's specification (PLAN-v0.2), especially the
Procurement, Inventory, CRM, Finance and Estimation modules that PLAN-v0.1 left thin.

---

## ⛔ Before you touch the database: RLS is OFF

> **Row-Level Security is OFF on the Supabase project `vjupynmjzpdzrluwctzd`, by the
> owner's decision. Do not enable it. Do not write RLS policies.**
> With RLS off the publishable key grants full table access to whoever holds it, so:
> 1. The browser never talks to Supabase tables (no `createClient().from()` in client code).
> 2. All data access goes through Next.js server routes/actions using the **secret** key.
> 3. `org_id` isolation lives in **one** server-side accessor (`withOrg()`). It is the
>    *only* thing preventing cross-tenant leakage — there is no DB backstop.
> 4. The secret key is never `NEXT_PUBLIC_*`, never logged.
> 5. Supabase Auth is fine — verify the JWT server-side via the JWKS URL.

Full detail: [`../CREDENTIALS.md`](../CREDENTIALS.md). Real keys: `../.env.local`.

---

## What's here

```
competitor-research/
├── README.md                  ← this file
├── DESIGN-DIRECTION.md        white/black/red design system + "where Dzylo falls short"
├── FEATURE-REGISTER.md        ★ all findings regrouped under VEYRA modules + coverage matrix
├── HANDOFF-NEXT-AI.md         cold-start brief for the task-breakdown chat
├── ADD-A-VIDEO.md             how to process the next competitor video
├── source/
│   ├── AI_SYSTEM_CONTEXT.md   the Gemini index (verbatim + a correction header)
│   └── frames/video-01/ (58)  Dzylo procurement demo screenshots
│       and  video-02/ (58)    Dzylo full-product demo screenshots
└── analysis/
    ├── 01-procurement.md      58 frames torn down (MR→RFQ→PO→GRN)
    └── 02-operations-crm.md   58 frames torn down (RBAC/CRM/estimation/projects/finance/AI/reporting)
```

**Start with `FEATURE-REGISTER.md`.** The `analysis/*.md` files are the evidence behind it.

## What these videos are

Both are **Dzylo** (`one.dzylo.com`), confirmed via yt-dlp on 2026-08-20:

| # | Video | Length | Covers |
|---|---|---|---|
| 1 | [gEW1maGsD_4](https://www.youtube.com/watch?v=gEW1maGsD_4) — "End-to-End Procurement System Explained" | 17:40 | Material request, AI parse, RFQ, OTP vendor portal, bid comparison, PO, approval, delivery, stock-in, GRN |
| 2 | [NYw__DcZEH8](https://www.youtube.com/watch?v=NYw__DcZEH8) — "Dzylo Product Demo \| Complete Business Management ERP" | 11:27 | RBAC/licensing, CRM, telephony, estimation, project hub, site/labour, finance, Imagino AI, reporting, warranty |

The Gemini doc is titled "Interior Lane" only because of the folder it was generated in — it is **Dzylo throughout** (a correction header is prepended in `source/`).

## How it was built

- The two videos were already downloaded and all 116 frames already extracted by a prior
  Gemini pass (`INTERIOR LANE/RESEARCH/`). Those assets were **copied** in — no
  re-download, no re-extraction. `ffmpeg` and `yt-dlp` are installed system-wide; nothing
  was downloaded into this folder. (If a future video needs it, see `ADD-A-VIDEO.md`.)
- Each frame was opened and torn down into: on-screen layout, fields, table columns,
  actions, states, **inferred data model**, **inferred API**, a **verdict**
  (adopt / adopt-improved / already-planned / reject / oos) and a **VEYRA delta**.
- ~14 B-roll frames in video 2 (stock footage between sections) are flagged; their
  narrated feature is still captured from the Gemini text.

## Headline findings

1. **Dzylo is stronger than PLAN-v0.1 assumed**, especially procurement — its 17-minute
   procurement video maps against PLAN §6.4's four bullet points.
2. **The call-tracking answer is confirmed**: Dzylo built their own dialer writing to one
   call-log table (video-02 `15`), exactly the interactions-layer architecture in PLAN §6.1a.
   No magic browser extension. (REQ-03)
3. **Per-seat licensing** (video-02 `52`: Purchased 20 / Active 12 / Unused 08) answers
   REQ-04's open pricing-model question and shows the Used/Allowed/Remaining pattern.
4. **The moat is intact**: Dzylo has **zero factory** — no BOM, cutlist, nesting, or panel
   traceability. That plus **site-measurement variance** is VEYRA's wedge.
5. **Meter AI via the REQ-04 append-only ledger**, not Dzylo's decrementing credit counter
   (which is the resettable loophole the client explicitly warned about).
