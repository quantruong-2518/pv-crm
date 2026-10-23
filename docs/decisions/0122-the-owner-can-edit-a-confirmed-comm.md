# 0122 · The owner can edit a confirmed comm, without reopening it

Status: accepted (amends 0074 §5's owner fence, 0075 §2's `done` state and 0094 §3's "no reopen"; reads 0121 for the temperature)
Source: project owner's decision, 23/10/2026

## Context

A confirmed (`done`) record was final: the owner could not fix a typo in the
summary, a wrong answer or a wrong next step, and the read view of a done record
was read-only for everyone. 0094 §3 ruled the close irreversible. The owner
wants to correct a record without making it open again.

## Decision

### 1 · Who and which records

`POST /comms/debriefs/:id/edit`, contract `DebriefEdit`
(`packages/contracts/src/comms/debrief.ts`). Only the record's owner (the
person who logged it, 0074 §5), and only on a record in state `done`.
Unreached, open, scheduled and cancelled records are not edited through this
door.

### 2 · Editing is not reopening

The record stays `done`. 0094's "no reopen" stands: nothing returns to the
pending queue, no state changes, no close-out is asked again.

### 3 · What can be edited

Everything the close-out holds: title, summary, evaluation answers, files,
temperature (customer in `growth`, 0121) and the next step.

- **Answers** are re-validated against the current vocabulary and replace the
  old ones.
- **Next step and temperature** are editable only while the step this record
  set still stands on its subject (for a bought customer, the run's lead). The
  edit REPLACES that step through the normal next-step write, under the same
  scope, doer and template rules as a close-out, and never marks anything
  done. Once the step is done or has been changed elsewhere, the step part is
  refused with 409 and is edited on the lead or the deal.
- **Temperature** needs a step in the same edit, and updates that record's own
  temperature reading instead of adding a new one.

### 4 · Trace

One audit line per edit. The edit itself rings no one; a replaced step rings its doer as every step write does, so the doer learns their work changed. No new column.

## What this amends

- **0074 §5** — "Only the person who logged the comm may close it": the same
  fence now also covers editing a confirmed one.
- **0075 §2** — the `done` state, "Đã hoàn thiện", is no longer read-only for
  its owner.
- **0094 §3** — "There is no reopen" stands; an edit is not a reopen.

## Alternatives rejected

| Alternative                                  | Why not                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Reopen the record to the owner               | 0094 ruled the close final; a reopened record also re-enters the queue |
| Edit the step even after it was done/changed | It would rewrite or undo work already done on the subject              |
| Let the manager edit                         | 0074 §5: managers see counts only; the owner is the one who wrote it   |

## Consequences and known limits

- No "edited at" is shown: nothing is stored beyond the audit line.
- After the step is done or changed, a wrong step or temperature on the record
  cannot be fixed from the record.
- Law 12/13 on the edit mode have not been checked in a browser.
