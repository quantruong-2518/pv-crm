# 0117 · A person away names a stand-in for their KPI work; one rule decides who acts on every waiting item

Status: accepted (generalises 0101 default 16; fixes the bells 0112 sends to a lead who cannot act)
Source: project owner's decisions of 22/10/2026 (KPI plan wave 1c): the person away declares a date range and a
stand-in; the director or head of sales may declare it for someone else; with nobody declared, the work goes to the
target setters; KPI waiting items only, E3 approvals later. Migration 0138.

## Context

The only stand-in today is 0101 default 16 (a locked team lead → any `kpi.set-target` holder), copied in two places
(`actsFor` for the doors, `answeringLead` for the bells). "Away" does not exist. Bells for a team's share and a
returned team package go to a locked lead and are dropped, and no list shows them; a counter bell stays with the lead
it was filed under; a set-target holder who is away still receives every bell and can be the only possible approver.

## Decision

1. **Absence.** `sales.kpi_absence`: who, from day, to day (Vietnam days, inclusive), stand-in, declared by, when,
   cancelled at. The person declares their own; a `kpi.set-target` holder may declare or cancel one for anyone. No
   two live absences of one person overlap; the start is today or later; the stand-in is active and not away on any
   of those days and is not the person.
2. **Who may stand in** is the person the seat needs: for a team lead, a member of that team or a `kpi.set-target`
   holder; for a `kpi.set-target` holder, another holder. Nobody gains a permission by standing in.
3. **One rule, `seatActors`.** For a seat (a team's lead in a month, the target setters, the sender of a package) and today: the holder if active and not away; else their declared stand-in if
   active and not away; else the target setters who are active and not away. Every door check, every bell recipient
   and every web waiting list for KPI items reads this rule; the two copies of default 16 go.
4. **Bells.** When an absence starts (or an account is locked), the acting person gets one bell naming whom they
   stand in for and how many items wait. Items filed before keep their own bell history; the waiting lists move.
5. Pool items (agree a role target, decide a package, settle a room counter, close a month) keep the two-person
   rule; an away holder drops out of the pool and its bells, and its doors answer 409.
6. The stand-in is checked again whenever a seat is resolved: for a team lead, only a member of that team in that
   month's roster or a target setter; for a package's sender, only a target setter; otherwise the seat falls to the
   setters. Reading a team page follows the same seat: the roster lead keeps it while away, and whoever acts for
   the lead today reads it too; the person, contributions and history reads use the same rule.

## Defaults that are not the owner's

1. An absence does not extend the person's own answer deadline on a target line.
2. A cancelled absence ends at once; the waiting lists move back.
3. The stand-in bell is "important" (it pops up).
4. Past absences cannot be declared; the end day of an absence can be moved, never before today or its start.
5. "Target setter" means a holder of both `kpi.set-target` and `kpi.view-all`, as for the KPI bells since 0112.
6. A member standing in for the lead may set every line of the team draft, the lead's included, and counter
   their own; a setter still agrees the package, as with a lead. The lead's own counter goes to the setters.
7. Someone who holds no KPI seat may declare an absence; it rings nobody while nothing waits on them.

## Consequences

- Migration 0138: `sales.kpi_absence`; bell kind `kpi-stand-in` added to both kind CHECKs (0137's list + 1).
- The team roster read reports `actingFor` (who acts for the lead today) instead of `leadLocked`.
- E3 approvals (sign requests, config changes) are not covered; a later slice.
- Known gap: overdue-reason approval (door and bell live in the contract module, which the KPI module imports)
  does not yet read absences; moving the absence and seat rule into a small shared module is the fix.
