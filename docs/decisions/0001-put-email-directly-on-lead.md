# 0001 · Email sits directly on `lead`, no separate `contact` table

Status: superseded by 0002
Source: docs/ban-giao-db.md — table "Seven decisions locked in", row #1

## Context

One of seven decisions that locked in the main flow of the data schema as of
26/08/2026 (`docs/ban-giao-db.md`, section "Main flow — re-locked, DIFFERENT <!--ctx:ignore-->
from the first draft"): campaigns **consume** existing leads, they do not
produce leads, and the lead book is the root of the whole chain.

## Decision

**Email sits directly on `lead`**, no `contact` split.

## Consequences

One lead = one person = one email. Much simpler; the tradeoff is that the day
one company needs several people to receive mail, that will be a migration.

## Expired

That day arrived. `packages/contracts/src/sales/contact.ts` (docblock, section
"WHY A TABLE AT ALL, WHEN DECISION #1 SAID NOT TO SPLIT ONE") records two
concrete reasons this decision's expiry date arrived: `sales.meeting_attendee`
had to describe the customer's side with a typed-in string because "there was
no book yet to point at", and `platform.email_suppression` has been operating
at PER-PERSON granularity (primary key is the address, not the lead) since the
day it was built. See ADR 0002.
