# WhatsApp — research findings

*Consolidated 2026-08-17. Verify anything time-sensitive before acting on it.*

---

## The decision

**Meta WhatsApp Cloud API, direct — no BSP.** The team is already integrated directly in `TOO MUCH/whatsapp` (the "wacrm" app), which means no per-message platform markup and no middleman. Every Indian BSP (WATI, Interakt, AiSensy, DoubleTick) is a wrapper over the same Cloud API charging ₹999–₹3,000/month for the privilege. Meta's own conversation charges are identical across all of them.

## Coexistence mode — the finding that removes the main objection

Historically, registering a number with the Cloud API **disconnected it from the WhatsApp Business app entirely**. That is the single most common reason businesses refuse the API: the team loses the interface they know.

As of 2026 Meta supports **Coexistence** — one number running the WhatsApp Business app *and* the Cloud API simultaneously:

- All 1:1 chats mirror in real time, both directions
- **Messages an agent sends from their own phone appear in the dashboard** (tagged as echo)
- Onboarding imports **six months of chat history**

This closes the hole that kills every WhatsApp CRM — "the salesperson replied from their personal phone and we can't see it" — with **zero behaviour change** for the team.

⚠️ Coexistence rolled out progressively and its limits have shifted. **Confirm current behaviour against the client's actual number during implementation** rather than trusting any write-up, including this one.

## What the Cloud API gives us for free

Webhooks deliver everything automatically:

- Inbound messages
- Outbound **sent / delivered / read / failed** status

So *"quote delivered, read two days ago, no reply"* becomes a queryable state that can drive an automated nudge with nobody involved. This is strictly better than call data, where status has to be inferred.

## The 24-hour window rule

- **Inside 24 hours** of a customer's last message: free-form text allowed.
- **Outside it** (business-initiated): **approved templates only**. Templates need Meta approval, and DLT registration in India.

Surface the window state in the agent UI so people understand why they can't just type.

## The trap — do not go near this

Unofficial WhatsApp Web automation libraries — **Baileys, WPPConnect, Venom** — can scrape a personal WhatsApp account. Several Indian CRM vendors ship exactly this.

It violates Meta's terms and gets the business number **permanently banned**, taking the entire customer communication history with it. Official Cloud API only, always.

## The remaining hole, named honestly

If an agent messages a customer from their *personal* WhatsApp (a different number, on their own phone), no API on earth sees it. Coexistence only covers the business number.

The fix is policy plus making the in-CRM inbox genuinely better than the phone — not technology.

## Reference implementations worth reading

Even though we are not building on Frappe, these are working references for the Cloud API contract:

| Repo | Value |
|---|---|
| [shridarpatil/frappe_whatsapp](https://github.com/shridarpatil/frappe_whatsapp) | The mature one. Cloud API direct, multi-account, two-way messaging with full conversation tracking, template management, WhatsApp Flows, interactive messages, record-event-triggered notifications, bulk send with variable substitution, delivery/status webhooks, media handling. |
| [frappe/waba_integration](https://github.com/frappe/waba_integration) | Frappe's official integration. Smaller scope. |
| [frappe/crm](https://github.com/frappe/crm) | Shows the UX pattern: a **WhatsApp tab on the Lead and Deal pages with a live chat window**, history against the record. AGPL-3 — read, don't copy. |

## What already exists in our own codebase

`TOO MUCH/INTERIOR` + `TOO MUCH/whatsapp` already have:

- Inbound WhatsApp answering, qualifying and collecting requirements — **live**
- Outbound bridge built and gated on `WHATSAPP_BRIDGE_SECRET` + `WHATSAPP_APP_URL`
- `notification_outbox` rows already carry `channel='whatsapp'` intents; handlers enqueue them today
- The bridge auth pattern in `src/lib/whatsapp/bridge.ts`

Read `INTEGRATIONS.md` in the INTERIOR repo for the cross-app contract, and `AI-ECOSYSTEM-ORCHESTRATION.md` §6 for the reverse-bridge spec.

**Do not rebuild this.** Port it, add `org_id`, make rules per-tenant.
