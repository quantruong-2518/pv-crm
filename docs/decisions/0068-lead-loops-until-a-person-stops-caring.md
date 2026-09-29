# 0068 · A lead loops on `nurturing` until a person stops caring; sending mail is itself a touch

Status: accepted (partially supersedes 0067 §1, the holder-cleared rule in §1
and §2, §4, §5 including D3, and D7; to that extent revives the
`disqualified` reopen path of 0057 §2 and 0058)
Source: project owner's decisions in chat, 29/09/2026

## Context

0067 modelled every presale stop the same way: a lead parks in `nurturing`
with its holder cleared, and the only way back is a wake that opens a brand
new lead and a new journey linked to the old one. It also retired
`disqualified` outright, folding "not interested" into the same stop-and-wake
machinery, and it counted only a customer's reply or booking as the touch
that moves a lead into `working` — sending a mail did not count.

Working through the presale flow again on 29/09, the owner found both calls
too strong: (1) a real outbound touch — a call, a message, a meeting held, or
a mail actually sent — is real work happening on the lead whether or not the
customer answers, and should read as care starting, not wait for a reply; and
(2) "not interested" is a different shape from "not now" — one is a person's
decision to stop, the other is a lead waiting for a better moment, and only
the second one should loop forever on the same record.

## Decision

### 1 · `working` starts at the first real touch, sending included

`working` ("Tình trạng chăm sóc") is entered at the first real touch on a
lead: a call, a logged message, a meeting held, **or any mail sent to it** —
campaign mass mail and a timed mail run included, the moment it actually goes
out. This widens 0067 §2's `working` row, which counted only a customer's
reply or a booking made from a mail; now the send itself counts, not just
what comes back. Sending is a system event exactly as a reply already was in
0067 — it moves the lead whoever's mail went out, not only the PIC's. From
that first touch on, every further move is recorded in the activity trail
(0067 D1 — a sub-rung is evidence in the trail, not a stored column — is
unaffected).

**Default taken by the implementer:** a pool lead (`new`, no holder) that
receives a mass mail stays `new` — the touch is recorded, but there is no
holder to move it under. This is the same shape as 0067 D6 (a reply on a pool
lead stays `new` too).

### 2 · `verifying` narrows to scheduling that has not touched the customer

`verifying` ("Tạo chiến lược chăm sóc") is kept, but only for care scheduled
ahead of time without touching the customer yet: a future meeting booked, or
a mail run timed to send later. The moment that mail actually sends or the
meeting is held, the lead moves to `working` under §1 — `verifying` is a
holding label for "scheduled, not yet happened," not a parallel track to
`working`.

### 3 · `nurturing` is relabelled "Nhóm chờ chăm sóc"

The state keeps its identifier (`nurturing`); its product label changes from
"Chờ thời điểm" to **"Nhóm chờ chăm sóc"** everywhere the label is shown or
written about — screens, mail, this documentation. Use the new term going
forward; do not reintroduce "Chờ thời điểm".

### 4 · `nurturing` loops in place on the same lead; no six-month archive

A lead parked in `nurturing` is always re-warmed on the **same** lead: same
code, same journey, same holder. Any real touch (§1) moves it straight back
to `working` — there is no wake and no new lead or journey for this path.
This replaces 0067 §5's wake-into-a-new-lead as the return path for
`nurturing`, and D3 with it (a wake no longer applies here, so there is no
old-lead-keeps-`nurturing`-while-a-new-one-is-born bookkeeping to do). The
manual resume door (0063 §4, superseded by 0067, revived here for
`nurturing`) stays as the way a person brings a parked lead back without
waiting for an inbound touch.

The holder is **kept**, not cleared, while a lead sits in `nurturing` — 0067's
holder-cleared rule (§1, and the `nurturing` row of §2's transition table) is
retired for this state.

There is no automatic archive after six months. The state `archived` ("Lưu
trữ") stays retired exactly as 0067 said; existing `archived` rows migrate to
`nurturing` (the migration described in 0067's Consequences carries this out —
this decision only fixes the destination and the fact that the holder is kept
on arrival, not cleared).

### 5 · "Ngừng chăm sóc" is its own terminal state

Reuses the `disqualified` identifier; only its product label changes, from
"Không theo nữa" to **"Ngừng chăm sóc."** Entered only when a person presses
it — never by a campaign, a mail send, or any other system event. Once there,
a lead is out of the loop: no campaign pulls it back, and it is never mailed.
The reopen door is unchanged from 0057 §2 / 0058: direct, no E3, permission
`lead.disqualify`.

## Mail rules

Three more rulings, same session, tying mail delivery to the states above.

### 6 · Entering `nurturing` or `disqualified` cancels what hasn't gone out yet

The moment a lead enters "Nhóm chờ chăm sóc" or "Ngừng chăm sóc", any mail
still scheduled and not yet sent to it is cancelled — withheld, not deleted —
with reason `lead-nurtured` for the first and `lead-disqualified` for the
second. This is a per-recipient withhold, separate from the shared stop-reason
catalogue (0067 §4, D5): it fires on the state change itself, whatever reason
(if any) got the lead there. A group letter (0067's shared modal, group-send
mode) addressed to a lead already in "Ngừng chăm sóc" is refused outright,
not merely withheld — it should never have been picked as a recipient.

### 7 · A timed run moves `assigned` → `verifying`, for every kind, whoever scheduled it

Scheduling a mail run for later — any kind, including a campaign wave — moves
the lead from `assigned` to `verifying`, and the mover is whoever scheduled
the run, a system event exactly as a send or a reply already is (§1). A pool
lead (`new`, no holder) stays `new` when a run is scheduled against it, the
same shape as the send-time and reply-time defaults (§1, 0067 D6). Actually
sending the run is the separate event that moves the lead to `working` (§1);
scheduling only gets it as far as `verifying`.

### 8 · Send failures, retries, and what bans an address

A real send failure retries at most twice (`PV_EMAIL_RETRY_LIMIT`, default 2).
When a mail dies after retries, the address goes onto the suppression list
with reason `send_failed`, and a `mail-failed` touch on the lead tells the
holder. A provider-wide outage — the queue held/parked rather than a specific
address failing — never puts anyone on the suppression list; only a failure
tied to that address does.

If the mail reached the customer but the write that was meant to move the
lead's state failed, that move (not the send) retries up to twice. Still
failing after that: no suppression, and a `mail-sync-failed` touch on the
lead asks the holder to fix the state by hand — a delivery problem and a
bookkeeping problem are banned differently, and only the first ever bans an
address.

## Superseded

- **0067 §1** — retiring `disqualified` outright and "`nurturing` is the
  only stop." `disqualified` is back as a distinct terminal state (§5).
- **0067 §1 and §2** — the holder-cleared rule for entering `nurturing`
  (migration note in §1; the `nurturing` row of the §2 transition table).
  The holder is kept (§4).
- **0067 §4** — stop record as the _only_ way to park a lead. Whether the
  stop record and its shared reason catalogue still apply to a lead's
  `nurturing` entry, now that it loops on the same record instead of being
  wake-only, is not settled here — see Open. The catalogue and stop record
  for opportunity/contract stops (0067 D2) are untouched by this ADR.
- **0067 §5, including D3** — wake opening a new lead and a new journey, as
  the return path from `nurturing`. Superseded by the in-place loop (§4).
  Wake is unaffected wherever it still applies outside `nurturing` (growth,
  §5's other bullets).
- **0067 D7** — the machine parking a campaign-woken lead with no real
  exchange yet, reason "Không phản hồi chiến dịch," and closing its journey
  `LOST`. There is no more wake-into-`nurturing` path for this state (§4), so
  the scenario D7 described no longer arises the way it was written.

## Consequences

- Every reference to the lead-state label "Chờ thời điểm" (screens, mail
  templates, other docs) becomes "Nhóm chờ chăm sóc" (§3).
- `disqualified` is a real, separate CHECK-constraint value again, not folded
  into `nurturing` with a reason — 0067's Consequences bullet on
  `CHECK lead_open_owner_matches` accepting `nurturing` with no owner no
  longer applies to `nurturing`, since a `nurturing` lead now keeps its owner.
- A mail send (not only a reply) becomes a state-changing event for `working`;
  wherever 0067's mail-touch handling was scoped to replies/bookings, it now
  also has to fire on send.
- `PV_EMAIL_RETRY_LIMIT` (`apps/api/src/platform/config/env.ts`) defaults to
  8 today; §8 lowers the default to 2. This is one ceiling used for two
  different things in the current code (queue-level attempts and the
  dead-letter check in `apps/api/src/platform/queue/mail.consumer.ts`) — which
  of those the new default of 2 is meant to bound is an implementation
  question, not decided here.
- `SuppressionReason` (`apps/api/src/platform/mail/mail.contract.ts`) gains a
  fifth value, `send_failed`, snake_case like the four before it. The withhold
  codes of §6 (`lead-nurtured`, `lead-disqualified`) are delivery reason codes,
  a separate list that is already kebab-case.

## Alternatives rejected

- Keeping wake as the only return path for `nurturing` (0067 §5) and only
  narrowing what counts as a touch — rejected because the owner's objection
  was to the shape (new lead every time a lead comes back to life), not to
  wake's mechanics.
- A new state for "not interested" separate from the retired `disqualified` —
  rejected; the owner chose to reuse the identifier and change only the
  label (§5).

## Open

- Whether the stop record and shared reason catalogue (0067 §4, D5) still
  record a `nurturing` entry now that it loops in place, or whether they
  narrow to opportunity/contract stops only (0067 D2). Not raised in chat;
  flagged here rather than assumed.
- `docs/decisions/open-questions.md` #26 (which stop reasons carry the
  no-contact flag) is unaffected by this ADR and stays open.
