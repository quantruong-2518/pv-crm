# 0065 · A mail run stays editable until a letter leaves; one PATCH door, two exclusive branches

Status: accepted
Source: project owner's decision in session, 22/09/2026 — "lô đã gửi mới không
update được, lô tạo nhưng chưa bắn thì update oke"

## Context

`PATCH /sales/mail/runs/:id` accepted exactly one body: `{ state: 'CANCELLED' }`.
A batch held at `SCHEDULED` for 9am with the wrong subject in it therefore had
one way out — cancel it, then compose the whole thing again from nothing,
audience and all. The letters had not gone anywhere; only the door had no verb
for it.

Everything a batch will send is already in `mail_run`'s own columns.
`MasMailComposer` (`apps/api/src/platform/mail/mas.composer.ts`) renders each
letter from them at send time, so nothing in `platform.email_delivery` holds a
second copy of the text that could fall out of step. The edit is the whole
edit — which is what makes this cheap enough to be worth doing at all.

## Decision

### 1 · One door, a union of two branches — not a second endpoint

`MailRunPatch` becomes `z.union([MailRunCancel, MailRunEdit])`. The cancel
branch is unchanged down to the byte on the wire; the edit branch carries the
copy fields and the hour, all optional.

Two doors on one resource are two places to forget a field. ADR 0004 splits a
route when two routes need two permissions, and that is not the case here
(§7) — so the split would buy nothing and cost a second contract to keep level
with the first.

### 2 · BOTH branches are `.strict()`, and the cancel half is the one that matters most

The first version of this decision put `.strict()` on the edit branch only, and
argued that this alone made the two exclusive. It does not: it closes one
direction of a two-way door.

The direction it does close is real. An object schema whose every field is
optional matches `{}`, and matches `{ state: 'CANCELLED' }` too, so without
strict a cancel could fall into the edit branch and change nothing at all,
silently. Strict makes `state` an unknown key over there.

The direction it left open is worse. The union tries cancel first, and
`MailRunCancel` was not strict — so `{ state: 'CANCELLED', subject: '…' }`
matched the cancel branch, zod stripped `subject` without a word, and the batch
was **cancelled** while the sender believed they had just rewritten it. An
ambiguous body did not get refused; it fell through to the destructive reading.

So both branches are strict, and the general lesson is the part worth keeping:
**in a union, a branch that is not strict swallows every ambiguous body — and if
that branch is the destructive one, the system's default answer to "I am not
sure what you meant" is to destroy.** Recorded as what it was: a hole in the
owner's first cut of this decision, not in the hands that built it.

### 3 · Absent and `null` are different words, in all three layers

A field left out leaves its column alone. An explicit `null` clears it. Only
the three nullable columns — `cta`, `booking_url`, `scheduled_at` — are allowed
to mean the second thing.

The consequence lands in SQL: the `SET` list is built field by field from what
is actually present, and `COALESCE(new, old)` is rejected outright. `COALESCE`
reads an explicit `null` as "unchanged", which would make those three columns
permanently impossible to clear once set.

### 4 · "Has not left yet" is a predicate in the `WHERE` clause, never a check in Node

The update qualifies a run by its own state plus `NOT EXISTS` over
`platform.email_delivery` for any row that is no longer `pending`. One delivery
off `pending` means a worker reached this batch — regardless of what the run's
state column says, because the sweeper draws that column after the fact.

Deciding it in Node leaves a window in which the relay posts a letter between
the read and the write. In the `WHERE` clause Postgres evaluates it against the
rows as they stand at the instant of the write. This is the same argument
`cancel()` and `sweepStates()` were already written on, and it is why the edit
did not get its own, gentler version of it.

### 5 · `EDITABLE_STATES` holds `SCHEDULED` alone; `DRAFT` and `SENDING` are left out for different reasons

`DRAFT` is absent because nothing ever writes it: a new run is filed
`SCHEDULED` (an hour was given) or `SENDING` (go now), and no other door sets
the column. Listing it would make this the only code in the system that
believes the state is reachable, and it would open a hole rather than add a
feature — the state sweep only promotes `SCHEDULED → SENDING`, so a `DRAFT`
handed an hour here would sit there for ever.

`SENDING` can be stopped but not rewritten. The composer renders each letter
from these columns as it goes, so editing mid-flight posts two different
letters under one batch, and the half already gone cannot be recalled to match
the half that has not.

### 6 · Moving the hour must move each letter's clock, in the same statement

`mail_run.scheduled_at` is not where the waiting actually happens; each
`email_delivery` row waits on its own `next_attempt_at`. Change one and forget
the other and the batch flies at the old hour with a new schedule printed next
to it. Both updates therefore sit in one CTE, not two round trips.

`scheduledAt: null` writes `next_attempt_at = NULL`, which
`MailRepository.pendingBatch` already reads as "due now" — that is the whole
mechanism behind "drop the hold, send on the next pass", and no new flag was
added for it.

### 7 · The permission does not split by branch

Both branches keep demanding `campaign.broadcast`, scoped. Editing a batch that
has not gone out is changing what is about to reach its whole audience: that is
the right to broadcast, not the right to draft. And picking a permission per
branch inside one handler is how permission holes are made, because the thing
that selects the branch is the body the client sent.

### 8 · An edit cannot change who receives it

The audience is frozen into `email_delivery` rows when the batch is created,
with `mail_run.audience_count` recorded beside it. Changing it is a different
operation with its own preflight for blocked and duplicate addresses. So the
edit is content and dispatch only — no recipient step, and no preflight run.

### 9 · A batch's name lives in two tables, and a rename must reach both

Found by review, after the branch above was already running. A wave's name is
written twice: `sales.mail_sequence_run.phase` is a verbatim copy of
`mail_run.label` taken when the batch is filed, and both the run book and the
edit modal print `phase ?? label`. An edit that stopped at `mail_run` therefore
had two effects, and the second is why this was a blocker rather than a cosmetic
miss:

- the rename was invisible — the screen kept showing the old name back to the
  person who had just changed it;
- `sameSequenceWave()` compares the stored `phase` AND the stored `label`
  against the posted label, so once the two drift apart a repeated POST of that
  same wave stops being idempotent and takes a permanent 409 "already exists
  with different content".

**Decision: when the patch carries `label`, the service writes the new value to
`mail_sequence_run.phase` inside the same transaction that wraps the update and
the audit note** — the two rows move together or neither does.

It is not folded into the platform repository's `update()`, and that is the
point: `mail_sequence_run` is a Sales table and `update()` lives under
`platform/`, which is not allowed to know about `branches/`. The write goes
through the Sales repository, called from the Sales service.

**Rejected: loosening `sameSequenceWave` to stop comparing `phase`.** If the two
rows always move together its comparison is correct as written. Weakening a real
gate to hide a symptom trades a visible 409 for a silent duplicate wave.

**What this leaves unfinished, stated plainly:** with no way left for `phase` to
differ from `label`, its own column is an intention rather than an independent
concept. Making it genuinely separate needs a `phase` field on `MailRunEdit`
first.

### 10 · `editable` is reported at read time, from the same predicate the gate uses

The read door returns `MailRunDetail.editable`, computed by the server. The
predicate is not restated for it: `stillEditable(runId, state)` is exported from
`apps/api/src/platform/mail/mail-run.repository.ts` and spliced into both the
read query and the `WHERE` clause of the update.

Two hand-copies of that condition is the worst bug available here — a form that
opens and then refuses to save, or one that refuses to open on a batch the
server would have accepted. One expression, two call sites.

It is a fact at read time, never a promise. A letter may leave between the
answer and the save, and the real gate remains the `WHERE` clause (§4). It
exists so a salesperson does not retype a whole letter before finding out.

## Consequences

**A `SENDING` run from which no letter has actually left is still refused.**
Knowingly. That state means a worker has the batch in hand, and guessing how
far it got costs more than telling the person to cancel and compose again.

**The rung about what is editable now lives in two books.** `EDITABLE_STATES`
in `apps/api/src/platform/mail/mail-run.repository.ts` decides the server's
answer; any screen that greys a button out is repeating the judgement, and no
compiler joins the two.

## Known and accepted

**An hour in the past is not refused at the edit door.** `send()` checks a new
wave's `scheduledAt` against the server clock; the edit branch does not. The
outcome is exactly the outcome of `scheduledAt: null` — the batch goes out on
the next sweep — so no data is wrong, and the screen blocks it anyway; only a
hand-written client reaches it. Read here, deliberately, a past hour means "send
on the next sweep".

**The read door hands back the whole letter and writes no audit line**, while
both write branches on the same resource do. Accepted because MAS copy is
written by the company about itself, `campaign.view` already sees the subject,
and the `comm.view-content` axis was built for private conversations rather than
for `mail_run`. The condition that ends this argument, so the next person can
spot it: the day MAS letters start carrying real customer data.

## Alternatives rejected

**A second endpoint for the edit.** Rejected under §1: same resource, same
permission, and a second contract drifting away from the first.

**`COALESCE(new, old)` for a shorter statement.** Rejected under §3: it costs
the ability to clear a CTA, a booking link or a schedule for ever.

**Reading the run in Node, judging "not sent yet", then updating.** Rejected
under §4: it reintroduces the race the cancel door was written to avoid.
