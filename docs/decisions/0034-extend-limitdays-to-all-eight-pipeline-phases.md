# 0034 · `limitDays` moves into `config_entry` for all eight pipeline phases, not only the three opportunity `STAGE` columns; the schema `CHECK` is loosened accordingly

Status: partially superseded by 0057 (ADR 0015 rule 2 suspended outside the
five opportunity stages; this extension is paused there until the owner lifts
the suspension) and by 0058 (the lead's own status stops riding this file's
`phase` field — a lead now has its own stored lifecycle state; the `phase`
field itself, and `pipeline_position` more broadly, are untouched)
Source: docs/tam-nhin-pipeline.md — "§6 · Hình cuối — `pipeline_position`"
(the `limitDays`/`config_entry` paragraph)

## Context

`pipeline_position` (a pure, read-time function — decided in ADR 0015, same
source section) needs an `overdueBy` figure for whichever phase an object is
currently in. Today `limitDays` only exists for the three opportunity `STAGE`
columns, guarded by `config.schema.ts:84`'s `CHECK config_limit_only_stage`
("only `STAGE` may carry `limitDays`").

## Decision

`limitDays` moves out of the fixture and into `config_entry` for **all eight
phases**, not only the three opportunity columns. This requires loosening
`config_limit_only_stage` to allow `limitDays` on entries beyond `STAGE` — a
deliberate, one-line widening of that constraint, not a workaround slipped
past it.

A single endpoint, `GET /sales/leads/:code/position`, returns:

```
{ phase, state, holder, waitingOn, overdueBy }
```

| Field       | Computed from                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`     | P6 if `EXISTS(contract)` · P5 if `EXISTS(quote)` · P4 if there's an open deal · P3 if `tier ≠ dau-moi` and not dropped · P2 otherwise     |
| `state`     | that phase's own state, read straight from its own state machine                                                                          |
| `holder`    | `lead.owner_id`, switching to `opportunity.owners[SALE]` from P4 onward                                                                   |
| `waitingOn` | the first still-`waiting` `approval_link` pointing at this code → person + deadline. `null` if none, and the answer defaults to `holder`. |
| `overdueBy` | `daysHere − config_entry.limitDays` for the current phase                                                                                 |

The lead ledger, lead profile, Home, and Performance all read this **one
answer** — no screen re-derives it independently.

## Consequences

None recorded beyond the constraint widening itself.
