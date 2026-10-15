# 0097 · The waiting group always has a holder, and one hold list "Tạm hoãn" serves leads and deals

Status: accepted (settles 0088 §5, §10 and §14; amends 0069 §3; keeps 0068 §4; answers open question 68; §8 answers questions 92–100)
Source: project owner's decisions in chat, 15/10/2026, one question each

## Context

0088 decided the waiting group, the pause list and the leaver hand-over in a
line each and left them unbuilt. Building them raised the questions below: who
may park a lead, what happens to a lost deal's lead nobody holds, what a hold
is and what happens on its date, who is reminded. The owner ruled on each.
This record is the decisions, not the implementation. Out of scope: the
signed-customer list (question 71) and the contract lane.

## Decision

### 1 · Every lead state with a holder can be parked by hand

A person may put a lead into "Nhóm chờ chăm sóc" (`nurturing`) from any open
state that has a holder. A `converted` lead may be parked only when it has no
live opportunity and nothing signed — the same condition the way out of
`converted` already uses. Entering the waiting group by hand still cancels
unsent mail (0068 §6).

### 2 · The waiting group always has a holder

- A lead in the waiting group, or on hold (§3), may change holder but is never
  released with no holder. The release is refused, with the sentence "Lead
  đang ở Nhóm chờ chăm sóc nên chỉ đổi được người giữ, không bỏ trống được."
- When the last live deal of a lead is stopped with nothing signed, the
  person stopping it decides where the lead goes, held lead or not (owner,
  15/10/2026: "lead đã qua tới opp thì phải để PIC op quyết định"). The stop
  dialog asks "Lead này đi đâu?" and one answer is required: "Đưa vào Nhóm chờ
  chăm sóc" with a holder — the lead's holder, else the deal's primary Sale
  (0086), else the stopper; a new holder is told — or "Ngừng chăm sóc lead"
  with a reason from the lead's own exit list. Nothing parks on its own, and
  the landing on `new` for an unheld lead no longer exists.
  The choices follow the lead's own doors: "Ngừng chăm sóc lead" needs the
  right to stop caring for that lead, and a holder other than the first in
  that chain needs the right to assign leads; a holder must be able to work
  a lead.

### 3 · The hold list "Tạm hoãn", for leads and deals

One list, shared, as 0088 §10 asked. A hold is an **overlay record** on the
lead or the deal, not a new state: no value is added to the lead states or the
deal statuses, and an object has at most one open hold.

- **Who and when.** A hold is set on a lead that has a holder, in any state
  from `assigned` to `nurturing`; and on an open deal that has a stage and no
  sign request waiting. It carries a date "Ngày hẹn gặp lại" in the future and
  a note. The date and note may be changed ("Đổi ngày hẹn").
- **At the date nothing moves.** The row stays in the list and its pill goes
  from "Đến hạn" to "Quá hạn" on the existing due ladder. The "Gần hạn" window
  is half a month (the owner's "nửa tháng").
- **Ending a hold.** "Bỏ tạm hoãn" returns the object to the step it was in, with
  the clock shifted by the time it was held. A lead has a second end,
  "Chuyển sang Nhóm chờ chăm sóc", which parks it as §1. A deal has no second
  end: "no longer worth waiting" is the existing stop, which is final (0069
  §1) and ends the hold.
- **A real exchange ends a lead's hold.** The touches that bring a waiting
  lead back to `working` (0068 §4) also end its hold. Marking the lead "Ngừng
  chăm sóc" ends it too.
- **While held.** A held lead leaves "Đang hoạt động" and the waiting group in
  the lead book (and "Đang hoạt động" no longer lists the waiting group at all
  — §8) and has its unsent mail withheld, as in §1; no campaign
  audience takes it. A held deal leaves the board and the overdue counts, its
  clock stopped; moving its stage, signing and recording a quotation are
  refused until "Bỏ tạm hoãn", stopping is allowed.
- **One list.** "Tạm hoãn" shows leads and deals together, filterable by kind,
  sorted by date. The profiles, the lead book and the workstream tree show the
  hold where they show the object.

### 4 · Reminders (answers question 68)

The bell rings the lead's holder or the deal's primary Sale, and also the
person who set the hold when that is someone else. Twice: half a month before
the date (not when the hold was set inside that window) and on the date. Each
rings once. They are two new notification kinds under the per-role policy of 0093. They ride the worker sweep that already exists; no new always-on poll
is added, the reason 0082 §2 refused one and question 69 still weighs.

### 5 · Waiting labels (0088 §5)

Labels are their own config list, "Nhãn nhóm chờ", edited on the settings
screen like the other lists. They are attached to a lead by hand, one or many,
in any open state, by whoever may edit the lead. The lead book filters on
them, the park dialog can pick them, and the campaign audience picker filters
on them. They are not the park reason.

### 6 · A campaign's end parks the silent again

When a campaign closes, each audience lead that was in the waiting group when
it was enrolled and has had no real customer exchange since the campaign began
goes back to the waiting group, with the reason "Không phản hồi chiến dịch",
recorded as the system's act and not a person's. A real exchange is a reply, a
call, a message or a held meeting; a mail sent to the lead does not count.

### 7 · Locking an account asks who receives (0088 §14)

Locking a user who still holds open sales work is refused unless a receiver
is named. Open sales work is: open leads (waiting, held, and converted with a
live deal included), open deals as holder or primary Sale, and open next steps
assigned to that user. With a receiver, all of it moves to them in one step.
The lock screen shows the counts and asks for the receiver. Past credit keeps
the old name (0088 §14).

Switched-off leads move too, with their deals and next steps, so nothing
stays on the locked person. The lock screen names them apart ("Kèm N lead đã
vô hiệu"), holding only those still asks for a receiver, and the receiver's
line does not count them (§8).

A deal whose sign request is still waiting does not block the lock and does
not move: it stays on the locked person until the request is decided (owner,
15/10/2026). It is not counted on the lock screen.

### 8 · Rulings on the build's defaults (owner, 15/10/2026, after landing)

- **Campaign end (§6).** The campaign owner gets one line: "Chiến dịch … đã
  chạy xong · N lead không phản hồi đã về Nhóm chờ chăm sóc". Other holders
  of those leads still get their own line.
- **Lock receiver (§7).** One line naming the leaver and counting leads,
  deals and next steps; a kind at zero is left out of the sentence.
- **Deal with no primary Sale (§4).** Its reminder rings everyone on the deal
  plus whoever set the hold.
- **Lead book.** "Đang hoạt động" lists the open states without the waiting
  group, which has its own tab; the campaign picker still offers both.
- **Labels card (§5).** Shown on a lead in the waiting group or one already
  labelled.
- **Campaign end, old campaigns (§6).** Only campaigns enrolled after this
  build re-park; no backfill.
- **Reminders (§4).** Hourly; a date moved inside the half-month window gets
  only the day-of reminder.
- **Button.** The hold's way back is "Bỏ tạm hoãn".
- **Due pill.** Its text uses the main ink on every table, so a selected row
  stays readable in the light theme.

## Superseded and amended

- **0068 §4** — "the holder is kept while a lead sits in `nurturing`": stays,
  and is now an invariant (§2) instead of a habit.
- **0069 §3** — "the lead moves `converted` → `nurturing`, holder kept": the
  move is no longer automatic; the person stopping the last deal chooses the
  waiting group (with a holder) or "Ngừng chăm sóc" (§2).
- **0088 §10** — "a reminder half a month ahead to the people who need to
  know": the recipients and the second reminder are settled in §4. "The
  fallback is the waiting group" is the second end of §3.
- **0088 §5** — "labels … their own config list": built as §5.
- **0088 §14** — the leaver prompt: built as §7.
- **The original flow's C6**, "a lead lying in the waiting group is held by
  nobody", stays superseded; §2 makes the opposite a rule.
- **0068 §1** — "park from `verifying` or `working`" widens to §1.

## Consequences

- The waiting group, the hold and the deal board stay disjoint: a held object
  is in no other list, so a count that adds them cannot double-count.
- Because a hold is an overlay, every reader of lead state or deal status is
  unchanged; only the lists that must hide a held object learn about it.
- The campaign end is the first machine entry into the waiting group; its
  reason row must exist on every database, seeded and migrated.
- Nothing is lost at a hold's date; a hold nobody reopens shows as "Quá hạn"
  for as long as it lasts. This is the owner's choice, not an oversight.
