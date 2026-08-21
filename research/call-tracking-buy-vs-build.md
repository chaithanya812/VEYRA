# Call & WhatsApp capture — buy it, don't build it

*Revised after competitor research. Supersedes the 10-week build plan.*
2026-08-17

---

## First, the contradiction

I said an app can't track calls, then proposed an app. Both were true but I muddied them, so to be exact: the app in that plan wasn't a *tracker*, it was a *dialer* — it made calls through a server so the server had the data. The tracking never happened on the phone.

But it doesn't matter, because after researching the market the answer is simpler: **don't build any of it.**

---

## What "telephony" actually means

Cloud telephony is **renting a phone system that lives on the internet** instead of sitting in your office as a box. You get a business number that isn't tied to any SIM, and — the part that matters — **software can place a call by calling an API instead of a human dialling.**

Because every call travels through the provider's servers, they are inside the audio. That's the whole trick:

| You get | Because |
|---|---|
| Recording of every call | They're in the audio path — no app, no device permission |
| Exact duration | Measured at their bridge, not estimated |
| Answered / missed / busy / failed | Their switch knows the outcome |
| Who called whom, when, from which agent | They routed it |
| Inbound calls logged and routed | Your business number lives on their network |
| Number masking | The customer sees the virtual number, never the agent's personal one |
| **Identical behaviour on iPhone and Android** | The *network* does the work, not the phone |

The flow: your software says "connect agent A to customer B" → the provider rings the agent's ordinary mobile → then rings the customer → bridges them → and when it ends, POSTs your software a summary with a recording link.

**Cost:** a subscription plus per-minute charges. MyOperator runs roughly ₹2,500/month for 3 users, ₹5,000 for 10. Exotel sells prepaid credit bundles from around ₹9,999.

---

## Who already sells this

Three mature, crowded markets — not one gap.

**Cloud telephony:** Exotel · MyOperator · Knowlarity · Ozonetel · Acefone. All of them already ship click-to-call from a CRM record, screen-pop on inbound, and automatic activity logging against the contact.

**SIM-based call trackers** (an Android app reads the call log and the OEM's recording folder):

| Product | What it does | Price |
|---|---|---|
| **Runo** | Market leader. SIM-based auto-logging, AI call summaries, virtual numbers, CRM built in | Per user |
| **Callyzer** | GSM call monitoring, recording sync, manager dashboard. No lead management, no WhatsApp, no AI — connects to your CRM by API | **~₹161/month per number** |
| **TeleCRM** | Call management + leads + WhatsApp automation + IVR | Per user |

**WhatsApp platforms:** AiSensy (from ~₹1,500/mo) · Interakt (~₹2,142/mo) · WATI (~₹2,399/mo) · DoubleTick (₹999–3,000/mo). Meta's conversation charges are identical across all of them — the only difference is subscription and markup.

### The finding that settles the iOS question

**Runo — the leader in this exact category — supports only "outbound call tracking if the call is made from the app" on iOS.** Their SIM-based automatic logging is Android-only.

A funded company whose entire product is this could not solve iOS either. It isn't a skill problem or a budget problem; Apple exposes no call-log API. Any vendor claiming otherwise is describing their Android app.

And on Android, recording works by reading the **manufacturer's** recording folder — Xiaomi writes to `MIUI/sound_recorder/call_rec`, Samsung to `My files → Call`. That means it's device- and brand-dependent, and breaks per OEM, per OS version. That fragility is the product these companies actually sell: years of per-manufacturer edge cases.

---

## My opinion

**Buy the capture layer. Build nothing.**

Building this means competing with Runo — funded, years of OEM edge-case handling, AI summaries already shipped — in a market where Callyzer charges **₹161 a month**. There is no version of that fight worth having, and every week spent on it is a week not spent on the thing nobody else has.

The recommendation:

1. **Calls → cloud telephony (Exotel or MyOperator).** Click-to-call, recordings, durations, statuses, inbound routing, webhooks. *This already is the call tracker the client described.* ~₹2,500–5,000/month.
2. **WhatsApp → the Cloud API they already run**, plus coexistence onboarding. They're integrated **direct** with Meta in `../whatsapp`, so they're already ahead of every BSP on that list and paying no markup. Nothing to buy.
3. **No mobile app. No App Store. No Play review. No OEM workarounds.**
4. **If field staff later need calls captured from their own dialer** — resell or bundle Callyzer at ₹161/number rather than build it. Buy the fragility from someone who maintains it.

### Where the value actually is

Capturing a call is a ₹161/month commodity. The value is in **what the data connects to**, and not one company on that list knows what a quotation, a BOM, a site measurement or a modular kitchen is.

Runo can tell you a call lasted four minutes. It cannot tell you that the call was about the wardrobe in bedroom 2, whose quote is awaiting approval, whose laminate is stuck at the vendor, on a project running six days late.

**That gap is the entire argument for the platform.** Comms capture is a bought input. The industry workflow is the product.

---

## The revised plan — about 3 weeks, not 10

| | |
|---|---|
| **Week 1** | Exotel/MyOperator account, virtual number, **KYC started day one** (the long pole — it's a queue, not code). Meta coexistence onboarding on the client's real number, which imports six months of chat history. |
| **Week 2** | Webhook receivers for both providers → one `interactions` table (channel, direction, status, duration, recording, contact, agent). Click-to-call button on the lead. |
| **Week 3** | Timeline on the lead record, recordings playable inline, per-agent activity view, and the outbound webhook seam so the SaaS platform reads it later. |

Deleted from the previous plan: the mobile app, Apple and Play accounts, App Review, restricted permissions, OEM recording workarounds, and roughly seven weeks.

**One risk remains and no amount of engineering removes it:** if agents dial from the native dialer instead of clicking Call, those calls go uncaptured. Number masking is the argument that wins that internally — and if it doesn't, Callyzer at ₹161/number is the backstop.

---

## Sources

- [Runo — SIM-based call management](https://runo.ai/product/call-management-app) · [Runo FAQ](https://runo.ai/faq) · [Runo on the App Store](https://apps.apple.com/in/app/runo-call-management-crm/id1528004506)
- [Best call management apps for Indian small businesses 2026 — The Hans India](https://www.thehansindia.com/business/top-5-best-call-management-apps-for-small-businesses-in-india-2026-1043202)
- [TeleCRM call tracking & recording](https://telecrm.in/call-tracking-recording-crm-software)
- [Best cloud telephony providers in India 2026](https://www.itforsme.in/best/cloud-telephony-india) · [Exotel pricing guide](https://www.cloudtalk.io/blog/exotel-pricing/) · [MyOperator pricing](https://g2.com/products/myoperator/pricing)
- [WhatsApp API pricing India 2026 — 5 BSPs compared](https://codingclave.com/guides/whatsapp-api-pricing-india-2026-comparison) · [WATI vs Interakt vs AiSensy 2026](https://codingclave.com/blog/wati-vs-interakt-vs-aisensy-2026)
- [Where Xiaomi stores call recordings](https://www.mi.com/global/support/faq/details/KA-541461/) · [Call recording by brand 2026](https://voicit.com/en/blog/human-resources/how-to-record-calls-on-android/8106/)
- [CXCallObserver — Apple](https://developer.apple.com/documentation/callkit/cxcallobserver)
