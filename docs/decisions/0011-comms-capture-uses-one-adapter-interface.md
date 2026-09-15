# 0011 · Comms capture runs on one adapter interface, guarded by four privacy walls

Status: accepted
Source: docs/tam-nhin-giao-tiep-va-noi-dung.md §4 ("Four capture doors,
cheapest → priciest") and §5 ("Transparency — four walls, because 'keep
everything' is a dangerous sentence")

## Context

The `comms` module's inbound half (mailbox sync, meeting transcripts, Zalo
OA/Telegram webhooks, call recordings) needs a shared shape so it is four
adapters, not four separate code paths. `capture-builder`
(`.claude/agents/capture-builder.md`) builds against this interface and these
walls directly.

## Decision

Every capture door is an adapter against one interface, running on the
pg-boss queue already in place (`platform/queue`):

```ts
type CaptureAdapter = {
  channel: Channel
  pull?(cursor: string | null): Promise<{ messages: RawMessage[]; cursor: string }>
  webhook?(payload: unknown): RawMessage[]
  normalize(raw: RawMessage): NormalizedMessage
}
```

Four doors, cheapest to priciest: (1) two-way email — Gmail API / Microsoft
Graph OAuth, synced per mailbox, blocked by nothing, buildable now; (2)
meeting transcript — file upload / paste text, the `meeting.transcript`
column already exists, the cheapest of the four; (3) Zalo OA · Telegram —
Business API webhook, E4's `Channel` already has both values, blocked by
needing an OA account + verification; (4) call recording — CTI (Aircall ·
Twilio · a VN switchboard) pushing call logs + files, blocked by debt #12 (S3)
**and** the consent wall below. Door 1 is the most data-valuable of the four
and the only one that opens the **inbound** direction — it goes first.

Four privacy walls, because "keep it all" is a dangerous sentence:

**a · Only keep what can be linked into the book.** The email capture door
runs on employees' personal mailboxes. Rule: **a letter with no matching
`comms.identity` on the `guest` side is not stored** — only a count "N letters
skipped" is kept. No sender list, no subject line. Every CRM with mailbox sync
has this filter; without it the CRM becomes an employee's private mail
archive.

**b · Metadata and CONTENT are two different permissions.** "14 exchanges, last
one 3 days ago" is a management question. "What did they say" is not always
one. So `comm.view` (timeline, count, duration) is split from
`comm.view-content` (body, transcript, recording).

**c · Reading someone else's content is logged.** `comm.view-content` on a
thread you do not own writes a row to `platform.audit`. Transparency means
**both directions can see**, not just the manager looking down.

**d · Consent is a row, not an assumption.** `comms.consent (identity_id,
purpose, granted_at, source, revoked_at)` with `purpose ∈ {'recording',
'marketing'}`. Recording without a `recording` purpose is blocked at the
write door. Decree 13/2023/NĐ-CP requires a legal basis for collecting and
processing personal data, and recording a customer call sits squarely inside
that. The mechanism has an in-house precedent: `MasRecipientBlock` blocks a
recipient **with a readable reason** instead of silently dropping them — four
values, four different actions. Do the same here.

Plus: `comms.blob.retention_until` + `legal_hold`, and a sweeper that deletes
past the deadline — the same tier as the existing `CampaignSweeper`.

## Consequences

`comms.identity.object_code` points at `platform.object`, NOT straight at
`sales.contact` — a customer's email lives in two places today
(`sales.lead.email`, the real MAS send address, and `sales.contact.email`, the
multi-person book that no send reads) and a single `contact_code` column would
miss exactly the address every letter is actually going to. One `object_code`
foreign key covers both `lead.code` and `contact.code` without a polymorphic
CHECK. The alternative — mirroring a `contact` row for every `lead.email` —
was rejected because it copies person data into two tables to patch one
missing key.

Unmatched inbound mail is never dropped silently: it goes to
`comms.inbox_unmatched`, a queue with a screen and an "who is this" action.
