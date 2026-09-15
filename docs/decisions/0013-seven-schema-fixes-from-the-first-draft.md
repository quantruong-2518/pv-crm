# 0013 · Seven schema fixes from the first draft

Status: accepted
Source: docs/ban-giao-db.md — section "Seven places fixed from the first draft"

## Context

Recorded because each one is a real bug, not an opinion, found while building
the `sales.lead` / `campaign` / `opportunity` / `contract` schema.

## Decision

1. **`unsubscribed_at` was at the wrong level.** Unsubscribe is by EMAIL, not
   by lead — a landing page submitted twice creates two leads sharing one
   email, and unsubscribing lead A would still let lead B get mailed. Moved to
   its own `suppression` table.
2. **`days_here` was a number that changes over time, stored as a column
   anyway.** Replaced with `stage_since`, computed at read time. Once a lead
   has exited, the clock stops at `exited_at`.
3. **Dropping `contract_code` broke `running`.** The new definition asks the
   `contract` table directly, through `lead_code`.
4. **`required_filled`/`optional_filled` became double denormalization** once
   the 20 profile fields became real columns. Changed to `GENERATED … STORED`.
5. **No landing-page dedup rule existed yet.** Added a conditional unique
   index — a customer who dropped out of the funnel last year and returns this
   year is still a valid new lead.
6. **"Empty" had three conventions** (debt #5). The table locked in one:
   `NULL`, and a `CHECK` rejects `''`.
7. **`source` had to be nullable.** A lead that walks in directly belongs to
   no campaign; making up a source code to fill the column would invent a
   source that is not in the source book. The Performance screen needs a
   **"No source"** group.
