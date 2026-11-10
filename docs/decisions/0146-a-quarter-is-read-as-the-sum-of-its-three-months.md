# 0146 · A quarter is read as the sum of its three months; targets and close stay monthly

Status: accepted (10/11/2026; canvas https://claude.ai/artifact/QtAWBFmapBYMYSiKqF7RkA; refines 0082, which refuses quarter keys)

## Context

B2B deals close slowly, so a monthly `signed-value` target is noisy. 0082 refuses quarter keys, and wave 4 planned
quarter periods.

## Proposal

A "Tháng | Quý" switch on the KPI screens.

1. Quarter value of an additive metric = sum of the three month values (closed months use their frozen value).
2. Quarter target = sum of the three month targets.
3. Pace = share of the quarter's days gone.
4. Non-additive metrics show no quarter figure.
5. Targets, the assignment deadlines of 0120, month close, alerts and month verdicts are unchanged. Nothing new to
   approve.

## Decision

Owner's answers of 10/11/2026 to open questions 175 to 178; the Proposal above stands with these four:

1. A month without a target: the quarter target reads "Chưa đặt"; no partial sum.
2. Ratio, duration and snapshot metrics have no quarter figure in v1: "Chỉ xem theo tháng", with a link back to the month
   view. Additive means the existing `isCumulative` rule in `packages/contracts/src/sales/kpi.ts`.
3. Whoever sees the month view sees the quarter (same `kpi.view` door).
4. Alerts and month verdicts stay monthly; the quarter verdict is display-only.

## Consequences

Being built (not shipped as of 10/11/2026): read-only endpoint `GET /sales/kpi/quarters/:quarter/me` (`kpi.view`,
contract `packages/contracts/src/sales/kpi-quarter.ts`) and a "Tháng | Quý" switch on the "KPI của tôi" screen only in
v1. No migration, no new period key, nothing new to approve; read-side sum only.
