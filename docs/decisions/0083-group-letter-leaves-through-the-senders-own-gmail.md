# 0083 · The group letter leaves through the sender's own company Gmail when the link is ready

Status: accepted
Source: owner decision 09/10/2026 (session notes; no handover document)

## Context

Two mail streams already exist, each with its own sender reputation (ADR 0042):
system/transactional on `notify.` and bulk MAS on `go.`, both through Resend.
A third kind of mail is 1-to-1: the "group letter" written from a lead,
opportunity or contract record to named people. Customers answer it as
correspondence, so it should come from the salesperson, not from a shared
sender.

## Decision

### 1 · Three streams

- System/transactional on `notify.` and bulk MAS on `go.` — both through
  Resend, unchanged.
- The group letter leaves from the mailbox its sender CHOOSES in the
  composer: the shared Resend sender, or the salesperson's OWN company Gmail
  mailbox (Gmail API on the existing per-person Google link). The own mailbox
  is the default once that link is ready. Choosing it without a ready link is
  refused, never downgraded to the shared sender — the person said who the
  letter is from. (Owner decision 09/10/2026; a short-lived switch that
  forbade the shared sender altogether was removed the same day in favour of
  the choice.)
- Bulk never goes through Gmail.

### 2 · "Ready"

A linked account on the company domain AND both Gmail scopes granted. A
personal Gmail may still be linked for Calendar, never for sending.

### 3 · The transport is frozen at the send click

It is decided once there and frozen on the run (`mail_run.transport`, with the
From address). A frozen Gmail letter never falls back to Resend later:
silently changing who a letter is from is worse than a failed letter with a
readable reason. The driver refuses when the mailbox linked at send time is
not the frozen one.

### 4 · No duplicate letters

Gmail has no idempotency key. Every Gmail letter carries an `X-PV-Delivery`
header, and any attempt after the first looks for that header in the
mailbox's Sent mail before sending; a lookup that cannot complete is a retry,
never "not found". The alternative is the same letter reaching up to fifty
customers twice.

### 5 · Gmail never parks the queue

A Gmail failure may never park the single global mail queue (password mail
rides it): the personal transport returns only non-wide retry/permanent
outcomes.

### 6 · Replies and bounces are read from metadata only

A worker sweep reads thread METADATA only (headers), under the
`gmail.metadata` scope: no body, no snippet is requested, stored or logged.
That scope refuses search (`q`), which is why the sweep walks known thread ids
and the duplicate guard (§4) walks Sent by label.

- **Reply:** any message in the thread that is not ours (sender's mailbox, any
  company-domain address, our own header), not automatic (Auto-Submitted /
  Precedence / X-Autoreply), and not a delivery notice. This INCLUDES a sender
  who was not on the letter (alias, assistant) — see the amendment to 0011.
- **Bounce:** only a notice from Google's own mailer-daemon naming failed
  recipients. Anything else claiming to be a daemon is treated like any other
  message, so a recipient cannot forge a notice to get the other addresses on
  the letter suppressed. A delay notice writes nothing.

### 7 · Suppression on the second strike

Headers cannot tell "address does not exist" from "mailbox full / rejected as
spam". So one Gmail bounce marks the address bounced on that letter, and the
shared suppression list (which also blocks MAS) takes the address only when
it bounces on a second, different letter. The Resend path, which is told the
bounce type, still suppresses a hard bounce at once.

### 8 · Per-sender ceiling

A ceiling on addresses sent through Gmail per sender in a rolling window,
counted by SEND time, so letters filed on different days and scheduled for the
same hour are counted together. Values live in env (`PV_GMAIL_*`) and one
shared constant, not here.

### 9 · Two smaller rules

- The "open in Gmail" link is shown only to the person who sent the letter: a
  Gmail thread id means nothing in anyone else's mailbox.
- `sales@` is still CC'd on every group letter, both transports.

## Relations

Builds on 0042 (address rules) and 0051 (shared mailbox; per-person connection
was deferred there — this ADR uses a per-person link for SENDING and metadata
only, not for mailbox capture). Amends 0011 wall (a). Code comments citing
"ADR 0066" for the group letter are stale: 0066 is the lead-scan door, and
this ADR is the one that describes the group letter's transport.

## Consequences

- The Google OAuth app must be Internal (restricted scope; Internal also makes
  Google itself refuse non-company accounts).
- Every person relinks once.
- Owed: the daily count shown in the composer is for "send now" and does not
  yet reflect a scheduled hour (the server still refuses correctly at send).
- Not built: follow-up letters into the same thread; an MX check before
  sending.
- A thread stops being watched after its first reply, so a later bounce on
  that letter is not read.
