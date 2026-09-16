# 0018 · Opportunity module decisions — `state`/`stage` split, permission split, five screen defaults

Status: accepted
Source: docs/ban-giao-co-hoi.md — sections "`state` and `stage` are TWO
columns, not one", "Endpoint", and "Five decisions still pending" (ratified in
section "Round three · 29/08/2026")

## Context

Building the Opportunity module (`sales.opportunity`), the point in the
handover doc most likely to be misread.

## Decision

`state` and `stage` are two separate columns on `sales.opportunity`:

- `state` — what the salesperson is DOING RIGHT NOW. Four values:
  `gui-quotation` · `nego` · `close-lost` · `pending`. **No `close-won`** —
  "won" is a row on the `contract` side, inferred, never stored.
- `stage` — which COLUMN the deal sits in. Five columns.

The five states only map onto THREE of the five columns; `moi` and `da-demo`
have no state pointing at them. So `stage` **cannot be derived** from `state`,
and a `GENERATED` column would wipe out the column for every currently-open
deal in those two stages. On create, `stage` takes its initial value from
`stageOfState`; after that the two columns are free to diverge, legitimately.

`stage_since` is only touched when the column actually changes — renaming a
deal and also bumping the clock would make every deal read as "just entered
this column", and the staleness signal would never fire again.

Write access requires `opportunity.edit`, **not** `opportunity.close`: opening
a deal can be undone by closing it, signing cannot. Folding sign into `edit`
would mean giving a business-development rep who can open deals the power to
sign them too.

**Five decisions, ratified 29/08 with the defaults below — the project owner
approved both the sketch and all five defaults, nothing changed since:**

1. **The Win button sits in `ToolsBar`**, not next to the form's Save button —
   signing is not saving.
2. **`OP_SPEC` drops the `motion` field** — the server has no such column, so
   an `OP_SPEC` field that does nothing is not shown.
3. **A signed deal must print its contract code**; `OpportunityRow` carries
   `contractCode`, sourced from a single `LEFT JOIN` in
   `OpportunityRepository.signed()` so the "signed" flag and its code can
   never drift apart.
4. **The sign button only shows for roles holding `opportunity.close`** —
   fully hidden for presales, never shown-then-disabled.
5. **`ActivityCard` on the deal profile reads the DEAL's touches; on the lead
   profile it reads the LEAD's** — the two timelines are never merged.

## Consequences (added 16/09/2026 — `close-won` confirmed out of `state`)

The project owner reconfirmed the "no `close-won`" ruling above rather than
reopening it. Source: project owner's decision in session ·
`crm_workstream_v2.pdf`.

**The database has never accepted `close-won`; only zod has.**
`apps/api/drizzle/0008_opportunity_columns.sql` carries
`CHECK ("state" IN ('gui-quotation','nego','close-lost','pending'))` — four
values, matching this ADR — while `packages/contracts/src/sales/opportunity.ts`
declares a five-value zod enum that also lists `close-won`. The drift is
zod-only. No data migration is needed to remove it: no row has ever been
allowed to hold that value.

**Measured surface to remove:** 36 lines across 15 files, in four zones —
`@pv/contracts` (heaviest: `sales/opportunity.ts`, 8 lines; also
`sales/contract.ts`, 4 lines), `apps/web` (heaviest: `data/opportunities-write.ts`,
5 lines), `apps/api` (heaviest: `opportunity.repository.ts` and
`opportunity.mapper.ts`, 3 lines each, plus `opportunity.controller.ts`,
`opportunity.schema.ts`, `opportunity.service.ts`,
`opportunity-import.check.ts`, `seed.ts`), and `packages/engines`
(`fixtures/das-vina.ts` and `fixtures/opportunities.test.ts` — the latter a
fixture number-lock, the one kind of self-written test this repo mandates).

**`winReason` has nowhere to live on `opportunity`** if won is not a stored
state on that table — it belongs on the contract side, where "won" already
lives as an inferred fact.
