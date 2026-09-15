# 0029 · Module 4 deliberately skips a product catalog, contract cancellation, and server-side PDF generation

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§9 · Cố ý KHÔNG làm"

## Context

Five things module 4 could plausibly include were considered and rejected on
purpose, each for a distinct reason, and are worth recording so nobody
re-proposes them without reading why they were dropped.

## Decision

- **No product catalog.** The company sells project-based solutions ("Factory
  MES + One Plus"), no SKUs, no inventory. Line items are free-text
  description. Building a catalog now is building a table for something
  nobody has asked for.
- **No cancelling a signature, no editing a signed contract.** Signing is
  something that has already passed to accounting's hands and the customer's
  hands; undoing it must be a proposal someone approves (E3), not a direct
  call from whoever just made a mistake. This is the existing rule, unchanged.
- **No server-side PDF generation, no dedicated attachment store.** Debt #12
  is waiting on AWS; opening a temporary store in this module is adding one
  more thing to clean up later.
- **No sales order, delivery, acceptance, or real payment collection.** Those
  belong to module 5 and Finance.
- **No backfilled money for the 6 old contracts.** They stay NULL. Real
  revenue flows from the first real signing date forward, not retroactively.

## Consequences

None recorded — these are scope exclusions, not commitments with follow-on
work.
