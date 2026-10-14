# 0092 · Who a customer letter is from, and where the answer goes

Status: accepted 14/10/2026 (amends 0083 §9; replaces the 28/09 mail-flow decision G9, which was never recorded in an ADR)
Source: owner delegated 14/10/2026 ("như nào đúng cách xử lý thì nên làm theo") after the 14/10 review

## Context

The 28/09 decision G9 was "From noreply, CC sales@, Reply-To per-letter
tracking address". The code does something else, path by path:

- Gmail group letters come from the sender's own address, no Reply-To, with
  sales@ CC'd.
- Resend group letters use the static `PV_EMAIL_MAS_REPLY_TO`
  (`mail-letter.service.ts:216`).
- Bulk runs send sales@ a separate archive copy (`mas.composer.ts`), not a CC.
- The per-letter tracking Reply-To (`reply+<id>@`) is behind
  `PV_MAS_REPLY_TRACKING_ENABLED`, default false.
- The inbound webhook (`mail-webhook.controller.ts`) records ANY message to
  that address as a customer reply, including out-of-office auto-replies and a
  colleague's reply-all.

## Decision

### 1 · No customer letter comes from a noreply address

A From that a person cannot answer loses replies and hurts deliverability and
trust. `PV_EMAIL_MAS_FROM` in production must be an answerable address;
`/ship` checks it.

### 2 · Group letter via Gmail: unchanged

From is the sender's own company address, no Reply-To, sales@ CC'd. 0083 §9
stands for this path.

### 3 · Group letter via the shared Resend sender

The display name is the sender's name with "· Pebble Vina". Reply-To is the
SENDER's own company address, so the customer answers the person who wrote,
the same as on the Gmail path. sales@ is CC'd. If the sender has no
company-domain address, Reply-To falls back to `PV_EMAIL_MAS_REPLY_TO`.

### 4 · Bulk MAS

From stays the bulk sender on `go.` with the company display name. Reply-To is
the shared mailbox (`PV_EMAIL_MAS_REPLY_TO`, i.e. sales@pebblevina.com).
sales@ receives the separate archive copy and is NEVER CC'd: a CC shows an
internal address to hundreds of strangers, and reply-all lands on it.

### 5 · The per-letter tracking Reply-To stays OFF until three things hold

- (a) inbound MX for the tracking address is live;
- (b) every tracked answer still reaches a human mailbox (forwarded to the
  sender for group letters, to sales@ for bulk), so tracking never swallows a
  reply;
- (c) the inbound path applies the same "is this a customer reply" rule as
  0083 §6: not automatic (Auto-Submitted / Precedence / X-Autoreply), not from
  a company-domain address, not a delivery notice. Only then may it write
  `customer-replied` or ring the bell.

Until then, replies to Gmail letters are still read by the Gmail sweep
(0083 §6), and replies to Resend and bulk letters land in a human mailbox but
are not tracked.

### 6 · The `.co` / `.com` question is closed

sales@pebblevina.com everywhere (migration 0064).

## Alternatives rejected

- **A noreply From (G9 of 28/09).** See §1: replies are lost and trust drops.
- **CC sales@ on bulk.** See §4: it exposes an internal address to the whole
  list and reply-all lands on it.
- **Turning tracking on now.** It would ring a false "customer replied" on
  auto-replies and could hide answers from people.

## Relations

Amends 0083 §9 (the Resend path no longer keeps the static Reply-To; the CC
rule is unchanged). Builds on 0042 (address rules), 0051 (shared mailbox) and 0040. Replaces G9 of the 28/09 mail flow, which had no ADR.

## Consequences

Owed code, none of it built:

- Resend group-letter Reply-To and display name (`mail-letter.service.ts`).
- The inbound auto-reply / colleague filter, before tracking is enabled.
- A `/ship` check of `PV_EMAIL_MAS_FROM`.
