# 0090 · Every quotation is a ledger record, and the deal profile shows its money

Status: accepted (supersedes 0072 §4 where a quotation is a milestone recorded through the milestone door and rounds are counted from touches; built, not yet shipped)
Source: owner decisions 12/10/2026 in chat; the canvas that showed the screen is for viewing only

## Context

0072 §4 kept `quotation` a stage and counted "Gửi lần n" rounds from
`quotation-sent` touches. A touch has no kind, no amount, no outcome and no
reason, so nobody could say what was quoted, what a revision replaced, or which
quotation a contract closed. The profile also showed no money: what is signed,
collected, owed or late was a sum nobody computed.

## Decision

### 1 · The ledger counts; the touch only tells

Each quotation is one record in `sales.quotation`. The `quotation-sent` touch
stays, only as the sentence on the timeline (the way `opportunity_stage_event`
sits beside `stage-changed`). Every count and gate reads the ledger: the round
count, the sign gate, the round number in the journey. Two ways of counting
would disagree the first time a row is missing from one of them.

The milestone door no longer takes `quotation` from the web; it points to the
quotations door. A mail template that records a quotation calls the same
service with source `mail`.

### 2 · Kind, negotiation, round

A quotation carries the contract kind (licence · deployment · training). A
negotiation is the rounds of one (deal, kind, negotiation number); a number
rises when the previous negotiation of that kind has closed, signed or not.
Each negotiation holds at most one pending round. Recording a new round closes
the pending one as "Không chốt" and the reason is required. The round number is
issued by the server under the deal lock, never counted in the browser.
Validity expiry only displays: a quotation that lapsed is still a quotation
the customer may accept.

### 3 · Reasons are their own list

Revision reasons live in a new config list `QUOTE_REVISION_REASON`, not in the
deal's stop reasons. "Customer found the price high" is a fact about one round;
the stop list says why a whole deal ended, and reporting that mixes them would
read every revision as a lost deal. The list goes through the same config
approval as the others. `other` is virtual, as in the loss reasons, and needs a
note.

### 4 · Signing, stopping, closing

Signing may name a round. That round wins, and the whole negotiation takes the
contract code. The kinds must match; a kind-less round adopts the contract's
kind. A signature naming no round still passes when the deal has at least one
ledger row, which keeps the old gate's meaning for older data.

Stopping a deal closes its pending rounds with the stop reason, stored as
`stop_reason_key`, so the user is not asked twice. A won deal cannot be
stopped, so a negotiation has its own close door: the pending round becomes
"Không chốt" with a reason and the deal keeps its state.

### 5 · Rounds that arrive incomplete

Rounds recorded from a mail template or by backfill may lack kind and amount.
The screen says so and offers the door that completes them. Completing a
backfill row makes it a manual row.

### 6 · Documents: one shelf, a step label beside it

Documents stay on one shelf per run. The step (quotation · contract ·
instalment) lives in `sales.document_step`, a join table on the sales side, not
as a column on the platform attachment table. The platform table is shared with
other branches and must not learn a sales vocabulary; and deleting an
instalment must not strip its files, so the join table points at the
instalment's number.

### 7 · Permission change: who now reaches a run's documents

The four run-document doors (list, declare, confirm, delete) used to admit only
the holder of the lead. They now admit the holder of the lead **or** whoever
stands on a deal of that run (a lane or the accepter). Who gains access: BD and
Sale people on a deal of a lead they do not hold. Scan-source files of the
lead still go only to the lead holder with `lead.view`; a person who stands
only on a deal receives none of them. The door answers the same 404 as before
to everyone else.

### 8 · The payment schedule

The schedule is entered in the sign proposal, so the director's approval of
the signature covers it. After signing, `contract.edit` may change the
instalments not yet paid, and may enter a schedule for an older contract that
has none. Each instalment keeps its number; it is never renumbered by
position, because its conditions, reminders and files hang on that number. An
unpaid instalment missing from the list is deleted; a number pointing at a paid
or unknown instalment is refused.

"Paid" is written directly by `contract.record-payment`, with an audit row, and
can be undone only by whoever recorded it. No new approval kind: a payment that
has happened is a fact to record, not a request to approve. Reminders and
unlock conditions have their own write doors.

### 9 · The profile computes its own money

The `money` block of the profile is computed by the server; the screen adds
nothing. Payments of a contract are shown only to a reader inside that
contract's own scope (the same rule as the contract door), with `contract.view`.
The consequence is deliberate: a seller standing on the deal but not owning
the contract sees the contract heading and its rounds, not its payments. Totals
add only what the reader may see.

### 10 · Backfill and shipping order

The data statement of 0104 is insert-only and per deal: a deal that already has
a ledger row is skipped whole. It is never to be re-run after the deploy. Four
hazards made "re-run the backfill" unsafe:

- a later hand-recorded round made the re-run close an earlier backfilled
  pending row as not-closed, with no reason;
- a signature that named another round made it mark the backfilled row won
  too: two won rows for one contract;
- a backfilled row a person had completed with a kind stayed rewritable;
- the backfill numbers negotiations by contracts signed, the server by
  negotiations closed, so a late insert could collide on the round index and
  abort the statement.

Touches the old build wrote between migrate and deploy are covered by the
one-off script `db:backfill:quotation-gap`: preview by default, `--apply`
writes, insert-only, each touch becoming round 1 of the next kind-less
negotiation, pending. Order: migrate → deploy the API → the gap script → push
the web.

Facts moved out of the SQL header: both unique indexes key on
`coalesce(kind,'')`, so a deal's kind-less rows are one group; `reason_id` has
no foreign key because `other` is virtual; `config_entry` needed no DDL, and
the four starting reasons are planted only if the list is empty; the DDL is
not re-runnable; the file is hand-written.

## Alternatives rejected

| Alternative                                  | Why not                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Keep counting touches, add columns to them   | A touch is a sentence; outcome and reason are state              |
| Reuse the deal's stop reasons                | Mixes "a round was revised" with "the deal ended"                |
| Step column on the platform attachment table | A shared table must not learn the sales vocabulary               |
| A new E3 approval kind for "paid"            | Paid is a fact already happened; the audit row is the record     |
| Renumber instalments by position             | Detaches conditions, reminders and files from their instalment   |
| Expiry closes the round by itself            | A lapsed quotation can still be accepted; closing needs a person |
| Re-run the 0104 backfill after the deploy    | The four hazards in §10                                          |

## Not done in this turn

A mail composer that enters kind and amount; a new E3 approval kind; a change
to the default permission matrix; statistics by number of quotations.

## Consequences and known debts

- The contract book and the deal screen define "overdue" one day apart for an
  instalment due today.
- The journey screen still sends instalments without a `contract.view` check.
  This was so before this turn.
- `opportunity.service.ts` and `opportunity.repository.ts` are over the file
  length ceiling. This was so before this turn.
- Several kind-less pending negotiations can stand side by side after gap or
  mail rounds (open question 90).

## Rollout

Not shipped. Migration `0104` is not applied to production, the API is not
deployed, nothing is committed. Order when shipping: §10.
