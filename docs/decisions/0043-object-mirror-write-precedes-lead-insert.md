# 0043 · `platform.object` mirror row must be written before `sales.lead`, in one transaction

Status: accepted
Source: docs/ban-giao-lead.md — section "Khoá ngoại `code → platform.object` là bất biến số một"

## Context

Migration `0002` (lead write foundation) adds `sales.lead_code_seq` (START
201, clear of the fixture's `LD-0101…0200` range) and
`LeadRepository.nextCode()`, generating `LD-%04d`.

## Decision

The code column carries **no `DEFAULT`**. The mirror row in
`platform.object` must be written **before** `sales.lead` — meaning the
caller has to know the code before the INSERT happens. Keeping a `DEFAULT`
would require the foreign key to be `DEFERRABLE`, weakening a constraint in
exchange for convenience.

`sales.lead.code` carries a foreign key into `platform.object(code)`.
Without it, an endpoint that writes a lead but forgets the mirror row
produces a lead that is valid, queryable, listed in the book — and invisible
to `E1.story()`. `ContextRail` stays empty, rule 10 breaks, and nothing turns
red anywhere. Postgres now refuses this outright.

## Consequences

The price is a **permanent ordering obligation** on every writer, including
`seed.ts`: write `platform.object` FIRST, `sales.lead` SECOND, inside **one**
transaction. `ObjectMirror`
(`apps/api/src/branches/sales/platform/graph/object-mirror.ts`) is the one
place that does this, and it **deliberately does not open its own
transaction** — the caller holds it.
