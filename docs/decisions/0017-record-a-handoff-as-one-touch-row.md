# 0017 · Record a handoff (`giao`) as one `touch` row with four columns, not two rows

Status: accepted
Source: docs/tam-nhin-pipeline-toan-he.md §8, item 4

## Context

One of eight open questions in the pipeline vision: does a handoff (`giao`,
transferring a lead between salespeople) write one row or two into
`sales.touch`?

## Decision

**One row**, carrying both ends in four new `sales.touch` columns
(`from_actor_id`/`from_name` · `to_actor_id`/`to_name`, migration `0033`).

## Consequences

Two rows would count one event as two in every touch-count metric, and both
rows would carry the same `at` (Postgres freezes `now()` per transaction), so
no ordering could be read between them. "Always two rows" also breaks at the
two most common moves: receiving from the shared pool has no previous person,
returning to the shared pool has no next person. `by` is neither end either —
when a manager transfers a lead between two salespeople, the manager is a
third party. The full reasoning sits next to the column, in `touch.schema.ts`.
