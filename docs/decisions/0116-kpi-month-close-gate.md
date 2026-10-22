# 0116 · Before a month closes, a gate lists what is still pending and what looks unusual

Status: accepted (extends 0100 §C2 and its default on the waiting-reasons count in the close dialog)
Source: project owner's decisions of 22/10/2026 (KPI plan wave 1b): a gate before "Chốt tháng" that lists pending
work and flags spikes at 5× and 40%; closing stays allowed. Migration 0137.

## Context

"Chốt tháng" (0100 §C2) freezes a month for good, and since 0115 later changes become adjustments. The dialog shows
only the count of overdue reasons waiting. A head can close a month with packages unapproved, counters unanswered or
one contract that dwarfs everything else, and nobody sees it afterwards.

## Decision

1. **Pending work** for the month, counted and listed with links: overdue reasons waiting for a decision; counters
   still open; packages (room or team tier) sent but not decided, returned and not resent, and drafts never sent;
   role targets proposed but not agreed.
2. **Unusual figures**, as flags, never blocks:
   - a contract signed in the month whose value is more than **5×** the average value of every contract signed
     before that month (needs at least one earlier contract);
   - a person whose month signed value has more than **40%** in the last **3** Vietnam days of the month.
     Both use live contracts only (terminated excluded, lead alive), the same rule as `signed-value`.
3. **Closing stays allowed** with anything listed. The dialog asks for nothing extra; it shows the list above the
   button. Whatever the gate showed at the moment of closing is stored with the close (snapshot), and the closed
   month shows it as "Lúc chốt còn …". The snapshot is served only through the gate read, never on the KPI cards
   every reader opens; it is computed apart from the close, so a failure stores no snapshot but never stops it.
4. Who sees what: the gate is read by `kpi.set-target` holders (they close); overdue reasons appear only to holders
   of `contract.approve-overdue-reason`, as today.

## Defaults that are not the owner's

1. "Average of every contract signed before that month": no window, so no extra threshold is invented.
2. The 40% rule runs per person with at least one signed contract that month, not for the room.
3. The snapshot stores counts and the flagged codes, not the full lists; its overdue-reason count is the full
   count, shown only to approvers.
4. Each pending list on the gate shows at most 5 rows (a phone screen); the counts and the flag lists are full.

## Consequences

- Migration 0137 adds `sales.kpi_month_close.gate` (jsonb, nullable; null for months closed before it).
- New read `GET /sales/kpi/:period/close-gate` (`kpi.set-target`).
