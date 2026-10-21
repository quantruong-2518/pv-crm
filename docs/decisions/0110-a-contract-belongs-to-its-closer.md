# 0110 · A contract belongs to the person who closed it, and the journey book names who answers by seat

Status: accepted
Source: project owner's decisions, 21/10/2026; design canvas https://claude.ai/artifact/56S94xeWLTMgkdpwWS7qto

## Context

One deal can be signed several times (one contract per kind, ADR 0069 §5,
ADR 0095). Each contract has ONE person column, `sales.contract.owner_id`,
which drives commission, KPI, the leaderboard, the overdue bell (ADR 0096) and
the contract scope check.

The sign drawer seeds `owner_id` from the deal's Sale chính, and the server
refuses (422) any owner not on the deal's SALE lane, which freezes after the
first signature (ADR 0086 §4). So every contract of a deal names the lead/deal
PIC even when other sellers closed them; the people who closed them cannot be
named, and if `ownOnly` they cannot even open their own contract. The "PIC lúc
ký" block copies the whole deal lane onto every contract, repeating the same
name. Journey scope is `lead.owner_id` only.

Example: journey WS-0259 — "Nari" opened one sales contract but is shown in
charge of three more contracts she did not create and cannot act on.

## Decision

### 1 · The closer owns the contract

`owner_id` = the closer = commission, KPI, payment and overdue bells. One
field, no second column. The sign door defaults the closer to the signer when
the signer is a seller, otherwise to the deal's Sale chính; any active seller
may be chosen. The 422 "Người hưởng hoa hồng phải là Sale đứng đơn của cơ hội"
is replaced by "must be an active seller". This overrides ADR 0086 §4 for the
owner only; the participant snapshot is still written but no screen shows it
("PIC lúc ký" removed).

### 2 · Who writes, who reads

Write: the contract's closer, the head of sales, the director — one exported
rule in the API contract module, used by every contract write door and by the
journey's `canEdit`.

Read: as before, plus, for an `ownOnly` reader, anyone on the deal's lanes or
holding the run's lead; such a reader sees it read-only ("Chỉ xem · <name>
phụ trách"). The contract BOOK stays owner-only for `ownOnly` readers on
purpose (it is "my contracts").

### 3 · Journey scope widens

An `ownOnly` reader sees a run if they hold its lead, stand on any of its
deals' lanes, or own any of its contracts — on both axes (SQL and E2's second
grid), for book, board, scorecard and profile.

### 4 · The book names who answers, by seat

PIC lead (lead), Sale chính (deal), Người chốt (each live contract). No screen
shows the lead's PIC as the person in charge of a contract.

### 5 · The book's cards read a period

Week / month / quarter / year like the overview (ADR 0106): Đang chạy trong
kỳ, Mở mới, Thắng %, Đã dừng %, with a like-for-like compare off the
database's `asOf`. Each figure is counted with the book's own filter
(liveFrom/To; new openedFrom/To; closeReason WON + closedFrom/To; stopped +
closedFrom/To; status closed + closedFrom/To) so a pressed card opens exactly
its rows. "Quá hạn" moves to a toolbar toggle, because it is a today figure.

The period picker and progress line on `/sales/workstreams` are the overview's
own component (`apps/web/src/components/period-picker.tsx`, moved out of
`pages/home.tsx`). The waiver of ADR 0106 §5 (laws 5 and 15: its round pill,
navy gradient and gradient progress bar) extends to that component wherever it
is used; reviewers must not restyle it to the standard look.

## Supersedes in part

- `.claude/HANDOFF-workstream-loop.md` §D1 (children inherit the parent's
  holder; the run shows the lead's holder): replaced by §1 and §4.
- `.claude/HANDOFF-workstream-loop.md` §D2 (contract holder inherited from the
  deal): replaced by §1.

## Rejected

- **Keep the lead/deal PIC on contracts**: the bug above.
- **A separate "closer" column beside `owner_id`**: two names drift — the
  reason ADR 0086 kept one.
- **Hiding other people's contracts from co-sellers**: they need to see who to
  ask.

## Not built

"Người triển khai": no column; the API sends `implementer: null`. A later ADR
with a migration.

## Open (owner to confirm)

`account-executive` today holds `contract.record-payment` for any contract, and
non-`ownOnly` sellers could edit others' contracts; §2 removes both.
