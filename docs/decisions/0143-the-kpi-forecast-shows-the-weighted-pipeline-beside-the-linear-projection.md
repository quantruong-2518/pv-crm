# 0143 · The KPI forecast shows the weighted pipeline beside the linear projection

Status: accepted (narrows the owner's earlier drop of a probability forecast, 0077 §3)
Source: project owner's choices in chat, 10/11/2026 (after a review of KPI against modern CRMs).

## Context

The slip/hit forecast (0098 §6) is a linear run-rate, poor for lumpy B2B contracts (0116 already flags a contract 5×
the average and 40% of a month in its last 3 days). An opportunity carries amount, currency, expected_close and a
probability typed by the seller. The owner earlier dropped a probability forecast column from the deal book (0077 §3)
and open deals from the overview's expected revenue (commit f9ffcfc4). On 10/11 the owner chose to add it narrowly,
on the KPI forecast only.

## Decision

Display only, on the KPI forecast. The slip/hit flag, the bells and the linear projection are unchanged.

## Defaults that are not the owner's

1. Only the `signed-value` metric.
2. Only the running month: null for closed and future months. Shown from day 1 even though the projection is null then.
3. Counted deals: open (`dealOpen`), probability not null, money convertible to VND (`toVndSql`), lead alive,
   expected_close from today (Vietnam) to month end. Deals whose expected_close has passed are left out.
4. Own scope credits the primary SALE lane (`opportunity_owner` role SALE, is_primary). Deals with no primary SALE
   count only in the room figure. Room scope counts each deal once.
5. Visibility: the person themself, or a reader holding `kpi.view-all` AND `opportunity.view` without own-only
   scope. This applies to the per-person read (`GET :period/forecast/people/:actorId`) and to the company forecast;
   otherwise the figure is null. A team lead or org head reading a member would otherwise see open-deal value that
   the opportunity book hides from an own-only Sale. Confirmed by the owner 10/11/2026 (open question 173): team leads and org heads do not get it.
6. Not computed in the daily alert sweep.
7. Credit differs from `signed-value` (ADR 0113): `signed-value` credits the contract's creator (`owner_id`), the
   pipeline credits the deal's primary SALE lane. When someone else creates the contract, the money moves from one
   person's pipeline to another's signed value. Accepted for a display-only figure.

## Amendment 10/11/2026 · §5 holds on every door, and the rule is exact

Owner approved the KPI read holes H1 to H3 of the 10/11 review. The rule lives
in `pipelineSight` (`apps/api/src/branches/sales/kpi/kpi-forecast-sight.ts`):

- Own-scope metric: the person sees their own pipeline; another person's needs
  `kpi.view-all` + `opportunity.view` + not own-only.
- Room-scope metric: needs `opportunity.view` + not own-only, plus
  `kpi.view-all` unless it is the reader's own seat.
- null means "not shown to you" and is never drawn as 0.

Doors that follow it: `forecast`, `forecast/me` and
`forecast/people/:actorId` (`kpi.controller.ts`, `kpi-forecast.service.ts`). The
daily alert sweep gets null.

Same review, the other two holes (`apps/api/src/branches/sales/kpi/`):

- H1: `GET :period/company`, the company screen and its nav entry need
  `kpi.view-all` (was `performance.view`). So do the whole-book figures on
  `GET :period/assignments/:role`.
- H2: `GET :period/targets` and the role-target history (no `actorId`) need
  `kpi.view-all`.

Behaviour note for the release: a holder of `performance.view` without
`kpi.view-all` loses the company KPI screen and its nav entry.

Open: questions 179 to 182. Debt: `docs/status.md`.

## Consequences

- `KpiForecast.pipeline` in the contracts. No migration.
- Ship the API before the web.
