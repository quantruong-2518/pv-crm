# 0120 · KPI targets flow down the org tree from 12/2026: each head assigns the level below, people confirm, late levels get last month's figure

Status: proposed (wave 2b of the KPI plan; for months from 2026-12 it replaces the approval parts of 0082 §5, 0098
and 0101)
Source: project owner's decisions of 22/10/2026 (Q1–Q4, Q10, Q11 at their defaults) and 26/10/2026 (a fixed
cutover month; units receive per role; a late level gets last month's target). The defaults page that held the
wording of Q3, Q10 and Q11 can no longer be opened; what this ADR takes from them is listed under the last heading.

## Context

Today a month's targets go through two approvals: a setter proposes role targets and another setter agrees
(0082 §5), then a package is drafted, sent, decided by a second setter, acknowledged or countered (0098, 0101). The
owner sees two rounds for one number. 0118 gave every level of the company one head; this ADR lets each head hand
the number down instead. The trace of 26/10 found no month-model flag after 2a, and December still open to the old
doors (an old December package sent now would also move the tree floor to 2027-01).

## Decision

1. **Cutover is a constant, not a table.** `TIERED_FROM = '2026-12'`. A month at or after it is tiered: every old
   write door (`targets` propose/agree, `allocations` draft/submit/decide/acknowledge/counters, counter resolve,
   team allocation doors, the internal `reissue`) answers 409 `kpi-month-tiered`; every new door answers 409 for an
   earlier month. This drops `sales.kpi_org_month` from PLAN 2a and closes the December gap before 2b ships.
2. **One set per unit, role and month.** `sales.kpi_assignment` (period, role, unit, version, status `draft |
sent | superseded`, `by_default`, sent by/at) holds what the head of a unit hands down; at most one live set per
   (period, role, unit). Its lines (`sales.kpi_assignment_line`, per metric) go to each child unit whose subtree
   holds someone with that role, and to each direct member holding it. The company's set also carries the company
   total. A unit holding BD and Sale people gets one set per role.
3. **Who assigns, and by when** (days of month P−1, Asia/Ho_Chi_Minh, end of day): the company head sends the
   company set by the 20th, department heads by the 23rd, team heads by the 25th, each person confirms their own
   lines by the 28th. A level can send only once the set above it is sent. No second approver (Q1): sending is final.
4. **Sums.** An additive metric is an `own`-scope `count` or `money` metric where higher is better. Its lines must
   add up to at least what the unit received, or the send is refused (400 `assignment-below-received`, like any bad input); above 120% of it the door answers with
   a warning and still sends (Q2). Every other `own` metric (ratio, hours, days, lower-is-better) is not split:
   each line carries the assigner's level, read-only (Q3 as recorded in PLAN). A `room`-scope metric measures the
   whole book, so it is set once as a `total` line in the company set and never handed down; that is how the
   director and head-of-sales roles get their targets in a tiered month.
5. **Changes after sending** make a new version. A head may resend only while no set below it has been sent; a
   resend clears the confirmations of the lines whose value changed. People cannot counter a tiered line.
6. **Late levels.** A daily sweep, comparing "day ≥ deadline + 1" with idempotent keys (the old sweep's day-equality
   and in-memory throttle could skip a day), writes each missing set as `sent` with `by_default`, top level first in
   one run. A person line is that person's target of the month before (December reads November's personal line,
   else role target, through the old `targetSources`; later months read the previous set's line); a unit line is
   the sum of its people's; a `total` line is the sum of the set's lines; nothing found means 0. Non-additive lines
   copy the previous level as in §4. An unsent draft at the deadline is that same row: its lines are replaced by
   the default ones and it is sent in place. A default set is not held to §4's sum rule; the page flags it. The bell
   `kpi-assignment-late` goes to the head one level up; for the company head, to the target setters. A person who
   has not confirmed by the 28th is shown "mặc định nhận" (the 0114 flag), not confirmed.
7. **Seat and stand-in.** The head of a unit acts for its set. Away (0117) → the stand-in, else the heads above
   (`headsOver`, a pure walk over the tree version, in the platform org module), else the setters. Bells to a seat
   use the same walk. A head reads every person in their subtree for months the tree covers, even holding only
   `kpi.view`. A setter may still declare someone else away and name themselves (1c),
   which now hands them that head's set, so the person declared away is told at once by the bell
   `kpi-away-declared` (owner 26/10); declaring oneself rings nothing new.
8. **Reading targets.** For a tiered month a person's target is their line in the live sent set; role targets are
   ignored. Months before the cutover keep today's `targetSources` untouched, so October and November figures cannot
   move (a closed month does not freeze targets, so this branch is the only guard).
9. **Close gate and tree floor.** The gate counts sets not sent, sets sent by default and people not confirmed;
   these keys are optional in the stored snapshot so October's snapshot still parses. The tree floor (0118 §5) also
   counts sent sets.
10. **Bells:** `kpi-assignment-received` (to the head of the receiving unit, or the person),
    `kpi-assignment-late` and `kpi-away-declared` (§7). Both CHECK lists are rebuilt from the newest migration that touched them.
11. **Two holes in the old doors are closed here**, since old months keep using them: the acknowledgement door writes
    its audit row like the allocation door does, and the room counter-resolve door refuses a team-tier counter.

## Defaults that are not the owner's

- Ratio and duration metrics are not split (taken from PLAN and the 20/10 canvas notes, not from the Q3 wording).
- Q10 (the closer earns the commission, 0110) is left to slice 2d; Q11 is read as the cutover month.
- People confirm but cannot counter; a resend is locked once a level below has sent.
- A missing previous figure is 0 with the flag, not a guess.

## Consequences

- Migration 0150 (additive): the two tables, their CHECKs and the two bell kinds. No old row changes.
- The old screens stay for months before the cutover until slice 2e removes them.
