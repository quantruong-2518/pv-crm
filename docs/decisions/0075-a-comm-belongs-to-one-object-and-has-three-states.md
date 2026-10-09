# 0075 · A comm belongs to exactly one object and has three fixed states

Status: accepted (narrows 0074 §5: one comm → one object; 0074 §2 and §10 keep their intent, labels fixed here)
Source: project owner's decisions in chat, 01/10/2026

## Context

0074 built the close-out backbone with a comm that may link to several objects
and a next-step target the user picks. The v2 design drops that choice, adds a
state the queue can show before anything is typed, and names where comm records
come from. This ADR records those decisions and what the backbone must change.

## Decision

### 1 · One comm, one object, fixed at creation

A comm is the contact in every flow. Its subject can be a lead, an
opportunity or a contract, exactly ONE, fixed at creation. There is no "Đặt cho"
picker. Next steps exist only for a lead or an opportunity; any other subject
(a contract, as 0074 §5) has none. This narrows 0074 §5, last bullet: there is
no longer a user-picked target among several.

### 2 · Three states, fixed labels

| State         | Label (quoted, fixed) |
| ------------- | --------------------- |
| `empty`       | "Chưa điền nội dung"  |
| `unconfirmed` | "Chưa xác nhận"       |
| `done`        | "Đã hoàn thiện"       |

Order: "Chưa điền nội dung" → "Chưa xác nhận" → "Đã hoàn thiện". The action
button is "Xác nhận" (not "Chốt"; 0074 §10's "Chốt" chip takes this label).
Completion is still summary + evaluation + mandatory next step (0074 §2). Labels
are precise and neutral, no colloquial wording.

### 3 · Where comm records come from

Amended by ADR 0081: Telegram and WhatsApp buttons join Gọi / Zalo / Gửi mail.

- The **Gọi / Zalo / Gửi mail** buttons: a confirm dialog, then the record is
  created as "Chưa điền nội dung", then the action opens.
- A meeting that ends: a scheduled job creates the record automatically.
- **Ghi liên hệ**, manual, on mobile, four steps: sales run → method (icon) →
  content + attachments → next step.
- Mail BCC and chat bots: a later turn.

### 4 · Attachments on the comm

A comm takes a recording, a transcript, minutes (MM) and chat screenshots.

### 5 · Where the 0074 backbone deviates, and the fix

| Deviation                                                            | Fix                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comm links several objects; `targets()` lets the user choose a place | The debrief carries a fixed `subject_code` = the source object; `targets()` returns only that object (empty if closed or contract); `subjectCode` leaves the confirm body |
| State is only `open`/`closed`                                        | "Chưa điền nội dung" is derived: debrief open and the turn has neither content nor file; the contract returns `state: empty \| unconfirmed \| done`                       |
| No files on a comm                                                   | `platform.attachment` exists with `owner_kind IN ('lead')`: widen to `('lead','comm')`, owner_code = debrief id                                                           |
| No door that creates a record from a button                          | New door creates an empty turn and opens the debrief, returns the id; web opens `tel:` / Zalo / mail composer only after the door returns 201                             |
| A meeting does not generate a comm                                   | A timed job at `meeting.at + duration` creates a thread on channel `meeting` (it already has `meetingId`) and a debrief for the scheduler                                 |
| The scheduling screen still has a transcript field                   | The server no longer writes `transcript`, so the field loses data silently: remove it and replace with the comm, in the same commit as the backend                        |
| No comm tree per sales run                                           | A read door: the pending comms of one sales run (for step 2 of the mobile flow)                                                                                           |

### 6 · Owner answers to the open questions (01/10/2026)

- Original recordings are kept forever; there is no deletion job.
- The summary cap is 2,000 characters. This replaces the 4,000 the backbone used
  (an arbitrary number, not set by 0074's text).
- AI pre-fill (Gemini) is deferred to a later turn. This turn is manual only;
  0074's seam stays, and law 9 still applies when it arrives.
- The Gọi button stays visible on desktop and opens `tel:`.
- Confirmation deadline is 1 day: a comm left unconfirmed for more than 24 hours
  since creation is shown as late.

### 7 · Further owner decisions (01/10/2026)

Amended by ADR 0081: Telegram and WhatsApp move a lead to `working` like Zalo.

- Attachment size: audio up to 50 MB; other files (image, pdf, docx, txt) up to
  15 MB. The owner of the record may delete a file while the record is not
  "Đã hoàn thiện"; recordings are kept, no automatic deletion.
- The action buttons create the customer's address in the identity book from the
  contact's phone or email when missing. A contact must belong to the subject.
- Gọi / Zalo / Gửi mail on a LEAD moves the lead to `working` at once. The lead
  toolbar's Gọi goes through the same confirm dialog; the old second press
  "Đã gọi" is dropped.
- Mobile "Ghi liên hệ": step 4 also asks the evaluation. "Lưu liên hệ" confirms the
  record in one go (state "Đã hoàn thiện"); the step-3 content becomes the summary.
- Meeting end: a pg-boss job at the meeting's end creates the record. Owner = the
  person who scheduled the meeting; subject = the meeting's lead (meetings only
  carry a lead). It does not move the lead's status.
- Attachment links and summaries are content: shown only to roles that may read
  content, and each view is audited.
- Channel colours: two new tokens, for the phone and meeting pills.
- A comm may only be created by someone who can confirm it: on an open lead or
  opportunity the creator must be able to set its next step, else creation is
  refused. A read-only check tells the screen beforehand.
- The mobile flow creates the comm only when "Lưu liên hệ" is pressed.
- An address already in the identity book under another lead or a colleague is
  refused; under the same lead it is reused.
- A button comm's turn is outgoing, from the staff member to the customer. A
  staff member without an address in the book gets one from their work email.
- The UI uses the Vietnamese "liên hệ" everywhere (menu "Liên hệ", "Liên hệ của
  tôi", "Lưu liên hệ"), plain and explicit; code identifiers stay `comm`.

## Consequences

- A comm's place never changes, so the next step never needs a target choice and
  the confirm body is simpler.
- A record exists before any content does; the queue can show "Chưa điền nội dung"
  and the late mark has a defined start (creation time).
- Recordings accumulate with no cleanup; storage cost is accepted.
- The migration, contract, API and screens listed in §5 must change; the
  backbone is not yet shipped, so 0075 migration edits go in place.

## Out of scope

- AI proposal of summary, answers and next step (later turn).
- Mail BCC and chat-bot capture.
- A next step on contracts (unchanged from 0074).
