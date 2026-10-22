# 0111 · A contract has a collection PIC, separate from the closer

Status: accepted
Source: project owner's decisions, 22/10/2026 (§8–§11 confirmed the same day)

## Context

ADR 0110 made `sales.contract.owner_id` the closer and gave the closer
everything: commission, KPI, payment recording and the overdue bell. In practice
the person who closes a deal is not always the person who chases the money.

## Decision

### 1 · Two columns, two jobs

`sales.contract.collector_id` (NOT NULL, migration 0131) is the person who
collects. `owner_id` stays the closer and keeps commission, KPI and editing the
contract. One or two people may be involved; they may be the same person. This
splits COLLECTING out of 0110 §1, which gave it to the closer; the rest of 0110
holds.

### 2 · The PIC is chosen at signing, never pre-filled

The person creating the contract picks the PIC explicitly. Candidates: active
actors holding `contract.record-payment` and a Sales licence
(`GET /sales/contracts/collector-candidates`, permission `opportunity.close`).
The server refuses anyone outside that list.

### 3 · Who may do what

- Record or undo a payment: the PIC, the director, the head of sales
  (`mayCollect`). The closer does not collect unless also the PIC.
- Write a reminder, an overdue reason, an instalment document: the closer OR
  the PIC (plus head of sales and director).
- Edit the schedule, conditions, terminate: unchanged — by the closer / by the
  permission as before.

### 4 · Where payments are recorded

Only on the instalment page inside the contract detail. The opportunity profile
shows instalments read-only and offers "Mở đợt".

### 5 · Bells and scope

The overdue bell and the paid / undone / rescheduled / terminated bells reach
the PIC too (de-duplicated when the PIC is the closer). `ownOnly` scope counts
a contract the reader collects.

### 6 · Backfill (0131)

`collector_id` = the owner if the owner may collect → else the main participant
if they may → else the first person who may (head of sales, director, then the
rest, by name). Approval payloads of kind contract-sign missing `collectorId`
are patched by the same rule.

### 7 · Ship order

Migrate Neon 0131 → deploy API → push web. The web reads `canCollect`; a missing
flag means no collect button.

### 8 · The PIC can be changed after signing

`PUT /sales/contracts/:code/collector`. Only the head of sales or the director.
The new person must pass the same rule as §2 (active, holds
`contract.record-payment`, Sales licence). A terminated contract cannot be
changed. The change is audited, and the bell `contract-collector-changed` goes
to the old PIC and the new PIC (migration 0132 adds the kind to the CHECK). The
button sits in the person-in-charge block of the contract detail.

### 9 · Undoing a payment batch stays with whoever recorded it

Only the person who recorded the payment undoes it. The head of sales and the
director do not undo on their behalf. This narrows the "undo" line of §3.

### 10 · Overdue-debt KPI stays with the closer

The overdue-debt KPI is still counted for the closer. ADR 0082 is unchanged.

### 11 · "Chấm dứt hợp đồng" on the action bar

The button is placed directly on the action bar of the contract detail, on one
line.

## Rejected

- **Keep collecting with the closer (0110)**: the case above.
- **Pre-fill the PIC from the closer**: the choice would be skipped; the field
  would repeat the closer's name.

## Open (owner to confirm)

- The head of sales and director can now also write an overdue reason.

## Follow-up ship

0131 ships additive (`collector_id` nullable) because the API running during the
migrate inserts contracts without it. Once the new API is the only one running, a
second migration re-runs 0131's backfill and approval patch for rows written in
that window, then sets `collector_id` NOT NULL.
