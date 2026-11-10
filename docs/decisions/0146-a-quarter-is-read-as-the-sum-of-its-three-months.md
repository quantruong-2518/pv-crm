# 0146 · A quarter is read as the sum of its three months; targets and close stay monthly

Status: proposed (canvas https://claude.ai/artifact/QtAWBFmapBYMYSiKqF7RkA awaiting the owner; refines 0082, which refuses quarter keys)

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

## Open (owner questions, recommended answer first)

See open questions: a month without a target; ratio and duration metrics; who sees it; alerts and verdicts.

## Consequences

If accepted: no new period key and no migration expected; read-side sum only. Not built.
