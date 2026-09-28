# 0067 · Presale in the repeating journey: every stop parks the lead in `nurturing` ("Chờ thời điểm"), waking opens a new lead and a new journey

Status: accepted (partially supersedes 0057 §2, 0058, 0063 §1/§2/§4, 0064 §3
and §6, 0066 §6 — exact paragraphs under "Superseded")
Source: project owner's answers to D1–D11 in session, 28/09/2026; the shared
flows C, A2, D, G and H agreed 27/09 (`.claude/HANDOFF-workstream-loop.md`,
"Luồng chung"); the presale plan page
https://claude.ai/artifact/Ho7qfF1zV5M93Tv5x5LSXV, §1 "Luồng đích" and §3
"Chênh lệch"

## Context

A company repeats forever; each journey (`sales.workstream`) is one sales
round, one lead per journey. Under 0057/0058/0063 a lead could end in two
terminal states (`disqualified`, `archived`), come back in place (`reopen`,
`resume`), and was archived by a sweep after six months in `nurturing`. The
repeating-journey model has no dead end and no in-place return: a round that
stops waits, and the next round is a new lead.

## Decision

### 1 · Phase is a label; six lead states

Phase is a grouping label only (Presale = the lead), never a state.
`lead.state` is written only by the server. States kept, with the product
labels of 0063 §1:

`new` "Khởi tạo lead" · `assigned` "Nhận PIC" · `verifying` "Tạo chiến lược
chăm sóc" · `working` "Tình trạng chăm sóc" · `converted` "Đổi thành Opp" ·
`nurturing` "Chờ thời điểm" — the **only** stop.

`disqualified` ("Không theo nữa") and `archived` ("Lưu trữ") are retired.
Their rows migrate into a stop record (§4) with reason "Khác" and a note naming
the old state.

Existing `nurturing` leads under the old rule (holder kept, resumable in place)
migrate the same way: each becomes a stop record, reason "Khác", note naming
the old rule/state; the holder is cleared and the lead is listed in "Chờ thời
điểm". Working it again is a wake — new lead, new journey.

**D1** — a lead's sub-rung is evidence read from the activity trail (the touch
that moved it to that rung), not a stored column.

### 2 · Transitions

| State       | Entered by                                                                                                                                          | Holder after               | Evidence shown in the drawer                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `new`       | create without an owner, file import, landing, campaign wake, release to pool                                                                       | nobody (pool)              | source + motion: new · growth from journey N · woken from a stopped lead |
| `assigned`  | claim from pool, assignment, create with an owner, scan, manual wake (the clicker holds), growth (the decider holds)                                | PIC                        | who assigned whom, when                                                  |
| `verifying` | the holder schedules care: a future meeting, a scheduled mail run, a scheduled group mail                                                           | PIC                        | the planned meeting / mail run, and its date                             |
| `working`   | a real exchange: "Đã liên hệ", a logged message/call, a meeting that took place, **a customer reply to a mail or a booking made from a mail** (new) | PIC                        | the first real exchange and the count since                              |
| `converted` | the first opportunity is opened (also from `new`, `assigned`, `verifying`, as today)                                                                | PIC (opportunity inherits) | opportunities spawned                                                    |
| `nurturing` | a stop at any rung with a catalogue reason; or the machine stop at campaign end (§5)                                                                | nobody                     | the stop record: date, rung, reason, who concluded, the old journey      |

`assigned` → `new` is release to pool. Stop is allowed from `new`,
`assigned`, `verifying` and `working`. There is no way out of `nurturing` for
the same lead — waking (§5) opens a new one.

A customer reply or a booking from a mail is a system event: it moves the lead
whoever sent the mail. Opening a mail or clicking a link does not count (flow
A2).

Side effects, each in the same transaction as the write that caused it:

| Event                        | Writes                                                                                                 | Journey                                                                         | Bell                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Lead born (any door)         | mirror first (0043) → account → `belongs-to` edge → journey → lead → primary contact → `created` touch | opens a new journey; wake/growth add a "continued from" edge + motion + decider | new lead in pool, batched per wave                    |
| Holder change                | `handed-over` touch from → to; open children offered pre-ticked to follow                              | —                                                                               | assigned                                              |
| Care planned / real exchange | `care-planned` / `exchange-logged` touch, `state_since`                                                | stand updated                                                                   | customer reply → holder; lead in pool → head of sales |
| Stop                         | stop record + `stopped` touch; owner → null                                                            | nothing signed and nothing else open → closes `LOST`                            | —                                                     |
| Wake                         | new lead (as a birth) + the stop record gets `woken_at`, `woken_lead`; the old lead unchanged          | new journey linked to the old one                                               | campaign: new leads into pool, batched                |
| Next step set / done         | the step row; done → activity touch + ask for the next one                                             | —                                                                               | due · overdue                                         |

Waking the same stop record twice does nothing the second time.

### 3 · Stops of an opportunity (D2)

**D2** — stopping one opportunity while the journey still runs does **not**
create a waiting lead. The "Chờ thời điểm" list is the list of stops (lead,
opportunity, later contract). Only waking creates a lead. The opportunity and
contract stop doors are built with the Sale phase, on the same stop record.

### 4 · Stop record and reason catalogue

One record per stop — lead now, opportunity and contract later (D2). It holds
date, rung, reason, who concluded, and the old journey. The list shows only
records not yet woken.

**D3** — after a wake the old lead keeps `nurturing`; its stop record gets
`woken_at` and the new lead (`woken_lead`) and leaves the list. No new state.

One shared reason catalogue (config, admin-editable), each reason recording
which flow/rung it applies to. It replaces the lead's six `ExitReason` values
and the per-stage care reasons of 0064 §6 (flow C3).

**D5** — seed from board F-Wait plus "Khác (ghi chú)"; the money reason is
labelled "Chưa có ngân sách năm nay". The no-contact flag ("Không liên hệ")
is carried by "Không phải khách của mình" and "Người liên hệ nghỉ việc".

A stop with a flagged reason stays in the list (for statistics) but is never
put into a campaign and never mailed. Address-level blocks (bounce,
unsubscribe) keep running alongside (flow C4).

### 5 · Wake

Three ways, each opening a new lead and a new journey linked to the old one:

- **Manual** ("Đánh thức lại") — the clicker holds the new lead (`assigned`).
- **Campaign** — putting a stopped lead into a campaign wakes it at once
  (flow C1). The new lead is `new`, no PIC, in the pool; first to claim holds.
  The bell for new pool leads is batched per wave, not per lead.
- **Growth** — the decider holds.

**D7** — campaign end = the last wave sent (`DONE`), no grace period. An
always-on campaign (no end date) never reaches `DONE`, so it never returns its
leads.

At campaign end, a lead woken by it with no real exchange yet is parked again
by the machine, reason "Không phản hồi chiến dịch", and its journey closes
`LOST` (flow C5). A lead that replied is not returned.

### 6 · Reply on a pool lead (D6)

**D6** — a customer replies while the lead is in the pool: the lead stays
`new`, the head of sales' bell rings. Whoever claims it goes straight to
"Tình trạng chăm sóc".

### 7 · Deadlines and next step

**D8** — lead rungs carry no deadline in this round. The done level of the
due ladder is labelled "Đã xong".

**D11** — the next step uses three levels only: "Chưa tới" · "Đến hạn" ·
"Quá hạn" (`stepLevelOf` in `packages/engines/src/contract-due.ts`). This
narrows flow G3's six-level ladder for next steps. Already built:
`apps/api/src/branches/sales/next-step/`.

### 8 · Temporary permissions (D9)

**D9** — until flow B, the existing permissions: stopping one's own lead
needs `lead.edit`, stopping someone else's needs `lead.disqualify`, waking
needs `lead.edit`. Putting into a campaign uses the existing campaign
permission. Converting checks the lead's scope. A parked `SCAN` lead may be
put into a campaign; address-level blocks still run.

### 9 · One email, many live leads (D4)

**D4** — no limit on live leads per email. This went **against** the plan's
recommendation (unique among `new`…`working`). `lead_email_live_idx` is
dropped; duplicate detection at intake becomes a warning, not a refusal.

What that changes for the landing door: today
`apps/api/src/branches/sales/lead/lead-intake.service.ts` catches the unique
violation on `lead_email_live_idx`, writes the attempt as `duplicate` against
the existing lead and creates nothing. From now on the landing door **still
creates a new lead** (pool, `new`) and marks it as a duplicate of the live
lead(s) with the same email. The book shows a warning "trùng email với LD-x";
a person merges by hand. This also went **against** the recommendation
(attach the submit to the existing lead).

Detection is a lookup at intake, not a constraint. The CSV import dedupe
(`apps/api/src/branches/sales/lead/lead-import.check.ts`) is keyed to the same
index and must be re-keyed to that lookup too.

### 10 · One test file (D10)

**D10** — one API-level test file for the lead state machine is allowed
(transitions, stop, wake, data migration) — an explicit exception to the
no-generated-tests rule.

## Superseded

- **0057 §2** — reversibility and reopen, the six closed `EXIT_REASONS`, "the
  run reopens", and `lead.disqualify` for both directions. Still holds: stop
  is direct, no E3.
- **0058** — the `nurturing`, `disqualified` and `archived` rows of the States
  table; "Manual transitions are the only way back"; the `exitReason`/`exitedAt`
  pairing and the sweep bullet under Consequences; the Amendment bullets on
  reopen, resume, "Opportunities are refused from `disqualified` and
  `archived`", disqualify from every open state, and "`archived` is a dead end";
  "Terminal states" in the owner-change bullet (release to pool stays).
- **0063 §1** — the `disqualified` and `archived` labels. **§2** — the last
  bullet ("`nurturing` is still reachable only from `verifying`|`working`" and
  what it keeps unchanged); `working` gains the mail reply/booking entry. **§4**
  — reopen and resume in full.
- **0064 §3** — the `care` → `open` row (reactivate). **§6** — "Reactivation
  returns the SAME opportunity to the stage it failed at" and the per-stage
  catalogue. The doors change with the Sale phase.
- **0066 §6** — narrowed: a `SCAN` lead once parked may be put into a campaign.

## Consequences

- Removed: `apps/api/src/branches/sales/lead/lead-archive.sweeper.ts` and
  `NURTURE_MAX`; the `exit`/`reopen`/`nurture`/`resume` doors in
  `apps/api/src/branches/sales/lead/lead.controller.ts`, replaced by stop and
  wake.
- `CHECK lead_open_owner_matches` must accept `nurturing` with no owner.
- `syncClosed` and `sales.workstream_stand()` read the stop record instead of
  `disqualified`/`archived`.
- The internal `lead-intake-internal` mail in
  `packages/engines/src/e4-notifications.ts` gives way to the in-app bell
  (flow H).
- Data on Neon moves: every `disqualified`, `archived` and `nurturing` lead
  needs its stop record; counts before and after must match.

## Alternatives rejected

- Unique live lead per email among `new`…`working` (the plan's D4) — the
  owner chose no limit.
- Attaching a repeated landing submit to the existing lead — the owner chose
  a new lead marked as duplicate, merged by hand.
- A new state for a woken lead — D3 keeps `nurturing` plus the stop record.
- A waiting lead per stopped opportunity — D2: empty leads and duplicate
  emails.

## Open

- SDR as a role — `open-questions.md` #23.
- What a customer reply on an opportunity or contract moves — #27.
