# 0045 · `CampaignSweeper` is a third sweep tier; "already touched" is redefined as any non-`pending` state

Status: accepted
Source: docs/ban-giao-campaign.md — section "Lượt 29/08 — vòng đời tự đóng, và ba lỗ hổng đã bịt", items 1 and 2

## Context

Reviewing the schedule path before building the FE surfaced two defects that
only show up when reading the SQL side by side, not when running one sample
batch.

**Defect 1 — `DONE` exists in the contract and in the `CHECK`, but nothing
ever writes it.** `start()` raises to `RUNNING`, `stop()` lowers to
`STOPPED`, and that is all. A campaign that finishes all its waves stays
`RUNNING` forever — wrong on every "currently running" filter and every
status-counted report.

**Defect 2 — a `SCHEDULED` wave gets stuck forever when every letter in it is
blocked.** `sweepStates()` raises `SCHEDULED → SENDING` when at least one row
reaches `SENT_STATES`. Three states mean "the worker touched the letter but
NOTHING left the machine" — `suppressed`, `failed_permanent`, `dead` — and
none of them are in that set. A wave whose entire audience unsubscribes
between the moment it is queued and the moment it is due (exactly the shape
of a multi-wave campaign spread over several days) never reaches `SENDING`;
the batch-closing pass only looks at `SENDING`, so the wave sits `SCHEDULED`
forever, showing "will fire at" a time that has already passed. A wave with
zero recipients has the same problem.

## Decision

A campaign cannot close itself with a single UPDATE inside `start()` — at
that point nothing has finished yet, and the last wave may be scheduled for
next week. It cannot live in `MailRunSweeper` either — `platform` is not
allowed to know that `sales.campaign` exists. So it becomes
**`CampaignSweeper`**, a third tier of the same sweep loop, running on the
worker's `PV_QUEUE_POLL_SECONDS` cadence:

```
MailRelay        a LETTER due and not yet sent   → becomes a job
MailRunSweeper    a WAVE with no letter left waiting → closes it, or trips the breaker
CampaignSweeper   a CAMPAIGN with every wave settled  → DONE          ← NEW
```

`CampaignRepository.closeFinished()` is one UPDATE statement, following the
same "the predicate lives entirely in the WHERE clause" logic as
`sweepStates()`. Its most important guard is an `EXISTS` check on at least
one wave: `/start` raises to `RUNNING` **before** the per-wave send loop (a
decision already recorded in ADR 0009), so there is a moment where a campaign
is `RUNNING` with no wave yet recorded — a sweep landing exactly there
without the `EXISTS` guard would close a campaign that has not sent a single
letter, and `DONE` has no way back.

For defect 2, the right question is not "has any letter left the machine"
but **"has the worker touched this wave at all"** — every state other than
`pending` answers yes. A second branch handles a wave with zero rows, and
`COALESCE(scheduled_at, created_at)` lets a `SCHEDULED` wave with no time
still escape.

A side effect: `sending` now also counts as "already started", so the
**bounce breaker sees a wave one tick earlier** — it only examines `SENDING`
waves, and the gap it used to miss was exactly one poll cycle.

## Consequences

`sending` counting as "touched" also feeds the circuit-breaker query in ADR
0040/0041's guardrail table — the breaker now examines a wave from the moment
it starts sending, not from the moment it finishes.
