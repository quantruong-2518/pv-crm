# 0155 · A contract's signed value may be split between up to three people; overdue debt counts for the collector

Status: accepted (owner's answers of 15/11/2026, open questions 187, 188 and 196; slice 2d of the KPI plan; keeps
ADR 0110 and 0113 — the closer still owns the contract and earns the commission)

## Context

`signed-value` credits the whole contract to `sales.contract.owner_id`. Deals closed by two or three sellers together
can only name one. The KPI overdue guardrail reads `owner_id` too, although the person who chases the money is the
collector (`collector_id`, decided 22/10/2026). In code today the only per-person money figure is `signed-value`:
`collected-value` is a room metric, and won opportunities credit the deal's SALE lane, not the closer.

## Decision

1. **A split** is up to three people (closer included), shares in whole basis points summing to 10 000, each person an
   active seller. No split means 100 % to the closer, exactly as today.
2. **Who writes it:** the closer fills it in the sign drawer. A Sale's sign request carries it to the director's one
   sign approval (`SIGN_APPROVERS` unchanged); a head of sales or director who signs directly applies it at once. It
   is locked at signing: no door changes it afterwards (422).
3. **What follows it:** `signed-value` (own) and the leaderboard's signed money split by share. Every non-closer share
   is floored to whole đồng and the closer takes the remainder, so the parts always sum to the contract's value. Counts
   keep their current credit (leaderboard contract count → closer; won opportunities → SALE lane). Room totals,
   `sourced-signed-value`, the pipeline and `sales-cycle-days` are unchanged.
4. **Storage:** a credit table keyed by contract code and actor. A contract without rows reads as 100 % closer, so
   every contract signed before this ADR keeps a byte-identical basis and the reconcile of ADR 0115 writes nothing.
5. **Close gate:** a big contract lists every credited person, not one.
6. **Who opens it:** an own-only seller with a share opens that contract read-only (no edit, no payment entry); the
   KPI contribution line links to it.
7. **Overdue → collector:** `overdue-receivables` (own) credits `collector_id`, falling back to `owner_id` when it is
   null, for months from 2026-12 only. Closed months keep their frozen basis; the gate keeps the 0115 reconcile from
   writing adjustments for a rule change. The overdue reason (ADR 0100 §C1) stays written by whoever the contract
   rules allow today.

## Defaults that are not the owner's

- The leaderboard's money follows the split, so one person never sees two different "my signed value" figures.
- Shares in basis points with floor-and-remainder rounding.
- The collector rule starts at 2026-12, the first tiered month, not at the ship date.
- The closer is exempt from the active-seller rule (it comes from ADR 0113); every other credited person must be an
  active seller. A director's or head's own share lands in no own-scope metric they hold.
- A credited reader passes the same read fence as the contract book everywhere (search, after-sale, journey).
- The close gate's "big contract" test stays on the whole contract value; the row names every credited person.

## Consequences

One migration (credit table + CHECKs). Contract sign payload gains an optional `credits` list; the approval payload
carries it unchanged. Proof is a hand-computed acceptance script on PGlite (owner declined unit tests, question 197):
100 tr split 60/30/10 → 60/30/10 tr; 100 000 001 đ split 3 333/3 333/3 334 bp sums exactly; October and November
readings byte-identical before and after.
