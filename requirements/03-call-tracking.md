# REQ-03 — Call tracking in the CRM

**Source:** Client, verbatim, plus a follow-up challenge.
**Status:** Open. Technically settled; awaiting the client's decision on build vs integrate.

---

## Client's original message

> We need to create a web-based Call Tracker extension integrated directly with the CRM Leads section.
>
> Whenever a user clicks Call against any lead from the CRM, the call should automatically be tracked and logged against that specific lead. We should not depend on the user manually entering call activity.
>
> For every call, we need to capture:
>
> - Lead/customer name and phone number
> - Date and exact call time
> - Number of call attempts
> - Incoming/outgoing status wherever technically possible
> - Answered / unanswered / missed / failed status
> - Actual call duration
> - Total calls made to that lead
> - Complete call history/timeline under the lead
> - Which CRM user/team member initiated the call
>
> Please check the best technical approach using a web/browser extension or another integration layer. The main requirement is that when calls are initiated through the CRM, the activity should automatically come back and update the CRM lead history.
>
> This call tracking is important and should be part of the core CRM, not a manual-entry-only feature.

## Client's follow-up

> Understood, sir. We can keep the CRM focused on WhatsApp integration for now, but before completely dropping the call-tracking functionality, could you please investigate how Dzylo is achieving the same functionality without depending on a third-party call-tracking provider?
>
> As I understand it, Dzylo is able to provide call-related CRM tracking for its users. Please check their approach—whether they are using their own Android application, SIM-based tracking, click-to-call with callbacks, a browser/mobile bridge, telecom APIs, or some other architecture.
>
> If Dzylo can achieve this without services like Runo, Callyzer or TeleCRM, I would like us to understand how they are doing it and whether we can implement a similar approach before deciding that call integration is not possible.
>
> The requirement is mainly automatic call attempts, representative name, number called, date/time, duration/status and lead-wise call history. **Call recording itself is not mandatory if that is the part creating the technical limitation.**

---

## The answer to the Dzylo question

**Dzylo ships their own Android companion app** — "Dzylo Dialer", package `com.dzylo` on Google Play, described as an add-on to their CRM that tracks calls, updates call logs and captures calling metrics.

No third-party provider, no telecom API, no clever bridge. It reads the device call log. **There is no technique we're missing.**

Two things worth noting:

1. **No iOS version exists.** Dzylo — operating across India, UAE, Qatar, Portugal, Malaysia and Uganda — accepted the same limitation, because Apple exposes no call-log API to any app.
2. **It's a *separate* app from their main CRM app.** That is deliberate: bundling `READ_CALL_LOG` into the main app would subject the entire CRM to Google's restricted-permission review on every update. Isolating it contains the risk. **Copy this pattern.**

## What the dropped recording requirement changes

The client's line — *"call recording itself is not mandatory"* — removes the single hardest constraint, because call audio genuinely cannot be recorded on an unmodified Android phone.

With recording out, everything remaining comes from the call log alone, reliably:

| Requirement | From the call log |
|---|---|
| Automatic call attempts | ✅ |
| Representative name | ✅ |
| Number called | ✅ |
| Date / time | ✅ |
| Duration / status | ✅ |
| Lead-wise history | ✅ |

**Remaining constraints: Android only, and one Google Play review round.**

## The three viable routes

Full analysis in `research/call-tracking-build.md` and `research/call-tracking-buy-vs-build.md`.

| Route | Covers | Cost per call | iOS |
|---|---|---|---|
| **Own Android app** (Dzylo's approach) | Android team | ₹0 — rides their Airtel/Jio plan | ✗ |
| **Cloud telephony** click-to-call | Everyone | Per-minute + subscription | ✓ |
| **Buy Runo / Callyzer** and integrate | Android team | From ~₹161/number/month | ✗ |

The browser extension the client originally proposed **cannot work** — an extension opens a `tel:` link and the OS takes over; the browser never learns duration, status, or that an inbound call happened. It satisfies one of nine requirements.

## Decision needed from the client

Which route. See `client/message-call-module.md` for what they've already been told.

## Architectural note for whichever route wins

Do not build "a call tracker." Build **one `interactions` table** — channel (call / whatsapp / email / sms / site visit), direction, status, duration, attempt number, external ref, contact, agent — with an adapter per channel writing into it. The lead timeline reads it, the automation spine reads it, analytics reads it.

That is what makes this "part of the core CRM" as the client insists, rather than a bolted-on feature.
