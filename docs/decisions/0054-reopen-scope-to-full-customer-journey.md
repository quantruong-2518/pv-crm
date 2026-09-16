# 0054 · Reopen scope to the full V2 customer journey, blocks 1 through 5

Status: accepted (supersedes 0014; partially supersedes 0029 and 0030 — see
"What this leaves standing")

Source: project owner's decision in session · `crm_workstream_v2.pdf` ("CRM
master workstream V2", a 3-page diagram of the whole customer journey in five
blocks)

## Context

ADR 0014 cut scope to a Sales-only CRM and was locked 15/09/2026. This
decision reverses that cut one day later, on 16/09/2026 — worth stating
plainly, because a scope cut reversed the next day is the single most useful
fact for the next reader of either file.

The V2 workstream diagram lays the customer journey out in five blocks. Blocks
1–3 are what 0014 kept (Sales). Blocks 4 and 5 are what 0014 dropped:

- **Block 4 — customer lifecycle**: delivery → acceptance → account active.
- **Block 5 — growth**: at-risk → renewal → expansion → churn.

## Decision

**Build the whole V2 workstream, blocks 1 through 5.** Sales is no longer the
system's boundary.

This supersedes 0014's scope cut, and it partially supersedes the exclusions
in 0029 and 0030 that specifically named blocks 4 and 5:

- 0029's line "No sales order, delivery, acceptance, or real payment
  collection" — the delivery-and-acceptance half is superseded; that is block
  4 by name. Real payment collection is addressed separately, below.
- 0030's exclusions of **installed-asset tracking** (item 5) and **post-sale
  ticketing** (item 6) are superseded — both are block-5 territory (an
  installed base is what goes at-risk, gets renewed, or churns).

## What this leaves standing

- **0014's ruling that payment installments stay under Sales, "the next life
  of a contract," stands unchanged.** Reopening blocks 4–5 does not move that
  cluster; it was never in the part of 0014 being reversed.
- **0030's exclusion of invoicing and receivables (item 4) is NOT reversed
  here.** The owner has not decided invoicing is back in scope. Recording that
  as decided would be inventing a decision nobody made — it is routed to
  `open-questions.md` instead.
- 0029's exclusions unrelated to blocks 4–5 (product catalog, contract
  cancellation, server-side PDF generation, backfilled money for old
  contracts) are untouched.
- 0030's acceptance of discount approval and contract term dates, and its
  deferral of e-signature, are untouched.

## Consequences

`ObjectKind` and `Branch` in `packages/engines/src/types.ts` will need new
kinds/values for blocks 4 and 5 objects as they are designed — this ADR
records the scope reopening, not the schema for it. That design work belongs
to the agents doing it, not to this file.
