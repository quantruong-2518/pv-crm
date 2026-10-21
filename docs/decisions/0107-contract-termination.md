# 0107 · A signed contract can be terminated, by a direct door, and counts as a fourth bucket

Status: accepted
Source: project owner's decisions, 21/10/2026

> Superseded in part by 0109: "Out of scope" — a terminated contract that leaves nothing live now parks the lead in the nurturing list.

## Context

A contract row alone makes a deal "won" everywhere. The dashboard's panel of
deals that did not succeed covers only deals stopped BEFORE signing. A contract
that falls apart after the deposit (deposit received, contract broken) cannot be
recorded, so win rate, collected money and the lost-reasons panel all overstate
success.

## Decision

### 1 · A direct door, not an approval

Termination is a DIRECT door, not an E3 approval like `contract-sign`. Only
head of sales and director hold the button (permission `contract.terminate`).
The acting person is already approval level, so a request/approve loop would
only add delay. The door writes who, when, reason, note and the money snapshot,
and the director is notified (kind `contract-terminated`).

### 2 · Model

- The contract row and its installments stay untouched.
- One row in `sales.contract_termination` (migration 0128): `reason_key` from
  the config list `CONTRACT_TERMINATION_REASON` or the virtual `other` with a
  required note; `collected_amount` snapshot; `refunded_amount` <= collected;
  kept = collected - refunded, derived.
- Terminated is a FOURTH bucket, not "lost": a lost deal never had a contract,
  a terminated deal had one and money may have moved.
- Final, no reopen. A second terminate is 409. Every write on a terminated
  contract (schedule, paid, undo, conditions, overdue reasons) is 409. The
  overdue sweeper skips it.

### 3 · Counting rules

- `wonDeals`, signed count and amount, collected and overdue KPI readings,
  contract book open / overdue / collected, and "customer has bought"
  (`leadHasContract`, `leadSigned`) all read LIVE contracts only.
- `dealOpen` and `dealLost` keep their text, because a terminated deal still
  has a contract row.
- Win rate = won / (won + lost + terminated), on the deal's close moment
  (retroactive, tells the truth).
- KPI months already closed read their frozen copy (ADR 0100), so a termination
  does not rewrite a closed month.
- The dashboard's reasons panel gets a third group, counted on `terminated_at`
  (the event), so the user who terminates today sees it today.

### 4 · Known asymmetry

A deal signed in an earlier period and terminated now shows in the reasons panel
now (event date) but sits in the earlier period's win-rate denominator (close
moment). Accepted as is.

### 5 · Rejected

- **(a) A `state` column on `contract`**: touches every contract insert and
  read, and tempts treating it as lost.
- **(b) Reusing deal `lost` + `LOSS_REASON`**: conflates never-signed with
  signed-then-collapsed, and breaks "won beats lost: a contract row wins" in
  `dealLost`.
- **(c) An E3 approval**: see §1.

## Out of scope

- Lead fate after its last contract is terminated: the lead stays converted and
  can use the normal exit door, because `leadHasContract` now reads live
  contracts.
- Refund bookkeeping beyond the snapshot.
- Reopen.

## Open

Questions 103–106 in `open-questions.md`.
