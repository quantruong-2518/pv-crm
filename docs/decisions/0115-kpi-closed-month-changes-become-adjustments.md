# 0115 · A closed month never moves: later changes to its records become adjustments in the open month

Status: accepted (completes 0100 §C2 for the records behind a closed month)
Source: project owner's decision of 22/10/2026 (KPI plan wave 1a): a date that falls in a closed month is still
recorded as it really is; the system writes the difference as an adjustment. Migration 0136.

## Context

0100 §C2 freezes a month's card values (`kpi_month_value`). Nothing else knows a month is closed: a payment
back-dated into it, a sign request approved after the close (its `signedAt` set at raise), a contract terminated,
a lead switched off or on, a deal's BD lane moved — each changes the records behind the frozen totals. Today the
card stays frozen while the contribution list and weekly series drift, and the open month never sees the change:
a September contract terminated in October stays in September and is subtracted nowhere. Every metric is already a
basis of uniform rows `(actor_id, kind, code, at, value, tag)` folded by a total (`kpi-readings.repository.ts`).

## Decision

1. **Freeze the basis, not only the totals.** Closing a month also stores every basis row of every seat it froze
   (`sales.kpi_month_basis`), in the same transaction as the values.
2. **Reconcile by difference.** A pass compares, per closed month and seat series, the live basis with the frozen
   basis plus the adjustments already written for that month, keyed by (series, actor, code). What is left is
   written to `sales.kpi_adjustment`: source month, the month it applies to (the running Vietnam month when found),
   series, actor, record code, signed delta, and why (`appeared` · `vanished` · `changed`). The pass is idempotent:
   a second run with nothing new writes nothing. It runs in the daily KPI sweep and right after a close.
3. **Only additive series are adjusted:** totals that are a count or a sum of the basis, except the overdue
   snapshot (0100 §C1 keeps its own rule). Shares and medians (win rate, accept rate, response hours, lag days,
   turnaround) are not adjusted: a closed month keeps its frozen figure and the change is listed only.
4. **Reading.** The running month's figure = live + adjustments applied to it, and its contribution list shows
   each adjustment as its own row naming the source month. A closed month shows its frozen figure and, beside it,
   "after adjustments" (frozen + adjustments whose source is that month); its contribution list and weekly series
   read the frozen basis, no longer live.
5. Nothing is edited or deleted in a closed month; adjustments are append-only.

## Defaults that are not the owner's

1. Months closed before migration 0136 have no frozen basis: they are not reconciled (no backfill from today's data,
   which may already have drifted).
2. An adjustment applies to the running month even when an earlier ended month is still unclosed.
3. Manual correction requests (a wrong signing date or closer) are a later slice; today those fields have no edit
   door after signing.
4. No bell when an adjustment is written; the figures and lists show it.

## Consequences

- Migration 0136: `sales.kpi_month_basis`, `sales.kpi_adjustment` (additive).
- `kpi_month_value` stays the card's frozen source; the basis table serves lists and the reconcile pass.
- Known gap kept open: a terminated contract's kept cash is dropped from `collected-value` (0107 §2); not this slice. Closed by 0119.
