# 0087 · A recipient whose domain cannot receive mail is dropped before sending

Status: accepted
Source: owner decision 09/10/2026 ("check MX before sending; follow product best practice")

## Context

Every bounce costs sender reputation — on `go.` for bulk MAS, and on the
company's root domain for letters sent through a salesperson's own Gmail
(ADR 0083). The commonest avoidable bounce is an address on a domain that
cannot receive mail at all: a typo, a lapsed domain, a company that moved.
Lead addresses arrive through many doors (form, file import, card scan, public
intake), so a check at entry would have to live in many places and would still
miss old data.

## Decision

### 1 · Where

The check runs where a customer letter is FILED, for both the group letter and
bulk MAS (preflight and send), not at data entry. One place covers every door
and all existing data. Internal notification mail and transactional mail are
not checked.

### 2 · What counts as dead, and only this

- The domain does not exist; or
- it publishes a null MX (RFC 7505); or
- it has no MX and no address record either (RFC 5321 §5.1 — without an MX,
  mail falls back to the address record, so "no MX" alone is not dead).

An MX whose host does not resolve is not dead.

### 3 · Doubt means send

A timeout, a resolver error, a partial answer, or the call's overall deadline
passing all read as "unknown" and the address is sent. A flaky resolver must
cost a bounce, never a blocked customer. Consequence stated plainly: on a very
large first preflight some domains are not judged within the deadline and are
sent unchecked; the lookups finish in the background, so the send a moment
later judges them.

### 4 · A visible block, not a silent skip, and not a suppression

The recipient shows the reason `UNDELIVERABLE` ("Tên miền không nhận thư")
beside the other block reasons and is dropped from that send; the rest of the
send goes on. Nothing is written to `platform.email_suppression` and nothing
is stored on the lead: the verdict is re-derived on every preflight, so
correcting the address clears it at once. Precedence when several reasons
apply: exited → no email → suppressed → undeliverable → duplicate
(suppression is the stronger, permanent fact).

### 5 · Memory

The verdict is remembered in process memory only, briefly, and "dead" much more
briefly than "ok", so a domain registered minutes ago or an outage misread as
non-existence heals by itself. The values are named constants in
`apps/api/src/platform/mail/mail-domain-check.ts`, not here.

### 6 · No DNS inside a transaction

DNS never runs inside a database transaction: addresses are read first, the
check runs once per request, and the re-judge inside the send transaction uses
that set.

### 7 · Trace

Because the verdict is not stored, the count of addresses dropped for this
reason is written into the run's note at send (count only, no address).

## Relations

Builds on 0042 (address rules) and 0083 (group letter through the sender's own
Gmail). Complements the second-strike suppression of 0083: that one reacts
after a bounce; this one avoids the bounce.

## Consequences

- The check is taken when the run is filed, not when it leaves. A scheduled
  run or a held campaign wave is not re-judged at release, so a domain that was
  briefly unresolvable at filing misses that run (the run note is the trace),
  and one that dies after filing still bounces.
- Owed: there is no "send anyway" override.
- Owed: the bulk preview of a single lead does not warn.
- The cache is per process, so two machines can disagree for a few minutes.
- The system resolver is trusted: a resolver that lies with NXDOMAIN blocks
  that domain until the short memory expires.
