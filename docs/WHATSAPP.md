# WhatsApp reminders — design and activation plan

Status: **not implemented**. The app works fully without it and does not collect phone numbers today.
Nothing in the app pretends WhatsApp messages are sent.

## Why it needs a backend

WhatsApp messages can only be sent legitimately through the official **WhatsApp Business Platform (Cloud API)**
or an authorized provider (e.g. Twilio, MessageBird/Bird, 360dialog). That requires an access token that must
never ship inside a mobile app, so sending has to happen on a server. Automating the user's personal WhatsApp
or WhatsApp Web is against WhatsApp's terms and is out of scope.

## Proposed architecture

```
App (local SQLite, source of truth)
  └─ syncReminders(db)  ── same plan used for local notifications ──┐
                                                                    ▼
                         POST /reminders/plan  (auth: anonymous device token)
Backend (e.g. Supabase: Postgres + Edge Functions + cron, or a small API)
  ├─ users(device_id, phone_e164 [encrypted], verified_at, opted_in_at, opted_out_at, timezone)
  ├─ reminder_plans(device_id, tracker, fire_at_utc, status)   -- replaced on every sync
  ├─ deliveries(plan_id, provider_message_id, status, error, attempts)
  └─ cron every minute: send due reminders via Cloud API template message; record status via webhook
```

Flow:
1. User enables WhatsApp reminders and enters a phone number (E.164).
2. Backend sends a one-time code (WhatsApp authentication template or SMS); user confirms → `verified_at`.
3. User explicitly opts in (checkbox with clear text) → `opted_in_at`. Replying STOP or toggling off → `opted_out_at`.
4. On every local change (progress, pause, postpone, settings) the app pushes the current reminder plan
   (only tracker id + times; no Quran progress details needed). Completing or pausing a tracker removes its
   future WhatsApp reminders the same way it cancels local ones.
5. Delivery webhooks update `deliveries`; failures retry with backoff and are dropped after the reminder time
   window passes (no late spam).

In the app the extension point is `syncReminders` in `src/notifications/index.ts`: after computing
`planReminders(...)`, a WhatsApp channel would upload the same plan when enabled and verified.

## Provider requirements and costs (verify current pricing before launch)

- Meta Business account + verified business, a dedicated phone number, a WhatsApp Business Account.
- **Pre-approved message templates** (business-initiated messages outside the 24h window must use templates),
  e.g. "Reminder: your {{1}} goal for today is not complete yet." in Arabic and English.
- Conversation/message-based pricing per country (utility/authentication categories); reminders every hour
  for three trackers can get expensive — enforce a low daily cap (e.g. 1–3 WhatsApp messages per day).
- Rate limits and quality rating: users blocking messages lowers the number's rating; keep messages rare and useful.

## Privacy and security

- Store phone numbers encrypted at rest; transmit only over HTTPS; never log full numbers.
- Keep opt-in/opt-out records with timestamps; delete the phone number when the user disables the feature or
  deletes their data.
- Secrets (Cloud API token, app secret) live only in server environment variables.
- Update the privacy policy and store listings (data safety) before enabling.
