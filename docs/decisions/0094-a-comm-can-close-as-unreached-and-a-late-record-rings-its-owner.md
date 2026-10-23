# 0094 · A comm can close as "could not reach", and a late open record rings its owner

Status: accepted (amends 0074's close-out rule, 0075 §2 and §5, 0085 §2, §6 and the "Clock-driven reminders" line of "Not in wave 1")
Source: project owner's request, 13/10/2026 — "làm nút không liên lạc được với nhắc lượt bỏ trống" (quoted; scoring was taken out of scope)

## Context

0074 closes every comm with a summary, an evaluation and a next step; 0075 §2
makes that the completion rule. A call that nobody answered has nothing to
summarise, so the owner either invented text or left the record open until it
was late. Open records were also silent: 0085 §2 kept the bell free of
clock-driven reminders in wave 1.

## Decision

### 1 · A fifth state, `unreached`

A record can close as `unreached`, label "Không liên lạc được". It is derived
like the other states (`CommRecordState` in `packages/contracts/src/comms/thread.ts`,
`STATE` in `apps/api/src/platform/comms/debrief.repository.ts`) and stored as one
marker, `comms.debrief.unreached`, in the style of `booked`. It closes with no
summary, no evaluation answers and no next step: the one exception to 0074's
"every comm closes with summary + evaluation + next step" and to 0075 §2's
completion rule. Migration `0107_comm_unreached` relaxes
`debrief_closed_has_summary` for it and adds `debrief_unreached_is_bare`
(unreached implies closed, summary-less, step-less, not booked). "No answers"
stays the write door's rule: a CHECK cannot see `comms.debrief_answer`.

### 2 · The door and who may use it

`POST /comms/debriefs/:id/unreached`, permission `comm.view`, only the record's
creator, only while open. Refused with one 409 title on a booked meeting and on
any record whose thread channel is `meeting`.

It writes nothing on the subject: the lead state move made when the record was
opened stays, and no next step is set.

The door is deliberately looser than `close` on reach. `close` asks the branch
whether the closer can set the next step on the subject; this door does not ask.
A creator who has lost reach of the subject can still close their own record
this way, because it is their only exit.

### 3 · Irreversible

There is no reopen. The web asks once before closing
(`apps/web/src/components/comm-unreached-dialog.tsx`). The button sits in the
record page's form bar and folds into the "Khác" menu under `sm`.

Amended by ADR 0122: an edit of a confirmed record is not a reopen; "no reopen" stands.

### 4 · One clock-driven bell reminder

Kind `comm-record-late`, subject kind `comm-record` (code = debrief id), group
`next-step`. An hourly self-timed sweeper
(`apps/api/src/platform/comms/comm-late.sweeper.ts`) rings the record's creator
when an open, non-booked record passes `COMM_CONFIRM_WITHIN_HOURS`, and only
while it has been late for less than one more such window: a record is told
once, and a deploy rings no backlog. It goes
through E4 (rule `COMM_RECORD_LATE` in `packages/engines/src/e4-bell-rules.ts`)
and the hub; a duplicate is refused by UNIQUE (recipient, event_key), and
`NotificationHub.told` only saves the sweeper from re-announcing the standing
backlog each tick. Migration `0107` widens the two kind and subject lists on
`platform.notification` and 0093's copy on `notification_kind_policy`. Under
0093's policy the kind is neither important nor locked, and a `comm-record`
subject is opened with `comm.view`.

### 5 · Counting is not decided here

How an unreached record counts in KPI, first-contact and last-activity is
unchanged and is not decided here.

## What this amends

- **0074** — the title ("Every customer comm closes with a summary, …") and
  the sentence that the comm is closed with a summary, an evaluation and a
  mandatory next step: `unreached` is the exception (§1).
- **0075 §2** — the state list gains `unreached`. It was already missing
  `scheduled` (a booked meeting not yet held); no earlier ADR lists it. **§5**,
  row "State is only `open`/`closed`": the contract's `state` has five values.
- **0085 §2** — "no clock-driven reminder in wave 1": one exists now (§4).
  **§6** — subjects are of nine kinds, `comm-record` added. **"Not in wave 1"**,
  first line: the overdue reminder for an open comm record is built; due and
  meeting-today reminders stay wave 2.

## Alternatives rejected

| Alternative                               | Why not                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Let the owner type a placeholder summary  | A made-up summary is data nobody can tell from a real one                 |
| Allow reopening                           | The owner ruled the close final; the dialog asks once                     |
| Make the door require reach, like `close` | The creator who lost reach would have no way out of their own open record |

## Consequences and known limits

- A record already late for more than one window when the sweeper first runs
  is never rung; it stays in the pending queue with its late mark. So is one
  that turned late while the API was down for longer than a window.
- An unbooked meeting-channel record can be `late` and is rung, though it cannot
  be marked unreached.
- `comm-record-late` sits in the `next-step` group; the owner may want another.
- `StatusDot` has no neutral closed state; `unreached` borrows the `scheduled`
  dot.
- `debrief_unreached_is_bare` has no entry in `DEBRIEF_CONSTRAINTS`
  (unreachable through the door).
- Law 12/13 on the new button, dialog and read-only page have not been checked
  in a browser.

## Rollout

Migration `0107` → API → web. Migrate first: the old build never writes the
column, and the new build reads it.
