# 0121 · A customer who has paid in full is re-cared in its own book, by temperature, on a reminder cycle

Status: accepted (partially supersedes 0074 §5's "no next step on a contract" and 0088 §4's removal of the signed-customer list (via 0109); amends 0080 §1, 0088 §6 and 0067 §5's growth wake — exact paragraphs under "Supersedes and amends"; rulings 9, "no reading yet → cold cycle" and "Mở cơ hội mới on hot rows only" are coordinator defaults the owner may overturn)
Source: project owner's decisions in chat, 22/10/2026

## Context

After the last installment of a contract is collected nothing was left to do:
the journey sat closed won, no list held the customer, and no one was asked to
keep in touch. Post-sale care was named in 0088 §4 (a list of signed customers,
where repeat deals are opened) and then dropped when 0109 merged the lists.
The owner ruled for a re-care process, not a waiting room. This record is the
decisions, not the implementation.

## Decision

### 1 · When a customer is "đã mua"

- When the last installment of a contract is collected, the contract reaches
  rung `done` ("Hoàn tất"); `deploy` and `accept` read `skipped`.
- When every live (not terminated) contract of the journey is `done`, the
  journey status is `growth`. Both are derived on read; nothing is stored.
- A reversal needs no clean-up: payment undone, an unpaid installment added, a
  further contract signed or a new deal opened takes the row out of the book.

### 2 · A separate book

- "Khách đã mua" is its own book, not a tab of "Nhóm chờ chăm sóc". One row per
  journey. Permission `contract.view`.
- Carers are ALL closers (0113: the contract creator) of the live contracts;
  all of them are rung.
- Hot customers come first, then warm, then cold or none; inside a group the
  earliest next care day comes first.

### 3 · Temperature

- Every comm close-out (0074) on a customer in `growth` REQUIRES a temperature
  — "Nóng" (hot), "Ấm" (warm) or "Nguội" (cold) — and a next step.
- The current temperature is the latest reading. A reading belongs to the
  debrief that recorded it.
- **Default (coordinator, owner ruling 9):** a close-out that reaches
  nobody ("Không liên lạc được", 0094) records no temperature and does not
  restart the clock.

### 4 · Reminder cycle

- Each temperature has its own cycle, configurable through the sales-config
  approval path (0080 §4 pattern). Defaults: hot 14 days, warm 45, cold 90.
- **Default (coordinator):** a customer with no reading yet is on the cold
  cycle.
- Due = the later of the completion moment and the last contact, plus the
  cycle of the current temperature; it rings once per elapsed cycle.
- Any person's contact restarts the clock: a logged comm, a held meeting, a
  `contacted` touch, a one-to-one letter. Campaign mail, opens and clicks do
  not.
- The bell reaches every unlocked carer.

### 5 · Next step

- The step lands on the journey's lead, whichever of the lead, the deal or the
  contract the comm was logged on.
- Templates come from "Khung hành trình" per temperature (0080 pattern, with
  the free-entry flag).

### 6 · Way out: a repeat deal

- A deal opened on the same lead reopens the same journey; no new journey is
  made. No deal is created by the machine.
- A carer who does not hold the lead may open the deal and becomes its holder.
- **Default (coordinator):** "Mở cơ hội mới" is shown on hot rows only.

### 7 · Reads, who gets the step, who is exempt (coordinator defaults)

All of this section is a coordinator default the owner may overturn.

- While a run is in growth, carers pass the one-lead read: they read the lead
  profile, files and comms, and may send a single letter from the lead (needed
  to re-care and to open the repeat deal).
- On a customer close-out with no doer chosen, the next step goes to the
  closing carer; otherwise to the lead's holder.
- Someone who cannot write the lead's step (a collector PIC who is not a
  carer, presales) still closes a comm on a growth customer's contract as
  before (0074 §5: no step, no temperature). Temperature and step are required
  only of the holder or a carer.
- Each carer's reminder bell points at that carer's own latest live contract.

## Supersedes and amends

- **0074 §5**, second bullet ("A comm linked to a contract takes NO next
  step") — for a customer in `growth` the comm takes a temperature and a step,
  and the step lands on the journey's lead. For a contract of any other
  journey the bullet still holds.
- **0080 §1** — adds a third object kind, `customer`, whose states are
  `hot`, `warm` and `cold`; lead and opportunity keep their own.
- **0088 §4** — the signed-customer list, which 0109 retired with the two-list
  split, returns as its own book. 0109's one nurturing list for failed leads
  stands.
- **0088 §6** — a repeat deal still opens from the original lead; it now
  also reopens the same journey.
- **0067 §5, "Growth — the decider holds"** (a growth wake opens a new lead
  and a new journey) — a deal opened from `growth` stays on the same lead and
  journey. 0068 §5 had already replaced the rest of §5.

## Consequences

- Migration 0143 adds the table that holds the temperature readings and the
  step-frame address for `customer`.
- New bell kind `customer-recare-due`, from a worker-only hourly sweep.
- The journey's growth door is reshaped to carry the done contract, the opener
  and the temperature.
- No backfill: customers already paid in full enter the book on first read,
  with no reading, on the cold cycle.

- Known limits: a run whose live contracts name no owner has no carer and rings
  nobody; the growth door is re-derived from today's installments, so undoing a
  payment can remove a past door; the temperature recorded at close-out is not
  yet shown on the confirmed comm view.
- Shipping order: 0143 rebuilds the notification-kind and setting-key CHECK
  lists; it must be merged with 0140–0142 of the KPI turn, and whichever
  reaches Neon last must have the larger journal `when`.

## Open

Questions 112–118 in `open-questions.md`.
