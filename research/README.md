# Research archive

Findings from the planning phase, kept so nobody re-derives them in six months. Each file states what was verified and when.

**Everything here was researched in August 2026.** Platform policies, pricing and API capabilities move. Re-verify anything you are about to act on; the *architectural conclusions* age far better than the *specific numbers*.

---

## Files

### `call-tracking-build.md`
How to build call tracking ourselves — the two-capture-path architecture, the human-operator workflow layer, the Android engineering that actually decides success (background survival, OEM fragmentation), and the reference repos.

**Read it before anyone proposes a call-tracking feature.** It contains the hard platform limits.

### `call-tracking-buy-vs-build.md`
The competitor landscape for call tracking (Runo, Callyzer, TeleCRM, and the Indian cloud telephony providers), the cost model, and the buy-versus-build argument. Also explains what cloud telephony *is*, plainly.

### `whatsapp.md`
Cloud API direct vs BSPs, **Coexistence mode**, the 24-hour window rule, the banned-library trap, and what already exists in our own codebase.

### `competitors-and-foundations.md`
Dzylo teardown — their full module list and, more usefully, **the gap they leave** (everything downstream of the quote: BOM, cutlist, nesting, panel traceability, factory routing). Plus the open-source ERP foundations (ERPNext, Odoo, OpenConstructionERP) and the **GPL vs AGPL licence distinction** that decides whether a codebase can underpin a commercial SaaS.

### `open-source-repos.md`
Repos worth reading, sorted by which module of our build each serves — cutlist/nesting optimisers, floor plan and 3D editors, ERP/CRM foundations, WhatsApp integrations.

### `payments-razorpay-setup.md`
Razorpay account setup: whose account it must be, documents by entity type, the website policy pages that block activation, enabling Subscriptions, and the API/webhook pattern. PhonePe comparison included.

---

## The five conclusions that cost the most to reach

Carry these forward; they are settled.

1. **iOS cannot read the call log. Ever.** Apple exposes no API. Confirmed against Apple's docs *and* by market behaviour — Runo, the category leader, has no iOS call tracking either.

2. **Call audio cannot be recorded on an unmodified Android phone.** It needs `CAPTURE_AUDIO_OUTPUT`, a system permission — which is why BCR requires root. The only route is reading files the handset manufacturer's own recorder already wrote, which is brand- and version-dependent.

3. **Android call logs *are* readable** under Google Play's explicit **"Enterprise CRM and business applications — corporate login required"** exception. Declaration plus review. Dzylo ships exactly this as a separate app (`com.dzylo`), which also shows the right pattern: keep the restricted permission out of the main app.

4. **WhatsApp Coexistence** lets one number run the Business app and the Cloud API together, with real-time two-way sync and six months of history import. It removes the main objection to going API-based.

5. **ERPNext's data model is worth weeks of design time.** Item master, UOM conversion, BOM explosion, stock valuation — a decade of refinement, GPL-3, and it solves every trap flagged in `PLAN.md` §4. Read it as a **reference architecture**, not a foundation.
