# 0103 · Closing a lead or deal cancels its future meetings

Status: accepted
Source: project owner's decisions, 19/10/2026

## Context

A lead or deal could be stopped while meetings were still booked on it. The
meeting stayed on the booker's calendar, in today's list and in the countdown,
and the guests were never told. Nothing said the meeting no longer made sense.

## Decision

### 1 · Three doors cancel the subject's meetings that are still ahead

A meeting is cancelled when `at > now`, it is not held and not already
cancelled. The cancel runs inside the door's own transaction:

| Door                         | Cause               | Meetings cancelled                                                                      |
| ---------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| Deal stop                    | `opportunity-lost`  | the deal's; when the stopper also stops the lead, the lead's too as `lead-disqualified` |
| Lead exit ("Ngừng chăm sóc") | `lead-disqualified` | the lead's                                                                              |
| Lead disable                 | `lead-disabled`     | the lead's and all its deals'                                                           |

Nurture ("chờ chăm lại") does **not** cancel: the lead is expected back. A
meeting already started but not closed out is left alone.

### 2 · Soft cancel, not delete; two marks for one fact

`sales.meeting.cancelled_at` and `cancel_cause` (migration 0124; a CHECK keeps
them from ever sitting beside `held_at`). The booked comm record closes as
`cancelled` (`comms.debrief.cancelled`, `CommRecordState.cancelled`).

The fact is marked twice because `platform/` may not read branch tables. Only
`MeetingCancel.cancelFor` (`apps/api/src/branches/sales/meeting/meeting-cancel.ts`)
writes both, in one transaction.

### 3 · Google Calendar events are removed after commit

Events are removed only after the transaction commits, with `sendUpdates=all`:
guests get Google's own cancellation mail. Only meetings synced to Google send
mail. An hourly sweeper retries for 7 days; a booker who disconnected Google
past that is given up on and the event stays orphaned — accepted. The sweeper
never runs in script contexts.

### 4 · Bell `meeting-cancelled` to the booker, for two doors only

It rings the booker when someone else closed the subject: deal stop and lead
exit. Lead disable rings nobody: the subject is hidden from the booker, so the
link would 404, and that door never rang.

### 5 · Reopen and re-enable restore nothing

Same rule as withheld mail (ADR 0068 §5). The booking's timeline touch
("Đặt lịch gặp lần đầu…") stays as history and still counts for first-meeting,
so booking again after a reopen does not write a second first meeting.

### 6 · Readers exclude cancelled meetings

Today and countdown, upcoming, the lead scorecard's first meetings, the
workstream footprint, the mail-wave gate "met", KPI debriefs-closed, and the
deal's last activity.

### 7 · The confirm dialogs say how many

The stop and exit dialogs show how many meetings will be cancelled, counted
with the server's rule. The disable dialog states it generically; the disable
response carries `cancelledMeetings`.

### 8 · One-off backfill for meetings already stuck

`pnpm --filter api db:backfill:meeting-cancel` — preview by default, `--apply`
to write. It cancels meetings that already sit on closed subjects. It writes
Neon, so the owner runs it on production.

## Consequences

- Ship order: migrate 0124 before deploying the API; ship the API before
  pushing web.
- Adding a fourth door that closes a subject means calling `cancelFor` in that
  door's transaction, not a new mark.
- Open: whether the workstream footprint should count a future booked meeting
  as contact at all, and whether the confirm line should count only meetings
  that will mail guests — see `open-questions.md` 101–102.
