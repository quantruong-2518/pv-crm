# 0062 · A run's `stand` becomes five stored columns owned by triggers, scoped back down for `ownOnly` readers

Status: accepted (builds on 0058's stored lead state; the Vietnamese enum value
it accepts is debt owed to 0012)
Source: project owner's decisions in session, 20/09/2026, taken while the
journey book's kanban board view was being built

## Context

"Where is this run standing right now" was computed in JavaScript, after
paging: `liveOf`/`standOf` in
`apps/api/src/branches/sales/workstream/workstream.mapper.ts` derive it from the
rows the page already fetched. SQL therefore cannot filter or count by it. A
table view survives that; a kanban board does not — the number on each column
header has to be the number for the whole book, not the number for the page in
front of you.

Two further facts about the computed `stand` decided the shape of the fix.
`WorkstreamService.rowsOf` filters deals through `visibleDeals` _before_
`liveOf` runs, so the `stand` on the wire today is already per-reader. And
between `insertOpened` opening a run and the anchoring lead being written,
there is a window in which no honest code exists to store.

> Amendment 21/09/2026: any statement here that the tier-based rung copy
> (`stateByTier`) lives in SQL is no longer true — the `nurturing` rung is now
> read from touches, not from the tier; see 0063 and migration 0058.

## Decision

### 1 · `stand` is materialized, and plpgsql owns it

Five columns on `sales.workstream` — `stand_kind`, `stand_key`, `stand_code`,
`stand_lead_key`, `stand_due_at` — are computed by `sales.workstream_stand()`
and written by triggers on the source tables. `stand_due_at` is the deadline of
the rung the run is standing on, its `limit_days` read from `config_entry`; it
exists so the first rung of the priority ladder can be an `ORDER BY` term
instead of a per-page sort. Migration
`apps/api/drizzle/0056_workstream_stand.sql`; the function and its triggers are
the definition, so this ADR does not restate them.

The price, accepted knowingly:

- This is **one truth in two books**, on purpose. The rung definition now lives
  in plpgsql, not in TypeScript, and the mapper's version must be kept from
  drifting away from it by hand — no compiler joins the two.
- `sales.touch` is the hottest write path in the system. The trigger on it has
  an early exit to keep it where it was. Measured on PGlite/WASM against a
  22-row book: 0.065 ms unchanged on the ordinary path, ~1.07 ms in the worst
  case (a lead that has left the spine). Read those as a **ratio**, not as Neon
  latency — the engine is not the one production runs on.

### 2 · `stand_kind` keeps the three existing codes, one of them Vietnamese

`stand_kind` stores `'LD'` · `'OP'` · `'HĐ'` — so a Vietnamese character sits
inside a Postgres `CHECK` constraint. That **breaks the repo's code rule 2**
(enum values are English because they travel into stack traces, JSON, URLs and
`CHECK` constraints; `CLAUDE.md`). The owner chose it anyway so that one concept
does not acquire two spellings: `WorkstreamStandKind` in
`packages/contracts/src/sales/workstream.ts` has carried those three codes since
before this change.

Recorded here as **debt accepted, not debt denied**. It is paid where the rest
of it is paid:
`docs/decisions/0012-rename-vietnamese-identifiers-in-six-batches.md`.

### 3 · The permission hole between an objective column and a per-reader `stand` is closed

The stored columns are objective; the `stand` on the wire today is per-reader.
Left alone, a reader with `ownOnly` who holds the lead but whose colleague holds
the deal would see the card sitting in the ladder column of a deal they may not
open — the **card's position** leaks "customer X has a deal at `quoted`", even
though the deal's code, owner and money all stay hidden.

The real width is **one seat**: `sale` is the only role carrying `ownOnly` that
also keeps `workstream.view` (`apps/api/src/staff.ts`). The six other roles with
`workstream.view` are not `ownOnly`.

Decision: **close it**. The repository builds a CASE expression — if an
`ownOnly` reader is not named in `opportunity_owner` for the very deal at
`stand_code`, the card falls back to `('LD', stand_lead_key)`, which is exactly
where the table view already prints it. `stand_lead_key` exists precisely so
that fallback does not need a third definition of the rung to compute itself.

Price: for an `ownOnly` reader, `workstream_stand_idx` becomes a full index scan
with a Filter. Measured on PGlite/WASM against the same 22-row book: the planner
still uses the index, the subquery is hoisted into a hashed SubPlan, 0.509 ms.

### 4 · `stand_code` is NOT NULL at COMMIT, not at the column

A column-level `NOT NULL` would refuse the intake door outright, because of the
window named in Context. Postgres has no deferrable `CHECK`, so the rule is a
`CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` raising the same SQLSTATE
a `NOT NULL` would (`23502`). A committed row missing `stand_code` is
impossible; an open transaction holding one for a moment is fine.

### 5 · No trigger goes on a `platform.*` table, and two ladder rungs pay for it

The priority ladder has four rungs (`WORKSTREAM_PRIORITY_LADDER` in
`packages/engines/src/workstream-priority.ts`). Only two of them got a column.

Rung 2, `waitingOverdue`, reads `platform.approval`. Owner's decision:
**refused** — "platform does not know which branch it serves" holds inside the
database too, the one place no lint reaches. Price accepted: the rung is lost
as a sort term.

Rung 3, `lastContactedAt`, was dropped for a different reason and it is worth
recording. A column for it would have to leave mail out, and then the book
would be ordered by one number while `footprint.lastContactedAt` printed on the
same card still counts mail — a server contradicting its own screen costs more
than a rung of a ladder.

**The ladder still declares all four rungs at `@pv/engines`**: the law did not
change, only what the database can answer. A `sort` key the repository cannot
translate is refused at the door rather than answered in the wrong order
(`workstream.controller.ts`), so `sort=priority` today means: deadline of the
rung being stood on (whole calendar days) → open longest.

## Consequences

- `apps/api/src/branches/sales/workstream/workstream.repository.ts` can now
  filter and count by stand in SQL, which is what makes whole-book column counts
  on the board possible at all.
- Migration `0056_workstream_stand.sql` is **not re-runnable** (`CREATE
FUNCTION`, not `OR REPLACE`), and it must land **before** the board code when
  shipping.
- What `0056` adds, in full: 5 columns, 7 functions, 8 triggers — and **every
  trigger stands on a `sales` table**, which is §5 holding in the schema.

## Nobody has paid for these yet

- The `stand_*` columns change value **leaving no audit row**. The triggers
  write straight through — not via E2, not through `sales.touch`. Mitigation:
  they are derived, and every source table already keeps its own trace, so the
  trail survives, just indirectly.
- The `config_entry` ↔ ladder-key pairing by ordinal position now exists in
  **two copies**: `sales.ladder_limit_days()` in the migration and
  `ladderConfigOf()` in `apps/api/src/branches/sales/ladder.ts`. The way out is
  the one that docblock already names: the day `config_entry` carries the
  phase's slug, both collapse into one lookup.
- Two of the new CHECKs accept all eight `LeadState` values (ADR 0058) while the
  trigger only ever writes the five spine rungs. Raised, not decided.
- Two holes this change did **not** create but did expose, so they are written
  down here:
  - A deal with no `opportunity_owner` row at all is let through by E2 while
    `OpportunityRepository.scopeOf` still hides it — two definitions of "my
    deal" that disagree, and the permissive one is the fail-open one.
  - `footprint` counts across every object of a run, including deals that were
    scoped away, so a colleague's deal has been feeding contact counts and
    `lastContactedAt` into the reader's row since before this migration.
