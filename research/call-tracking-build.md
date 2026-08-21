# Building call capture — for human operators

*We build it. Real salespeople use it, not bots.*
2026-08-17

---

## The premise that decides everything

An AI agent does exactly what you tell it. A human salesperson does whatever is fastest, and routes around anything that slows them down.

So this system is not won on architecture. It's won on two things:

> **1. It must capture calls even when the agent ignores our app.**
> **2. It must be more useful to the agent than not using it.**

Get the first wrong and the data has holes, which makes the dashboard a lie. Get the second wrong and the app gets "accidentally" force-stopped in week two, and you'll never prove why the numbers dropped.

Everything below follows from those two sentences.

---

## The core architecture: two capture paths

This is the single most important design decision, and it's the thing that separates a system that works from a demo that works.

**Path A — the agent calls from inside our app.**
They tap Call on a lead. We already know who, why, which project, what was last discussed. Rich context, pre-attached, and we can pop the disposition screen the instant it ends.

**Path B — the agent calls from the native dialer, like a human.**
A `ContentObserver` on the call log sees the new entry, matches the number against our contacts, and writes the interaction anyway.

**Both write to the same `interactions` table.** Path A gives quality. **Path B is what makes the system honest** — it's the floor under the data, and it means adoption failure degrades the richness of the record rather than creating gaps in it.

Most products in this space build only Path A and then wonder why managers say "half my team's calls aren't showing."

---

## The human workflow layer

Bots need an API. Humans need a job to do. This is the part that doesn't exist if you only think about capture:

**Calling queue** — the answer to *"who do I call next?"* Assigned, prioritised, filtered by callback-due. Without this an agent opens the app and sees a list, which is not a job.

**Post-call disposition — the single most important screen in the product.** The moment a call ends, the app surfaces: who, how long, and three taps — outcome (interested / not now / no answer / wrong number), callback date, one voice note or line of text.

Budget: **under five seconds.** Longer and they dismiss it, every time, forever. A voice note beats typing for a person walking out of a site.

**Follow-up engine** — scheduled callbacks, reminders, an overdue queue that's visible to the agent before it's visible to their manager. Let them fix it themselves first; that's what makes the tool feel like theirs.

**Supervisor view** — live team activity, per-agent calls and talk time, recordings, follow-up compliance, connect rate by hour.

**Targets and shift state** — calls per day, available / on-break / off, so the manager view means something.

---

## The Android engineering that actually decides success

Not the interesting part. The part that breaks.

**Background survival — the number one failure mode.** Android kills background apps, and Xiaomi, Oppo, Vivo and Realme are aggressive about it — which is most of an Indian sales team's phones. You need a foreground service with a persistent notification, a battery-optimisation exemption request, and OEM-specific autostart instructions in onboarding. **This is the maintenance treadmill that Runo and Callyzer are really selling.** Budget for it as ongoing work, not a task.

**Capture** — `ContentObserver` on `CallLog.Calls` plus call-state listening. Gives number, direction, timestamp, duration, and answered-vs-missed.

**Recording** — read the manufacturer's recorder folder (Xiaomi `MIUI/sound_recorder/call_rec`, Samsung `My files → Call`, others vary). Make "turn on your phone's call recording" an onboarding step, and **be honest in the UI about which devices support it** rather than silently producing nothing.

**Offline-first** — local queue in Room, sync when there's signal. Field staff work in basements and half-built flats. Non-negotiable.

**Permissions** — `READ_CALL_LOG` under Google's **"Enterprise CRM and business applications — corporate login required"** exception. Declaration form plus review. Our app qualifies because corporate login gates it, but budget for a rejection round.

---

## The human factors that kill these products

**Surveillance.** Agents will feel watched, because they are. The counter is that every feature ships agent-side first: *their* follow-up list, *their* reminders, *their* call history when the customer rings back and they can't remember the conversation. The manager dashboard is a by-product of a tool the agent already wants. Lead with the manager view and adoption dies quietly.

**Personal call privacy — get this wrong and the app is uninstalled.** Only log calls to numbers that exist in the CRM. Everything else never leaves the phone. Say so, loudly, in onboarding. An app that logs an agent's calls to their mother is finished.

**Company phone vs personal phone.** If the client issues phones, use **Android Enterprise with a work profile**: provision the app, force permissions, block uninstall, keep work and personal genuinely separate. That removes most adoption *and* privacy problems in one move. Worth pushing the client toward for their telecalling desk.

**iPhone staff.** Designers and architects will be on iPhones, and they get nothing — Apple exposes no call log. Their options are a telephony click-to-call number or a manual quick-log. Decide this deliberately rather than discovering it at rollout.

---

## Reference repos (verified 2026-08-17)

**Call-log sync — the core loop, proven:**
- [MarkoBL/AndroidCallLogSync](https://github.com/MarkoBL/AndroidCallLogSync) — syncs ID, number, call type (incoming/outgoing/missed), timestamp ms, duration sec; POSTs JSON to a configurable endpoint with device/token headers. **GPL-3.0 — read it as a reference, do not copy code into our product** or we're obliged to open-source ours.
- [wickerlabs/calllogs](https://github.com/wickerlabs/calllogs) — library for reading device call logs. Check licence before use.
- [duadhruv/CallSync](https://github.com/duadhruv/CallSync) — syncs call details *and* recordings to a central server. Dated stack (MSSQL/FTP) but the pattern is the one we want.
- [5en/CallRecorder-master](https://github.com/5en/CallRecorder-master) — MIUI-only, explicitly "keep service alive." Worth reading purely for its background-survival tricks, which is our number-one failure mode.

**Recording — the claim, verified and worse than stated:**
- [chenxiaolong/BCR](https://github.com/chenxiaolong/BCR) — the best-maintained Android call recorder, and it **requires root or custom firmware**. It records via the `VOICE_CALL` audio source behind `CAPTURE_AUDIO_OUTPUT`, a *system* permission.

**Conclusion: there is no way to record call audio directly on a normal Android phone.** Not a skill or effort problem — the API is system-level. Our only route is reading the file the manufacturer's own recorder already wrote (MIUI: `/storage/emulated/0/MIUI/sound_recorder/call_rec`). Older MediaRecorder-based recorders like `aykuttasil/CallRecorder` broke at Android 10 and are not a path forward.

**Browser softphone — the iPhone answer:**
- [JsSIP](https://jssip.net/) / [SIP.js](https://sipjs.com/) — mature open-source SIP-over-WebSocket signalling, using the browser's native WebRTC for media.
- [Siperb/Web-Phone](https://github.com/Siperb/Web-Phone) — composable WebRTC phone built to embed into CRMs and dashboards; supports SIP.js, JsSIP or a custom SDK.

A browser softphone registers to the PBX as an ordinary SIP extension, so recording, queues and IVR work with no extra logic on our side.

## Build plan

Two people — one Android, one full-stack. Roughly 10–11 weeks.

| Phase | Weeks | Content |
|---|---|---|
| **1 — Spine** | 1–2 | Server, `interactions` schema, contacts, agent auth, dashboard skeleton |
| **2 — Passive capture** | 3–5 | Android app v1: call-log observer, contact matching, offline queue, foreground service, OEM survival. **This alone delivers the client's entire list** |
| **3 — Agent tool** | 5–7 | In-app dialer, post-call disposition, calling queue, follow-up reminders |
| **4 — Recording** | 7–9 | OEM folder capture, upload, playback in the dashboard, retention policy |
| **5 — Supervisor** | 9–11 | Live activity, per-agent stats, targets, connect-rate-by-hour, reports |
| **6 — WhatsApp** | parallel | Coexistence into the same `interactions` table — no app work needed |
| **7 — Ship** | after | Play submission with the enterprise-CRM declaration; iPhone fallback decision |

**Phase 2 is the milestone that matters.** Passive capture with nothing else already answers every bullet the client wrote. Everything after it is about making agents *want* the app, which is what keeps the data real.

**Pilot on the client's own team first.** They're tenant zero, they'll tell you the truth, and their phones are the OEM sample you need.

---

## What we're accepting by building

- **iPhone is not covered *by the app*** — Apple exposes no call-log API. But the feature is not cancelled for those users: they call from the **browser softphone** instead, which produces *better* data than the Android path (recording always works, because the audio goes through our server rather than depending on the handset manufacturer).
- **Recording is device-dependent**, and will produce support tickets forever.
- **Per-OEM background-kill behaviour is permanent maintenance**, not a one-time fix.
- **Play review risk** on the restricted permission, with a likely rejection round.

What we get in exchange: **near-zero cost per call** (agents' own plans rather than per-minute telephony), the data model is ours, and it's a first-class feature of the platform instead of a vendor's dashboard we link out to.

One addition worth making anyway: **a single telephony number for inbound only.** Website, ads, hoardings. Low volume so it's cheap, and it's the only way to catch missed inbound calls and know which ad produced them. That's the one thing an on-device app structurally cannot do.
