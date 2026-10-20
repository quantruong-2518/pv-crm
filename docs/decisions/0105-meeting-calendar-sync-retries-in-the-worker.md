# 0105 · The meeting saves at once; Google Calendar is retried by the worker

Status: accepted
Source: project owner's decisions, 20/10/2026; built on branch
`perf-review-fixes` (migration 0127), not yet shipped. Answers finding 1 of
`docs/reviews/architecture-performance-and-vector-search.md`.

## Context

A meeting's Google Calendar event was written after the commit, once. A failed
call left the database and the calendar disagreeing, and nothing tried again.

## Decision

### 1 · The meeting saves at once; Google is retried silently

The booker is never blocked by Google. The worker retries in the background and
says nothing while it does (owner decision).

### 2 · The user is warned only after repeated failures

Bell `meeting-calendar-failed` at the 5th failed attempt, once per streak. The
kind is `important`, so it also pops up.

### 3 · A retry can never duplicate an event

The event id is derived from the meeting uuid. An insert answered with 409 is
turned into a patch.

### 4 · Dirty mark with compare-and-set

A write marks the meeting dirty; a push clears the mark only if it is still the
one the push read. When an edit overlapped a push, the meeting is marked again
for one more push of what it says now.

### 5 · Hard delete leaves a tombstone

A table of tombstones (migration 0127), written in the deleting transaction,
tells the worker which event to remove. Cancelled meetings (ADR 0103) are
removed by the same stable id.

### 6 · The sweeper rides the worker tick

No clock of its own (ADR 0082 §2); only the worker calls it; every read is one
batch, so a backlog drains over several passes.

### 7 · Retry schedule: defaults chosen by the implementer, pending owner sign-off

Values live in `apps/api/src/branches/sales/meeting/meeting-calendar.repository.ts`
(`dueBy`, `CALENDAR_BATCH`, the seven-day cutoff in `duePushes`),
`meeting-calendar.ts` (`CALENDAR_ALERT_AFTER`, `CALENDAR_DROP_GIVE_UP`) and
`meeting-cancel.sweeper.ts` (pass intervals):

- backoff 1, 6, 21, 81 minutes, then +60 minutes per attempt;
- pushes abandoned 7 days after the last edit;
- tombstones abandoned after 10 attempts;
- batch 50 per read;
- pass every minute, the cancelled-meetings pass hourly.

## Consequences

Known residual gaps (from the review):

- A drop racing an in-flight insert can orphan an event.
- Each worker attempt fires one `meeting` push to open tabs through the 0126
  trigger (ADR 0104).
