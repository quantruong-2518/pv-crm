# 0119 · A terminated contract keeps the cash already collected; the refund is a negative row

Status: accepted (replaces 0107 §3 for the `collected-value` metric only)
Source: project owner's decision of 22/10/2026.

## Context

0107 §3 makes every KPI reading count LIVE contracts only, so a terminated contract's collected cash vanished from
`collected-value`, and from a closed month through the adjustment rows of 0115 (the gap 0115 left open).

## Decision

1. A terminated contract keeps the cash already collected, counted on its paid day.
2. The refund (`sales.contract_termination.refunded_amount`, when > 0) is a negative basis row dated at
   `terminated_at` (there is no refund-date column), tag `terminated` ("Đã chấm dứt" in the contributions list, an
   existing label).
3. `collected-value` is room scope, so the refund row is credited to the room (actor NULL).
4. `signed-value` and `overdue-receivables` keep 0107 §3: terminated contracts stay excluded.

## Worked example

Contract 100tr, 30tr paid 15/09, September closed, terminated in October with 10tr refunded: September stays 30tr,
October −10tr, no adjustment rows.

## Consequences

- On the first reconcile after deploy, each terminated contract whose collected rows were already written off as
  `vanished` (0115) gets one compensating `appeared` row in the running month. Net zero across months; per month
  only if the `vanished` row landed in the running month.
- Code: `apps/api/src/branches/sales/kpi/kpi-readings.repository.ts` (`collected-value` room basis).
- No migration.
