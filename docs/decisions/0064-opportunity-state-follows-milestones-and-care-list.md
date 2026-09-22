# 0064 · Opportunity has one axis — stage is the lifecycle position, state is `open`|`care`, both follow recorded facts; a failed deal goes to the care list, not to `close-lost`

Status: accepted (supersedes 0027; partially supersedes 0018 (the five `state`
values and the `state`/`stage` two-column split), 0032 (the board's column set),
0057 §5 (loss reason becomes care reason))
Source: project owner's decision in session, 21/09/2026

## Context

`opportunity.state` was hand-typed and never derived from anything (0027), and
`stage` was a second column that a state select or a board drag could write.
Two columns answering one question drifted, and nothing recorded what the PIC
had actually done with the deal.

The bug that exposed it: a newly created opportunity was born `quoted`. The
create draft (`draftOpportunity` in the engines fixture) defaulted `state` to
`quote-sent`, and the form wrote that through — a deal nobody had quoted showed
up in the quotation column on day one. A default a human can overwrite is a
default a human forgets to overwrite.

Owner: the deal's position must say what the team has actually done, the same
ruling 0063 made for the lead.

## Decision

### 1 · One axis

`stage` = position in the lifecycle. `state` = still on the board or not.

| Column                      | Stored values                                                | Note                                                                                                                               |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `stage`                     | `new` · `assigned` · `sample` · `poc` · `quotation`, or NULL | NULL once won or while in the care list. Still nullable; `stage_since` travels with it (`opportunity_stage_clock` CHECK unchanged) |
| `state`                     | `open` · `care`                                              | Only two STORED values. `won` is NOT stored: derived at read time from the `sales.contract` row, as `toContract` does today        |
| `care_from_stage`           | one of the five stages, present only when `state='care'`     | The stage the deal was in when pushed to care; reactivation returns it to exactly this stage                                       |
| `care_reason` / `care_note` | renamed from `lost_reason` / `lost_note`                     | A reason is mandatory when `state='care'`                                                                                          |

`closed_at` stays and now means "left the board" (won, or entered care); it is
cleared on reactivation.

No `quote-sent`, `nego`, `pending`, `close-lost`, `close-won`, `quoted`,
`demo-done`, `discovery` or `awaiting-signature` is stored or displayed
anywhere afterwards (migration and the old-mapping test excepted).

### 2 · Labels (display only)

Declared ONCE in `packages/contracts`, like `LEAD_STATE_LABEL`.

- stage: `new` = "Khởi tạo opp" · `assigned` = "Nhận PIC" · `sample` = "Sample"
  · `poc` = "POC" · `quotation` = "Quotation"
- state: `open` = "Đang triển khai" · `care` = "Danh sách chăm sóc" · `won` =
  "Thành hợp đồng"

### 3 · Triggers — state and stage derive from facts

One class writes `opportunity.stage`/`state` (as `LeadStateWriter` does for
leads): conditional UPDATE, forward-only, idempotent, writes a touch, updates
the mirror.

| Move               | When                                                                                                                    | Detail                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| create → `new`     | the opportunity is created (converted from a lead, or created at workstream — one path)                                 | default is `new`, NEVER `quotation`                                                                                 |
| `new` → `assigned` | the PIC set is satisfied: at least one person with `roleId === 'head-of-sales'` AND at least one other (Sales-licensed) | checked at create, at PIC change, at import. Created with a satisfying PIC set, it goes straight to `assigned`      |
| → `sample`         | milestone `sample-sent` recorded                                                                                        | optional                                                                                                            |
| → `poc`            | milestone `poc-run` recorded                                                                                            | optional                                                                                                            |
| → `quotation`      | milestone `quotation-sent` recorded                                                                                     | may be recorded repeatedly (Nego = the revision rounds of a quotation, no state of its own)                         |
| → won              | a contract is created (the existing `POST /:code/contract` + director approval flow)                                    | new gate: 409 unless the opportunity has at least one `quotation-sent` touch. There is no separate Close-win button |
| any → `care`       | `POST /:code/care {reasonKey, note}`                                                                                    | `care_from_stage` = current stage, stage/`stage_since` = NULL, `closed_at` = now                                    |
| `care` → `open`    | `POST /:code/reactivate`                                                                                                | stage = `care_from_stage`, `stage_since` = now, `closed_at` cleared, `care_*` remain in the touch trail             |

Milestone order ("moderate control"): fixed `sample` → `poc` → `quotation`;
`sample` and `poc` MAY be skipped; recording a milestone below the current
stage is a 409 that names the label; re-recording the current milestone is
allowed. Before `assigned` no milestone can be recorded (409). Reactivating
after every milestone was recorded still returns to the old stage.

A lead already `converted` is left as it is — NOT touched when its opportunity
enters care.

### 4 · PIC

- "Head of sales" = an actor with `roleId === 'head-of-sales'`; "member" = any
  other Sales-licensed actor. Derived from the user's role — no role column is
  added to `opportunity_owner`; the SALE/BD label on the deal stays as it is
  (it drives commission). PIC = the union `saleOwners ∪ bdOwners`.
- PIC may only be replaced or added to, never shrunk: one owners edit may not
  lower the PIC count, nor remove the last head of sales once the opportunity
  is `assigned` or beyond. An opportunity that predates this and has fewer than
  two PIC is grandfathered until an edit brings it to two or more; the rule
  binds new writes only. The guard sits in the service BEFORE `replaceOwners`;
  import passes through it too.

### 5 · Who has rights

Every new door (record a milestone, push to care, reactivate, change PIC)
needs `opportunity.edit`, `scoped: true` — `ownOnly` means the actor must be in
the PIC. Being assigned to the PIC is what grants the right; no new role.
Signing a contract stays `opportunity.close` with the `['director']` approval
chain, unchanged. The web `need` must match the controller including the
`scoped` flag (today it disagrees on profile, PATCH and stage).

### 6 · The care list

A deal may fail from ANY state and stage. The reason is mandatory and comes
from a per-stage catalogue held in `config_entry` (extending the existing
loss-reason list rather than a new mechanism), not from a closed enum in the
contract; an "Khác" ("other") entry requires a note. Reactivation returns the
SAME opportunity to the stage it failed at.

Provisional seed (marked as provisional in the code; the owner will replace it):

- `new`: `no-pic-available` · `lead-not-qualified` · `duplicate-opportunity` ·
  `other`
- `assigned`: `unreachable` · `no-real-need` · `customer-postponed` · `other`
- `sample`: `sample-refused` · `sample-failed` · `no-response` · `other`
- `poc`: `poc-failed` · `requirement-changed` · `chose-other-solution` ·
  `other`
- `quotation`: `price-too-high` · `terms-rejected` · `budget-cut` ·
  `chose-competitor` · `project-postponed` · `other`

### 7 · Two doors removed

The manual "Trạng thái" select on the create/edit form and the
`PATCH /:code/stage` door (the board's drag between columns) are removed.
Stage is written only by the single writer in §3. The board is fixed at five
columns, one per stage `new` · `assigned` · `sample` · `poc` · `quotation`.

### 8 · Five new touch kinds

`sample-sent`, `poc-run`, `quotation-sent`, `care-entered`, `care-left` widen
`touch_kind_known` (hand-written in the migration). The legacy kinds
(`stage-changed`, `entered-pipeline`, `signed`) stay valid forever. A touch's
note carries the reason (`care-entered`) or the milestone note.

### 9 · Old data → new

| Old (state / stage)                                               | New                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| stage `new`                                                       | stage `new`, state `open`                                                                                                                                                |
| stage `discovery` (including state `pending`)                     | stage `assigned`, `open`                                                                                                                                                 |
| stage `demo-done`                                                 | stage `poc`, `open`                                                                                                                                                      |
| stage `quoted`, `awaiting-signature` (state `quote-sent`, `nego`) | stage `quotation`, `open`                                                                                                                                                |
| state `close-lost`                                                | state `care`; `care_from_stage` = the last stage (from the most recent `opportunity_stage_event`, else `new`); `care_reason`/`care_note` = old `lost_reason`/`lost_note` |
| already has a contract (won)                                      | `stage` stays NULL, `state` = the old stored value mapped by the rows above                                                                                              |

The migration also rewrites `opportunity_stage_event.from_stage`/`to_stage` to
the new stage set, replaces `sales.workstream_stand`, changes the
`workstream_stand_key_known` CHECK, resyncs every stand, and updates the
`STAGE` rows in `config_entry` — the count stays five, because the ladder
matches rows by position and a different count would drop every limit.

## Consequences

- **Why 0027 no longer holds.** 0027 kept `state` hand-typeable so a verbal
  quote could be recorded, and refused any derivation from quote status. What
  it left was a column a human types and a `stage` derived from it through a
  lookup: the create default above went straight to the board. Now a verbal
  quote is recorded as the `quotation-sent` milestone — a fact with a touch —
  and nobody types a state.
- The board reads five columns, so 0032's claim that it drops to three has
  never matched the code; this ADR fixes the column set at five, by the new
  stages.
- The `close-lost` reason, free text under 0057 §5, becomes a care reason
  picked from the per-stage catalogue.
- "Demoed" (0032) is not a column: the `poc` stage covers what `demo-done` did.
- Fixture data (`OPPORTUNITIES` in the das-vina scenario) changes meaning:
  the former lost deals become `care`; the test that locks the counts is
  edited to match, keeping the total.

## Alternatives rejected

- Keep two axes (`state` + `stage`) and keep them in sync — that is the drift
  this ADR removes; two columns answering one question was already 0027's own
  warning.
- Make Sample/POC/Quotation a sub-status of one "working" state — the pipeline
  loses its resolution: the board could no longer say where the deal is.
- A separate Close-win button — a second source of truth next to the contract,
  which already decides "won".
- Allow PIC to drop — the rule "one head of sales plus one other" would hold at
  creation and rot at the first edit.

## Open

- The SALE/BD (commission) label versus the head/member relationship: what
  happens when the head of sales is the only person carrying SALE is undecided.
- The per-stage reason lists in §6 are provisional seed until the owner
  supplies them.
- `UNIQUE(contract.opportunity_code)` is not enforced by the database.
- The frozen plan and performance screens still read fixture stages, not the
  five above.
