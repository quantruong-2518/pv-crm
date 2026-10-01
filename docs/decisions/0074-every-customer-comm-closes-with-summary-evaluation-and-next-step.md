# 0074 · Every customer comm closes with a summary, a plain-language evaluation and a next step

Status: accepted (extends 0050; extends 0049's hook pattern; narrows 0011's meeting-transcript door; leaves 0072 care activities untouched)
Source: project owner's decisions in chat, 01/10/2026

## Context

Raw comm data (calls, meetings, Zalo/Telegram chats, mail) piles up without
anyone saying what it meant or what happens next. Blocking the capture to force
that would lose the raw record; leaving it optional means it never gets done.
The owner wants capture never blocked, and a close-out that is soft-enforced.

## Decision

### 1 · A comm, and its module

Every communication with a customer — call, meeting, Zalo/Telegram chat, email —
is a comm. Comms is its own module spanning the whole journey (lead →
opportunity → contract → after-sales) and stays in `platform/comms` (0050).

### 2 · Raw is saved first; the close-out is pending

Raw data is ALWAYS saved immediately and never blocked. The comm then sits
"chờ chốt" (pending close-out) until its owner closes it with:

- a SUMMARY — required text. Later an AI may propose it; a human presses the
  button (law 9). Only the seam is built now;
- an EVALUATION against admin-editable criteria (§3);
- a MANDATORY NEXT STEP whose type is chosen from an admin-editable list (§4).

Enforcement is soft: each person has a queue of their pending comms, and
managers see counts.

### 3 · Evaluation is words, not scores

Owner: "không chấm mà là chữ rất dễ hiểu và sáng nghĩa". Each criterion is a
plain-language question with its own plain-language answers set by admin, e.g.
"Khách quan tâm thế nào?" → "Rất quan tâm" / "Có quan tâm" / "Chưa quan tâm".
The closer picks ONE answer per active criterion. Nothing is numeric and
nothing is summed. Later an AI may propose answers (seam only). With no active
criteria the evaluation is empty, not an error.

### 4 · Config lists

Three lists join `sales.config_entry`, reusing the config screen, the approval
box and `config.view`/`config.propose`: `COMM_CRITERION` (the question),
`COMM_ANSWER` (belongs to one criterion) and `STEP_KIND` (next-step types).
Seed values are in the migration and `seed-config.ts`, not here.

### 5 · Who closes, and what a contract gets

- Only the person who logged the comm may close it. The owner stays the owner
  after a hand-over. Managers see counts only.
- A comm linked to a contract (after-sales) takes NO next step for now; it
  closes with summary + evaluation.
- The next step is mandatory only when the comm links to an object that can take
  one (open lead, open opportunity). With several linked objects there is one
  evaluation per debrief and the next step goes to exactly ONE target the user
  picks; the object the comm was logged from is preselected.

### 6 · One debrief per (thread, owner)

The unit is a `comms.debrief`, separate from `comms.message`, which stays the
immutable raw record. At most one OPEN debrief per (thread, owner); a new turn
on a thread with an open debrief joins it. Automated MAS sends never open one;
auto-capture is not built.

Names of criteria, answers and the step kind are copied into the debrief, so
renaming or disabling config never rewrites history. The step is copied too,
because `sales.next_step` is replaced later and the copy is the only history.

### 7 · Platform ↔ Sales

`comms` stores config ids as plain text and has no foreign key into `sales`.
The dependency runs backward through the token `COMM_DEBRIEF_HOOK`, the same
inversion as 0049 (`MAIL_COMPOSER`) and the `MESSAGE_LOGGED_HOOK` pattern, with
0050 fixing where `comms` lives. Sales implements it: which linked objects can
take a step from this caller, validation before the transaction, and applying
the step (setting it, or marking the previous one done and setting the new).
Debrief, answers, audit and the step are written in ONE transaction.

### 8 · Next-step types

A next step carries a type from `STEP_KIND`. If the object already has a step,
the form offers "Việc trước đã xong", which goes through the existing done path.

### 9 · Meetings

`sales.meeting` stays the scheduling record. Minutes after a meeting are a comm
like any other: a message on a thread whose channel is `'meeting'`, one thread
per meeting. `meeting.transcript` stops taking new writes; old text stays
readable on the meeting card, with no data move. This narrows 0011's
meeting-transcript door: minutes enter through comms, not through a meeting
field.

### 10 · Queue and counts

A pending queue per person, counts per owner for managers (an own-only caller
sees only their own row), a badge in the app chrome and a "Chốt" chip on each
pending message. The close-out opens right after a manual capture.

### 11 · Timeline and privacy

- No new touch kind. Closing writes no touch of its own; only the existing
  `next-step-done` appears when a previous step is marked done.
- The summary is content: a caller with `comm.view` but not `comm.view-content`
  gets it hidden, same shape as message content. Answers and the step copy are
  metadata and stay visible.

## Consequences

- Capture is never slower; the cost is a queue people must work through, kept
  honest by manager-visible counts.
- Evaluations are comparable across comms without any scoring model, and an AI
  can later fill them in without changing the shape.
- Config grows three lists on an existing screen; no new approval mechanism.
- Old meeting transcripts remain in place and are no longer extended.

## Out of scope

- Auto-capture of comms and AI proposal of summary or answers (seams only).
- A next step on contracts.
- 0072's care activities (sample, POC, demo, site visit) are unchanged and are
  not touched by close-out.
